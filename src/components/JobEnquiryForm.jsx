// src/components/JobEnquiryForm.jsx
import './JobEnquiryForm.css';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Minus, X, Maximize2, ArrowLeft, ArrowRight, Search, ArrowRightCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { fetchNextEnquiryNumber } from '../utils/enquiryUtils';

const ENQUIRY_JOB_TYPES = ['AIR FREIGHT', 'SEA FREIGHT', 'TRANSPORT', 'OTHERS'];
const ENQUIRY_TRADE_DIRECTIONS = {
  'AIR FREIGHT': ['EXPORT', 'IMPORT'],
  'SEA FREIGHT': ['EXPORT', 'IMPORT'],
  'TRANSPORT': ['EXPORT', 'IMPORT', 'LOCAL'],
  'OTHERS': ['EXPORT', 'IMPORT']
};
const ENQUIRY_STEPS = ['Job Type', 'Direction', 'Enquiry Details', 'Review'];

const INITIAL_ENQUIRY_DATA = {
  enquiry_no: '',
  enquiry_date: new Date().toISOString().split('T')[0],
  customer_name: '',
  pol: '',
  pod: '',
  container_size: '',
  cargo: '',
  shipment_terms: '',
  buy_freight: '',
  quote_rate: '',
  sell_freight: '',
  shipping_line: '',
  remarks: '',
};

// ─── Single Enquiry Form Window ───
const EnquiryFormWindow = ({ formConfig, onClose, onMinimize, onRestore }) => {
  const [activeStep, setActiveStep] = useState(formConfig.initialState?.activeStep || 1);
  const [maxStepReached, setMaxStepReached] = useState(formConfig.initialState?.maxStepReached || 1);
  const [jobType, setJobType] = useState(formConfig.initialState?.jobType || '');
  const [tradeDirection, setTradeDirection] = useState(formConfig.initialState?.tradeDirection || '');
  const [formData, setFormData] = useState(formConfig.initialState?.formData || INITIAL_ENQUIRY_DATA);
  const [editingEnquiry, setEditingEnquiry] = useState(formConfig.initialState?.editingEnquiry || null);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch current user email for the summary view
  useEffect(() => {
    let isMounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (isMounted && user) {
        setCurrentUserEmail(user.email);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Auto-fetch next enquiry number for new enquiries
  useEffect(() => {
    let isMounted = true;
    if (!editingEnquiry && !formData.enquiry_no) {
      const init = async () => {
        const nextNo = await fetchNextEnquiryNumber();
        if (isMounted) setFormData(prev => ({ ...prev, enquiry_no: nextNo }));
      };
      init();
    }
    return () => { isMounted = false; };
  }, [editingEnquiry, formData.enquiry_no]);

  // Auto-clear toasts
  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => { setSuccess(null); setError(null); }, 4000);
      return () => clearTimeout(t);
    }
  }, [success, error]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    }
  }, [validationErrors]);

  const validateStep = useCallback((step) => {
    const errors = {};
    if (step === 1 && !jobType) errors.jobType = 'Job type is required';
    if (step === 2 && !tradeDirection) errors.tradeDirection = 'Trade direction is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [jobType, tradeDirection]);

  const handleNext = useCallback(() => {
    if (validateStep(activeStep) && activeStep < ENQUIRY_STEPS.length) {
      setMaxStepReached(Math.max(maxStepReached, activeStep + 1));
      setActiveStep(activeStep + 1);
    }
  }, [activeStep, maxStepReached, validateStep]);

  const handleBack = useCallback(() => {
    if (activeStep > 1) setActiveStep(activeStep - 1);
  }, [activeStep]);

  const handleCancel = useCallback((e) => {
    if (e?.stopPropagation) e.stopPropagation();
    onClose(formConfig.id);
  }, [formConfig.id, onClose]);

  const handleSaveEnquiry = useCallback(async () => {
    try {
      setLoading(true);
      let userEmail = 'Unknown';
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) userEmail = user.email;
      } catch (err) { console.warn('Could not fetch user', err); }

      const cleanNum = (v) => {
        if (v === '' || v === null || v === undefined) return null;
        if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return isNaN(n) ? null : n; }
        return v;
      };

      const enquiryData = {
        enquiry_no: formData.enquiry_no,
        enquiry_date: formData.enquiry_date || new Date().toISOString().split('T')[0],
        customer_name: formData.customer_name || null,
        job_type: jobType,
        trade_direction: tradeDirection,
        pol: formData.pol || null,
        pod: formData.pod || null,
        container_size: formData.container_size || null,
        cargo: formData.cargo || null,
        shipment_terms: formData.shipment_terms || null,
        buy_freight: cleanNum(formData.buy_freight),
        quote_rate: cleanNum(formData.quote_rate),
        sell_freight: cleanNum(formData.sell_freight),
        shipping_line: formData.shipping_line || null,
        remarks: formData.remarks || null,
        status: editingEnquiry?.status || 'pending',
        updated_at: new Date().toISOString(),
      };

      if (editingEnquiry) {
        enquiryData.updated_by = userEmail;
        const { error: updateErr } = await supabase
          .from('job_enquiries')
          .update(enquiryData)
          .eq('id', editingEnquiry.id);
        if (updateErr) throw updateErr;
      } else {
        enquiryData.created_by = userEmail;
        const { error: insertErr } = await supabase
          .from('job_enquiries')
          .insert([enquiryData]);
        if (insertErr) throw insertErr;

        // Broadcast notification to all users
        supabase.rpc('notify_all_users', {
          p_title: 'New Job Enquiry',
          p_message: `Enquiry ${enquiryData.enquiry_no} created by ${userEmail}.`,
          p_type: 'info'
        }).catch(err => console.error('Notification error', err));
      }

      onClose(formConfig.id);
      window.dispatchEvent(new Event('enquiry_data_updated'));
      setSuccess(editingEnquiry ? 'Enquiry updated!' : 'Enquiry created!');
    } catch (err) {
      console.error('Error saving enquiry:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [formData, jobType, tradeDirection, editingEnquiry, formConfig.id, onClose]);

  // ─── Render Step 3: Enquiry Fields ───
  const renderEnquiryFields = () => {
    const fields = [
      { label: 'Enquiry No.', name: 'enquiry_no', type: 'text', readOnly: true },
      { label: 'Date', name: 'enquiry_date', type: 'date' },
      { label: 'Customer Name', name: 'customer_name', type: 'text' },
      { label: 'POL', name: 'pol', type: 'text' },
      { label: 'POD', name: 'pod', type: 'text' },
      { label: 'Container Size', name: 'container_size', type: 'text' },
      { label: 'Cargo', name: 'cargo', type: 'text' },
      { label: 'Shipment Terms', name: 'shipment_terms', type: 'text' },
      { label: 'Buy Freight', name: 'buy_freight', type: 'number' },
      { label: 'Quote Rate', name: 'quote_rate', type: 'number' },
      { label: 'Sell Freight', name: 'sell_freight', type: 'number' },
      { label: 'Shipping Line', name: 'shipping_line', type: 'text' },
    ];

    return (
      <div>
        <div className="enquiry-section-title">
          <Search size={18} />
          Enquiry Details — {jobType} / {tradeDirection}
        </div>
        <div className="enquiry-form-grid">
          {fields.map((field, idx) => (
            <div key={idx} className="enquiry-form-group">
              <label>
                {field.label}
                {field.required && <span className="required">*</span>}
              </label>
              <input
                type={field.type}
                name={field.name}
                value={formData[field.name] || ''}
                onChange={handleInputChange}
                readOnly={field.readOnly}
                className={validationErrors[field.name] ? 'error' : ''}
                style={field.readOnly ? { background: 'var(--bg-inset, #f1f5f9)', cursor: 'default' } : {}}
              />
              {validationErrors[field.name] && (
                <span className="field-error">{validationErrors[field.name]}</span>
              )}
            </div>
          ))}
          {/* Remarks — full width */}
          <div className="enquiry-form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks || ''}
              onChange={handleInputChange}
              placeholder="Any additional notes..."
            />
          </div>
        </div>
      </div>
    );
  };

  // ─── Render Step 4: Summary Review ───
  const renderSummary = () => {
    const summaryItems = [
      { label: 'Enquiry No', value: formData.enquiry_no },
      { label: 'Date', value: formData.enquiry_date },
      { label: 'Customer Name', value: formData.customer_name },
      { label: 'Job Type', value: jobType },
      { label: 'Trade Direction', value: tradeDirection },
      { label: 'POL', value: formData.pol },
      { label: 'POD', value: formData.pod },
      { label: 'Container Size', value: formData.container_size },
      { label: 'Cargo', value: formData.cargo },
      { label: 'Shipment Terms', value: formData.shipment_terms },
      { label: 'Buy Freight', value: formData.buy_freight },
      { label: 'Quote Rate', value: formData.quote_rate },
      { label: 'Sell Freight', value: formData.sell_freight },
      { label: 'Shipping Line', value: formData.shipping_line },
      { label: 'Remarks', value: formData.remarks },
      { label: 'Author', value: editingEnquiry?.created_by || currentUserEmail },
    ];

    return (
      <div>
        <div className="enquiry-section-title">
          <CheckCircle2 size={18} />
          Review Enquiry
        </div>
        <div className="enquiry-summary-card">
          <div className="enquiry-summary-grid">
            {summaryItems.map((item, idx) => (
              <div key={idx} className="enquiry-summary-row">
                <span className="label">{item.label}:</span>
                <span className="value">{item.value || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="enquiry-confirmation">
          <div className="checkbox-item">
            <input type="checkbox" id="enq_confirm1" required />
            <label htmlFor="enq_confirm1">I confirm the accuracy of all information</label>
          </div>
          <div className="checkbox-item">
            <input type="checkbox" id="enq_confirm2" required />
            <label htmlFor="enq_confirm2">I authorize this enquiry</label>
          </div>
        </div>
      </div>
    );
  };

  // ─── Minimized Bar ───
  if (formConfig.isMinimized) {
    return (
      <div className="enquiry-minimized-bar" onClick={() => onRestore(formConfig.id)}>
        <span className="enquiry-minimized-title">
          {editingEnquiry ? 'Edit Enquiry' : 'New Enquiry'} — {jobType || 'Draft'}
        </span>
        <div className="enquiry-minimized-actions">
          <button title="Restore"><Maximize2 size={14} /></button>
          <button className="close-btn" onClick={(e) => { e.stopPropagation(); onClose(formConfig.id); }} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ─── Full Form Window ───
  return (
    <>
      <div className="enquiry-modal-overlay">
        <div className="enquiry-modal-content">
          {/* Header */}
          <div className="enquiry-header">
            <div className="enquiry-header-left">
              <button className="enquiry-window-btn" onClick={handleBack} disabled={activeStep === 1} title="Back"
                style={{ opacity: activeStep === 1 ? 0.4 : 1, cursor: activeStep === 1 ? 'not-allowed' : 'pointer' }}>
                <ArrowLeft size={16} />
              </button>
              <button className="enquiry-window-btn" onClick={handleNext}
                disabled={activeStep >= Math.min(maxStepReached, ENQUIRY_STEPS.length)} title="Forward"
                style={{ opacity: activeStep >= Math.min(maxStepReached, ENQUIRY_STEPS.length) ? 0.4 : 1,
                  cursor: activeStep >= Math.min(maxStepReached, ENQUIRY_STEPS.length) ? 'not-allowed' : 'pointer' }}>
                <ArrowRight size={16} />
              </button>
              <h1>{editingEnquiry ? 'Edit Enquiry' : 'New Enquiry'}</h1>
            </div>
            <div className="enquiry-header-right">
              <button className="enquiry-window-btn" onClick={() => onMinimize(formConfig.id)} title="Minimize">
                <Minus size={16} />
              </button>
              <button className="enquiry-window-btn close-btn" onClick={handleCancel} title="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="enquiry-progress-steps">
            {ENQUIRY_STEPS.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
                <div className={`enquiry-step ${idx + 1 === activeStep ? 'active' : ''} ${idx + 1 < activeStep ? 'completed' : ''}`}>
                  <div className="enquiry-step-number">{idx + 1}</div>
                  <div className="enquiry-step-label">{step}</div>
                </div>
                {idx < ENQUIRY_STEPS.length - 1 && (
                  <div className={`enquiry-step-connector ${idx + 1 < activeStep ? 'completed' : ''}`} />
                )}
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="enquiry-body">
            {activeStep === 1 && (
              <div className="enquiry-type-selection">
                <h2>Select Enquiry Type</h2>
                {validationErrors.jobType && <div style={{ color: '#ef4444', marginBottom: 16, fontWeight: 600 }}>{validationErrors.jobType}</div>}
                <div className="enquiry-type-grid">
                  {ENQUIRY_JOB_TYPES.map((type, idx) => (
                    <div key={idx} className={`enquiry-type-card ${jobType === type ? 'selected' : ''}`}
                      onClick={() => { setJobType(type); setValidationErrors(p => { const n = { ...p }; delete n.jobType; return n; }); }}>
                      {type}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="enquiry-direction-selection">
                <h2>Is this an Export, Import{jobType === 'TRANSPORT' ? ', or Local' : ''} enquiry?</h2>
                {validationErrors.tradeDirection && <div style={{ color: '#ef4444', marginBottom: 16, fontWeight: 600 }}>{validationErrors.tradeDirection}</div>}
                <div className="enquiry-direction-grid">
                  {(ENQUIRY_TRADE_DIRECTIONS[jobType] || ['EXPORT', 'IMPORT']).map((dir, idx) => (
                    <div key={idx} className={`enquiry-direction-card ${tradeDirection === dir ? 'selected' : ''}`}
                      onClick={() => { setTradeDirection(dir); setValidationErrors(p => { const n = { ...p }; delete n.tradeDirection; return n; }); }}>
                      {dir}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeStep === 3 && renderEnquiryFields()}
            {activeStep === 4 && renderSummary()}
          </div>

          {/* Footer */}
          <div className="enquiry-footer">
            {activeStep < ENQUIRY_STEPS.length && (
              <button className="enquiry-btn enquiry-btn-primary" onClick={handleNext}>
                Next <ArrowRight size={16} />
              </button>
            )}
            {activeStep === ENQUIRY_STEPS.length && (
              <button className="enquiry-btn enquiry-btn-confirm" onClick={handleSaveEnquiry} disabled={loading || isOffline}>
                {isOffline ? 'Offline - Reconnect to Save' : (loading ? 'Saving...' : (editingEnquiry ? 'Update Enquiry' : 'Confirm & Create Enquiry'))}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      {success && <div className="enquiry-toast success"><CheckCircle2 size={18} /> {success}</div>}
      {error && <div className="enquiry-toast error"><X size={18} /> {error}</div>}
    </>
  );
};


// ─── Global Enquiry Form Manager (multi-window) ───
const GlobalEnquiryForm = () => {
  const [forms, setForms] = useState(() => {
    const saved = sessionStorage.getItem('enquiry_forms_v1');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('enquiry_forms_v1', JSON.stringify(forms));
  }, [forms]);

  // Listen for open events
  useEffect(() => {
    const handleOpen = (e) => {
      const enquiryToEdit = e.detail;
      const newFormId = enquiryToEdit ? `enq-edit-${enquiryToEdit.id}` : `enq-new-${Date.now()}`;

      setForms(prev => {
        const existing = prev.find(f => f.id === newFormId);
        if (existing) {
          return prev.map(f => f.id === newFormId ? { ...f, isMinimized: false } : { ...f, isMinimized: true });
        }

        const newForm = {
          id: newFormId,
          isMinimized: false,
          initialState: enquiryToEdit ? {
            editingEnquiry: enquiryToEdit,
            jobType: enquiryToEdit.job_type || '',
            tradeDirection: enquiryToEdit.trade_direction || '',
            formData: {
              enquiry_no: enquiryToEdit.enquiry_no || '',
              enquiry_date: enquiryToEdit.enquiry_date || new Date().toISOString().split('T')[0],
              customer_name: enquiryToEdit.customer_name || '',
              pol: enquiryToEdit.pol || '',
              pod: enquiryToEdit.pod || '',
              container_size: enquiryToEdit.container_size || '',
              cargo: enquiryToEdit.cargo || '',
              shipment_terms: enquiryToEdit.shipment_terms || '',
              buy_freight: enquiryToEdit.buy_freight ?? '',
              quote_rate: enquiryToEdit.quote_rate ?? '',
              sell_freight: enquiryToEdit.sell_freight ?? '',
              shipping_line: enquiryToEdit.shipping_line || '',
              remarks: enquiryToEdit.remarks || '',
            },
            activeStep: 3,
            maxStepReached: 4,
          } : {
            editingEnquiry: null,
            jobType: '',
            tradeDirection: '',
            formData: { ...INITIAL_ENQUIRY_DATA },
            activeStep: 1,
            maxStepReached: 1,
          }
        };
        return [...prev.map(f => ({ ...f, isMinimized: true })), newForm];
      });
    };

    window.addEventListener('open_enquiry_form', handleOpen);
    return () => window.removeEventListener('open_enquiry_form', handleOpen);
  }, []);

  const handleClose = useCallback((id) => {
    setForms(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleMinimize = useCallback((id) => {
    setForms(prev => prev.map(f => f.id === id ? { ...f, isMinimized: true } : f));
  }, []);

  const handleRestore = useCallback((id) => {
    setForms(prev => prev.map(f => f.id === id ? { ...f, isMinimized: false } : { ...f, isMinimized: true }));
  }, []);

  return (
    <>
      {forms.map(form => !form.isMinimized && (
        <EnquiryFormWindow
          key={form.id}
          formConfig={form}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onRestore={handleRestore}
        />
      ))}

      {document.getElementById('minimized-taskbar-root') ? createPortal(
        <>
          {forms.map(form => form.isMinimized && (
            <EnquiryFormWindow
              key={form.id}
              formConfig={form}
              onClose={handleClose}
              onMinimize={handleMinimize}
              onRestore={handleRestore}
            />
          ))}
        </>,
        document.getElementById('minimized-taskbar-root')
      ) : (
        <div className="enquiry-minimized-taskbar">
          {forms.map(form => form.isMinimized && (
            <EnquiryFormWindow
              key={form.id}
              formConfig={form}
              onClose={handleClose}
              onMinimize={handleMinimize}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default GlobalEnquiryForm;
