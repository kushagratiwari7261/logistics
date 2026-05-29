// src/components/JobEnquiryPage.jsx
import './JobEnquiryForm.css';
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, PenLine, Trash2, CheckCircle2, ArrowRightCircle, Eye, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const JobEnquiryPage = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [enquiryToDelete, setEnquiryToDelete] = useState(null);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Auto-clear toasts
  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => { setSuccess(null); setError(null); }, 4000);
      return () => clearTimeout(t);
    }
  }, [success, error]);

  const fetchEnquiries = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('job_enquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const enquiriesData = data || [];
      localStorage.setItem('cache_job_enquiries', JSON.stringify(enquiriesData));
      setEnquiries(enquiriesData);
    } catch (err) {
      if (err.message.includes('Failed to fetch') || !navigator.onLine) {
        window.dispatchEvent(new Event('force_offline'));
        const cached = localStorage.getItem('cache_job_enquiries');
        if (cached) setEnquiries(JSON.parse(cached));
        else setEnquiries([]);
      } else {
        console.error('Error fetching enquiries:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnquiries();

    // Listen for data updates from the form
    const handleUpdate = () => fetchEnquiries();
    window.addEventListener('enquiry_data_updated', handleUpdate);

    // Realtime subscription
    const channel = supabase
      .channel('public:job_enquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_enquiries' }, () => {
        fetchEnquiries();
      })
      .subscribe();

    return () => {
      window.removeEventListener('enquiry_data_updated', handleUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchEnquiries]);

  // Open the global enquiry form (new or edit)
  const openEnquiryForm = useCallback((enquiry = null) => {
    window.dispatchEvent(new CustomEvent('open_enquiry_form', { detail: enquiry }));
  }, []);

  // Confirm an enquiry
  const handleConfirm = useCallback(async (enquiry) => {
    try {
      const { error } = await supabase
        .from('job_enquiries')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', enquiry.id);

      if (error) throw error;
      setSuccess('Enquiry confirmed!');
      fetchEnquiries();
    } catch (err) {
      setError(err.message);
    }
  }, [fetchEnquiries]);

  // Migrate to Job Order — opens GlobalJobForm pre-populated
  const handleMigrate = useCallback(async (enquiry) => {
    // Map enquiry data to job form data based on job type
    const mappedData = {
      _jobType: enquiry.job_type,
      _tradeDirection: enquiry.trade_direction,
      _fromEnquiry: true,
      _enquiryId: enquiry.id,
      _enquiryNo: enquiry.enquiry_no,
      _activeStep: 3,
      _formData: {
        client: enquiry.customer_name || '',
        remarks: enquiry.remarks || '',
        buyingRate: enquiry.buy_freight != null ? String(enquiry.buy_freight) : '',
        sellingRate: enquiry.sell_freight != null ? String(enquiry.sell_freight) : '',
        // Map POL/POD based on job type
        ...(enquiry.job_type === 'AIR FREIGHT' ? {
          airport_of_departure: enquiry.pol || '',
          airport_of_destination: enquiry.pod || '',
          name_of_airline: enquiry.shipping_line || '',
        } : enquiry.job_type === 'TRANSPORT' ? {
          from: enquiry.pol || '',
          to: enquiry.pod || '',
        } : {
          pol: enquiry.pol || '',
          pod: enquiry.pod || '',
          sLine: enquiry.shipping_line || '',
          containerType: enquiry.container_size || '',
          commodity: enquiry.cargo || '',
          terms: enquiry.shipment_terms || '',
        }),
      },
    };

    // Open the GlobalJobForm with pre-filled data
    window.dispatchEvent(new CustomEvent('open_global_job_form', { detail: mappedData }));

    // Mark enquiry as migrated
    try {
      await supabase
        .from('job_enquiries')
        .update({ status: 'migrated', updated_at: new Date().toISOString() })
        .eq('id', enquiry.id);
      fetchEnquiries();
    } catch (err) {
      console.error('Error updating enquiry status:', err);
    }
  }, [fetchEnquiries]);

  // Delete enquiry
  const handleDelete = useCallback(async () => {
    if (!enquiryToDelete) return;
    try {
      const { error } = await supabase
        .from('job_enquiries')
        .delete()
        .eq('id', enquiryToDelete.id);

      if (error) throw error;
      setShowDeleteModal(false);
      setEnquiryToDelete(null);
      setSuccess('Enquiry deleted!');
      fetchEnquiries();
    } catch (err) {
      setError(err.message);
    }
  }, [enquiryToDelete, fetchEnquiries]);

  // Filter enquiries
  const filteredEnquiries = enquiries.filter(e => {
    const term = searchTerm.toLowerCase();
    return (
      (e.enquiry_no || '').toLowerCase().includes(term) ||
      (e.customer_name || '').toLowerCase().includes(term) ||
      (e.job_type || '').toLowerCase().includes(term) ||
      (e.pol || '').toLowerCase().includes(term) ||
      (e.pod || '').toLowerCase().includes(term) ||
      (e.status || '').toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (status) => {
    const cls = status || 'pending';
    return <span className={`enquiry-status-badge ${cls}`}>{cls}</span>;
  };

  return (
    <div className="enquiry-page-container">
      {/* Header */}
      <div className="enquiry-page-header">
        <h1>
          <span className="header-icon"><Search size={20} /></span>
          Job Enquiries
        </h1>
        <button className="enquiry-new-btn" onClick={() => openEnquiryForm()}>
          <Plus size={18} /> New Enquiry
        </button>
      </div>

      {/* Search */}
      <div className="enquiry-search-bar">
        <input
          type="text"
          className="enquiry-search-input"
          placeholder="Search enquiries by number, customer, type..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="enquiry-loading"><div className="enquiry-spinner" /></div>
      ) : filteredEnquiries.length === 0 ? (
        <div className="enquiry-table-wrapper">
          <div className="enquiry-empty-state">
            <div className="empty-icon"><Search size={28} /></div>
            <h3>No Enquiries Found</h3>
            <p>{searchTerm ? 'Try a different search term' : 'Click "New Enquiry" to create one'}</p>
          </div>
        </div>
      ) : (
        <div className="enquiry-table-wrapper">
          <table className="enquiry-table">
            <thead>
              <tr>
                <th>Enquiry No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Author</th>
                <th>Job Type</th>
                <th>Direction</th>
                <th>POL</th>
                <th>POD</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnquiries.map(enquiry => (
                <tr key={enquiry.id} onClick={() => { setSelectedEnquiry(enquiry); setShowDetailModal(true); }}>
                  <td>{enquiry.enquiry_no}</td>
                  <td>{enquiry.enquiry_date ? new Date(enquiry.enquiry_date).toLocaleDateString() : '—'}</td>
                  <td>{enquiry.customer_name || '—'}</td>
                  <td>{enquiry.created_by || '—'}</td>
                  <td>{enquiry.job_type || '—'}</td>
                  <td>{enquiry.trade_direction || '—'}</td>
                  <td>{enquiry.pol || '—'}</td>
                  <td>{enquiry.pod || '—'}</td>
                  <td>{getStatusBadge(enquiry.status)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="enquiry-actions">
                      <button className="enquiry-action-btn edit" onClick={() => openEnquiryForm(enquiry)} title="Edit">
                        <PenLine size={14} />
                      </button>
                      {enquiry.status === 'pending' && (
                        <button className="enquiry-action-btn confirm" onClick={() => handleConfirm(enquiry)} title="Confirm">
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                      {enquiry.status === 'confirmed' && (
                        <button className="enquiry-action-btn migrate" onClick={() => handleMigrate(enquiry)} title="Migrate to Job Order">
                          <ArrowRightCircle size={14} />
                        </button>
                      )}
                      <button className="enquiry-action-btn delete" onClick={() => { setEnquiryToDelete(enquiry); setShowDeleteModal(true); }} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedEnquiry && (
        <div className="enquiry-delete-modal" onClick={() => setShowDetailModal(false)}>
          <div className="enquiry-delete-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#1e40af' }}>Enquiry Details — {selectedEnquiry.enquiry_no}</h3>
              <button className="enquiry-modal-close" onClick={() => setShowDetailModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="enquiry-summary-card" style={{ borderLeftColor: '#1e40af' }}>
              <div className="enquiry-summary-grid">
                {[
                  { label: 'Enquiry No', value: selectedEnquiry.enquiry_no },
                  { label: 'Date', value: selectedEnquiry.enquiry_date },
                  { label: 'Customer', value: selectedEnquiry.customer_name },
                  { label: 'Job Type', value: selectedEnquiry.job_type },
                  { label: 'Direction', value: selectedEnquiry.trade_direction },
                  { label: 'POL', value: selectedEnquiry.pol },
                  { label: 'POD', value: selectedEnquiry.pod },
                  { label: 'Container Size', value: selectedEnquiry.container_size },
                  { label: 'Cargo', value: selectedEnquiry.cargo },
                  { label: 'Shipment Terms', value: selectedEnquiry.shipment_terms },
                  { label: 'Buy Freight', value: selectedEnquiry.buy_freight },
                  { label: 'Quote Rate', value: selectedEnquiry.quote_rate },
                  { label: 'Sell Freight', value: selectedEnquiry.sell_freight },
                  { label: 'Shipping Line', value: selectedEnquiry.shipping_line },
                  { label: 'Status', value: selectedEnquiry.status },
                  { label: 'Author', value: selectedEnquiry.created_by },
                  { label: 'Migrated Job', value: selectedEnquiry.migrated_job_no },
                  { label: 'Remarks', value: selectedEnquiry.remarks },
                ].map((item, idx) => (
                  <div key={idx} className="enquiry-summary-row">
                    <span className="label">{item.label}:</span>
                    <span className="value">{item.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {selectedEnquiry.status === 'pending' && (
                <button className="enquiry-btn enquiry-btn-confirm" onClick={() => { handleConfirm(selectedEnquiry); setShowDetailModal(false); }}>
                  <CheckCircle2 size={16} /> Confirm Enquiry
                </button>
              )}
              {selectedEnquiry.status === 'confirmed' && (
                <button className="enquiry-migrate-btn" onClick={() => { handleMigrate(selectedEnquiry); setShowDetailModal(false); }}>
                  <ArrowRightCircle size={16} /> Migrate to Job Order
                </button>
              )}
              <button className="enquiry-btn enquiry-btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="enquiry-delete-modal">
          <div className="enquiry-delete-content">
            <h3>Delete Enquiry?</h3>
            <p>Are you sure you want to delete enquiry <strong>{enquiryToDelete?.enquiry_no}</strong>? This action cannot be undone.</p>
            <div className="enquiry-delete-actions">
              <button className="enquiry-btn enquiry-btn-secondary" onClick={() => { setShowDeleteModal(false); setEnquiryToDelete(null); }}>
                Cancel
              </button>
              <button className="enquiry-btn" style={{ background: '#dc2626', color: 'white', border: 'none' }} onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {success && <div className="enquiry-toast success"><CheckCircle2 size={18} /> {success}</div>}
      {error && <div className="enquiry-toast error"><X size={18} /> {error}</div>}
    </div>
  );
};

export default JobEnquiryPage;
