// src/components/JobEnquiryForm.jsx
import './JobEnquiryForm.css';
import './ActivityTable.css';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Minus, X, Maximize2, ArrowLeft, ArrowRight, Search, ArrowRightCircle, CheckCircle2, Plane, Ship, Truck, Package, UserPlus, PenLine } from 'lucide-react';
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

const ENQUIRY_TYPE_IMAGES = {
  'AIR FREIGHT': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfEp12ssHJHjPGZbb-2MwENsvs8vCxqliFyo-up01eOBuQ9Dy8EUEL4xOjK2DTi5O27C4jyQIrpbsaDav1zc8yQgnJPfKibFRLiK-ruLGeg5hXY5uoEFkSbA53ExGcS01jtW6xBnZp-PiuWUJTQYGY1iG0Oc1-b-GIOZssL3zbD3D0XV4M8Od2XdiBkV3ZMziOkY32mx15Mv945SVRdWvQWgkxbBp5oCv2FCDUMBvThqyKcCbfK0hXMER_UCpsUTLqp2qSpXT2DEs',
  'SEA FREIGHT': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAJy7IMnj8PPQzu3O3An_AGLLTmfPdyvx2gi-Y_ebIBOqeVgh6nQ29cirfa0zNvwcH98uASd278NI4wS0eFghh0cD402SdKwDgwzaHvy3mM5pw27bzISH8z2TAJ3nQfFd3qBCVNuGU4AY7qHr6P7S3d0oShmo4V33AJAmx0paq-L87hk9e7b0OrzPRPkzXVAAVrqJiBkpex0RDdniYWqB6yj0IlGl0AmXreP3D7d17AYUMRfYaOy7kXb-uvaXPeV8o7VNrYkh3LP-c',
  'TRANSPORT': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXKeKt_8J3V7RQ0W9uyPOb-f1p6KhvG8tUrRV4O-BJJuFAEC3bsVcGLKuNQ7iNRC0dkR341oczjiXHs9T7ngoSYSVVWMeG0BX2mj7aLFLmTeO-dZsooPKBkGCjqNzSchN4dShUUctKiKdsQ9O2v5KDw297ac0F6DLx2t3tPRmbFFg7GFLdyo979rme99G2AZPMRUEuSA1Q9P4zYmP838Hsm22KgecE_xLq6qhjFw70K0qDtibjdaC1QEtQvLF9F46We670k8j1EBQ',
  'OTHERS': 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2Hh_Fs4cN8w3E5TfSIdJJ9ng0zfURtLYOQ738Vae2SqHkxYCSjfReTv18GGk0NhFg3JIihI3LhzLE53XMp1hNw6igbJ2vb0naQcYBmOspJ4DsewkS8XQ36Uh3FU4Foonzh08KUAyu0VqGOrZwWBV6pz2fz7xHURL_KcqXYR-Ucur9sgriEzYyEkMnBe7rLnTO9k7XHbFxSI6kcxN2UZg2r0XQTOo7ruXkOPDhW7I_SXEFNsbIkv397H5ZHQcS1jZZ5aZrMcK_BwA'
};

const ENQUIRY_TYPE_SUBTITLES = {
  'AIR FREIGHT': 'Express global delivery',
  'SEA FREIGHT': 'High volume maritime shipping',
  'TRANSPORT': 'Domestic road & rail freight',
  'OTHERS': 'Custom multi-modal logistics'
};

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
  ex_works: '',
  gr_wt: '',
  dimension: '',
  remarks: '',
};

const getJobIcon = (type) => {
  switch(type) {
    case 'AIR FREIGHT': return <Plane size={48} strokeWidth={1.5} />;
    case 'SEA FREIGHT': return <Ship size={48} strokeWidth={1.5} />;
    case 'TRANSPORT': return <Truck size={48} strokeWidth={1.5} />;
    case 'OTHERS': return <Package size={48} strokeWidth={1.5} />;
    default: return <Package size={48} strokeWidth={1.5} />;
  }
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
  const [vendorSuggestions, setVendorSuggestions] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchVendors = async () => {
      try {
        const { data, error } = await supabase.from('vendors').select('vendorName');
        if (!error && data && isMounted) {
          const uniqueNames = Array.from(new Set(data.map(d => d.vendorName).filter(Boolean)));
          setVendorSuggestions(uniqueNames);
        }
      } catch(err) { console.error('Error fetching vendors', err); }
    };
    fetchVendors();
    return () => { isMounted = false; };
  }, []);

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
        buy_freight: formData.buy_freight || null,
        quote_rate: formData.quote_rate || null,
        sell_freight: formData.sell_freight || null,
        shipping_line: formData.shipping_line || null,
        ex_works: formData.ex_works || null,
        gr_wt: formData.gr_wt || null,
        dimension: formData.dimension || null,
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
        
        let insertErr = null;
        let retries = 3;
        let currentEnquiryNo = enquiryData.enquiry_no;

        while (retries > 0) {
          const { error } = await supabase
            .from('job_enquiries')
            .insert([{ ...enquiryData, enquiry_no: currentEnquiryNo }]);
            
          if (error) {
            if (error.code === '23505' || (error.message && error.message.includes('job_enquiries_enquiry_o_key'))) {
              console.warn(`Enquiry number ${currentEnquiryNo} taken, generating a new one...`);
              currentEnquiryNo = await fetchNextEnquiryNumber();
              setFormData(prev => ({ ...prev, enquiry_no: currentEnquiryNo }));
              retries--;
              insertErr = error;
            } else {
              insertErr = error;
              break;
            }
          } else {
            insertErr = null;
            break;
          }
        }

        if (insertErr) throw insertErr;

        enquiryData.enquiry_no = currentEnquiryNo;

        // Broadcast notification to all users
        supabase.rpc('notify_all_users', {
          p_title: 'New Job Enquiry',
          p_message: `Enquiry ${enquiryData.enquiry_no} created by ${userEmail}.`,
          p_type: 'info'
        }).then(({ error }) => {
          if (error) console.error('Notification error', error);
        });
      }

      window.dispatchEvent(new CustomEvent('show_global_toast', { 
        detail: { title: 'Success', message: editingEnquiry ? 'Enquiry updated!' : 'Enquiry created!', type: 'success' } 
      }));
      onClose(formConfig.id);
      window.dispatchEvent(new Event('enquiry_data_updated'));
    } catch (err) {
      console.error('Error saving enquiry:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [formData, jobType, tradeDirection, editingEnquiry, formConfig.id, onClose]);

  // ─── Render Step 3: Enquiry Fields ───
  const renderEnquiryFields = () => {
    const isAirFreight = jobType === 'AIR FREIGHT';
    let fields = [];
    
    if (isAirFreight) {
      fields = [
        { label: 'Enquiry No.', name: 'enquiry_no', type: 'text', readOnly: true },
        { label: 'Date', name: 'enquiry_date', type: 'date' },
        { label: 'Customer Name', name: 'customer_name', type: 'text', list: 'vendor-list' },
        { label: 'AOL', name: 'pol', type: 'text' },
        { label: 'AOD', name: 'pod', type: 'text' },
        { label: 'EX WORKS', name: 'ex_works', type: 'text' },
        { label: 'GR WT', name: 'gr_wt', type: 'text' },
        { label: 'DIMENSION', name: 'dimension', type: 'text' },
        { label: 'AIR LINE', name: 'shipping_line', type: 'text' },
        { label: 'BUY FREIGHT', name: 'buy_freight', type: 'text' },
        { label: 'SALE FREIGHT', name: 'sell_freight', type: 'text' },
      ];
    } else {
      fields = [
        { label: 'Enquiry No.', name: 'enquiry_no', type: 'text', readOnly: true },
        { label: 'Date', name: 'enquiry_date', type: 'date' },
        { label: 'Customer Name', name: 'customer_name', type: 'text', list: 'vendor-list' },
        { label: 'POL', name: 'pol', type: 'text' },
        { label: 'POD', name: 'pod', type: 'text' },
        { label: 'Container Size', name: 'container_size', type: 'text' },
        { label: 'Cargo', name: 'cargo', type: 'text' },
        { label: 'Shipment Terms', name: 'shipment_terms', type: 'text' },
        { label: 'Buy Freight', name: 'buy_freight', type: 'text' },
        { label: 'Quote Rate', name: 'quote_rate', type: 'number' },
        { label: 'Sell Freight', name: 'sell_freight', type: 'text' },
        { label: 'Shipping Line', name: 'shipping_line', type: 'text' },
      ];
    }

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
                list={field.list}
                className={validationErrors[field.name] ? 'error' : ''}
                style={field.readOnly ? { background: 'var(--bg-inset, #f1f5f9)', cursor: 'default' } : {}}
              />
              {validationErrors[field.name] && (
                <span className="field-error">{validationErrors[field.name]}</span>
              )}
            </div>
          ))}
          {/* Remarks — full width */}
          <datalist id="vendor-list">
            {vendorSuggestions.map((v, i) => <option key={i} value={v} />)}
          </datalist>
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
    const isAirFreight = jobType === 'AIR FREIGHT';
    let summaryItems = [];

    if (isAirFreight) {
      summaryItems = [
        { label: 'Enquiry No', value: formData.enquiry_no },
        { label: 'Date', value: formData.enquiry_date },
        { label: 'Customer Name', value: formData.customer_name },
        { label: 'Job Type', value: jobType },
        { label: 'Trade Direction', value: tradeDirection },
        { label: 'AOL', value: formData.pol },
        { label: 'AOD', value: formData.pod },
        { label: 'EX WORKS', value: formData.ex_works },
        { label: 'GR WT', value: formData.gr_wt },
        { label: 'DIMENSION', value: formData.dimension },
        { label: 'AIR LINE', value: formData.shipping_line },
        { label: 'BUY FREIGHT', value: formData.buy_freight },
        { label: 'SALE FREIGHT', value: formData.sell_freight },
        { label: 'Remarks', value: formData.remarks },
        { label: 'Author', value: editingEnquiry?.created_by || currentUserEmail },
      ];
    } else {
      summaryItems = [
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
    }

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
      <div className="modal-overlay">
        <div className="modal-content job-modal full-screen-modal">
          <div className="new-shipment-card full-height-card">
            <div className="new-shipment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#2d3748', borderBottom: 'none', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleBack} disabled={activeStep === 1} title="Back" style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(85,95,113,0.4)', border: 'none', cursor: activeStep === 1 ? 'not-allowed' : 'pointer', opacity: activeStep === 1 ? 0.4 : 1, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                    <ArrowLeft size={14} />
                  </button>
                  <button onClick={handleNext} disabled={activeStep >= Math.min(maxStepReached, ENQUIRY_STEPS.length)} title="Forward" style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(85,95,113,0.4)', border: 'none', cursor: activeStep >= Math.min(maxStepReached, ENQUIRY_STEPS.length) ? 'not-allowed' : 'pointer', opacity: activeStep >= Math.min(maxStepReached, ENQUIRY_STEPS.length) ? 0.4 : 1, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                    <ArrowRight size={14} />
                  </button>
                </div>
                <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>{editingEnquiry ? 'Edit Enquiry' : 'New Enquiry'}</h1>
                {editingEnquiry && (
                  <div className="modal-author-info" style={{ display: 'flex', gap: '10px' }}>
                    {editingEnquiry.created_by && <span className="audit-badge" style={{ color: 'white', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><UserPlus size={12} /> {editingEnquiry.created_by.split('@')[0]}</span>}
                    {editingEnquiry.updated_by && <span className="audit-badge edit" style={{ color: 'white', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><PenLine size={12} /> {editingEnquiry.updated_by.split('@')[0]}</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => onMinimize(formConfig.id, { activeStep, maxStepReached, jobType, tradeDirection, formData, editingEnquiry })} title="Minimize" style={{ width: 32, height: 32, background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                  <Minus size={18} />
                </button>
                <button onClick={() => {
                  const el = document.querySelector('.job-modal');
                  if (el) el.classList.toggle('full-screen-modal');
                }} title="Maximize/Restore" style={{ width: 32, height: 32, background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                  <Maximize2 size={16} />
                </button>
                <button onClick={handleCancel} title="Close" style={{ width: 32, height: 32, background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Progress Steps - Chevron Stepper */}
            <div className="progress-steps stitch-stepper">
              {ENQUIRY_STEPS.map((step, index) => (
                <div
                  key={`step-${index}`}
                  className={`stitch-step ${index + 1 === activeStep ? 'active' : ''} ${index + 1 < activeStep ? 'completed' : ''} ${index === 0 ? 'first' : ''} ${index === ENQUIRY_STEPS.length - 1 ? 'last' : ''}`}
                >
                  <div className="stitch-step-inner">
                    <div className="stitch-step-number">{index + 1}</div>
                    <div className="stitch-step-info">
                      <span className="stitch-step-label">{`${index + 1}. ${step}`}</span>
                      {index + 1 === activeStep && <span className="stitch-step-active-tag">(ACTIVE)</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="step-content content-scrollable">
              {activeStep === 1 && (
                <div className="shipment-type-selection">
                  <h2>What type of Job would you like to create?</h2>
                  {validationErrors.jobType && <div className="validation-error">{validationErrors.jobType}</div>}
                  <div className="shipment-type-grid">
                    {ENQUIRY_JOB_TYPES.map((type, index) => (
                      <div
                        key={`type-${index}`}
                        className={`shipment-type-card ${jobType === type ? 'selected' : ''}`}
                        onClick={() => { setJobType(type); setValidationErrors(p => { const n = { ...p }; delete n.jobType; return n; }); }}
                      >
                        <div className="shipment-card-img-wrap">
                          <img src={ENQUIRY_TYPE_IMAGES[type]} alt={type} className="shipment-card-img" />
                        </div>
                        <div className="shipment-card-info">
                          <span className="shipment-type-text">{type}</span>
                          <span className="shipment-type-subtitle">{ENQUIRY_TYPE_SUBTITLES[type]}</span>
                        </div>
                        {jobType === type && <div className="shipment-card-check">✓</div>}
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

            {/* Navigation Buttons */}
            <div className="navigation-buttons">
              <div className="step-buttons">
                {activeStep < ENQUIRY_STEPS.length && (
                  <button className="next-button" onClick={handleNext}>
                    Next
                  </button>
                )}
                {activeStep === ENQUIRY_STEPS.length && (
                  <button className="confirm-button" onClick={handleSaveEnquiry} disabled={loading || isOffline} style={{ padding: '8px 24px', fontWeight: 'bold' }}>
                    {isOffline ? 'Offline - Reconnect to Save' : (loading ? 'Saving...' : (editingEnquiry ? 'Update Enquiry' : 'Confirm & Create Enquiry'))}
                  </button>
                )}
              </div>
            </div>
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
              ex_works: enquiryToEdit.ex_works || '',
              gr_wt: enquiryToEdit.gr_wt || '',
              dimension: enquiryToEdit.dimension || '',
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

  const handleMinimize = useCallback((id, currentState) => {
    setForms(prev => prev.map(f => f.id === id ? { ...f, isMinimized: true, initialState: currentState || f.initialState } : f));
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
