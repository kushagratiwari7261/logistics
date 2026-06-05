import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { UserPlus, PenLine, FileUp, ExternalLink, FileText } from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabaseClient';
import './NewShipments.css';

// Lazy load PDFGenerator to reduce initial bundle size
const PDFGenerator = lazy(() => import('./PDFGenerator.jsx'));

// Constants for better maintainability
const SHIPMENT_TYPES = ['AIR FREIGHT', 'SEA FREIGHT', 'TRANSPORT', 'OTHERS'];
const STEPS = ['Create Shipment', 'Port Details', 'Summary'];
const CATEGORIES = [
  'AGENT', 'ARLINE', 'BANK', 'BIKE', 'BIOKER', 'BUYER', 
  'CAREER', 'CAREER AGENT'
];

// Trade directions
const TRADE_DIRECTIONS = {
  'AIR FREIGHT': ['EXPORT', 'IMPORT'],
  'SEA FREIGHT': ['EXPORT', 'IMPORT'],
  'LAND': ['EXPORT', 'IMPORT'],
  'TRANSPORT': ['EXPORT', 'IMPORT', 'LOCAL'],
  'OTHERS': ['GENERAL']
};

// Initial form data
const INITIAL_FORM_DATA = {
  branch: '',
  department: '',
  shipmentDate: new Date().toISOString().split('T')[0],
  client: '',
  client_email: '',
  shipper: '',
  consignee: '',
  address: '',
  por: '',
  poi: '',
  pod: '',
  pof: '',
  hblNo: '',
  jobNo: '',
  etd: '',
  eta: '',
  incoterms: '',
  serviceType: '',
  freight: '',
  payableAt: '',
  dispatchAt: '',
  lclFcl: '',
  
  // Additional fields for summary
  HSCode: '',
  pol: '',
  pdf: '',
  carrier: '',
  vesselNameSummary: '',
  noOfRes: '',
  volume: '',
  grossWeight: '',
  description: '',
  remarks: '',
  
  // Trade direction
  tradeDirection: '',
  
  // MTD Registration No.
  mtdRegistrationNo: '',
  
  // Air Freight specific fields
  airport_of_departure: '',
  airport_of_destination: '',
  no_of_packages: '',
  dimension_cms: '',
  chargeable_weight: '',
  client_no: '',
  name_of_airline: '',
  awb: '',
  flight_from: '',
  flight_to: '',
  flight_eta: '',
  invoiceNo: '',
  invoiceDate: '',
  notify_party: '',
  
  // Sea Freight specific fields
  exporter: '',
  importer: '',
  stuffingDate: '',
  hoDate: '',
  terms: '',
  sbNo: '',
  sbDate: '',
  boeNo: '',
  boeDate: '',
  destination: '',
  commodity: '',
  fob: '',
  grWeight: '',
  netWeight: '',
  railOutDate: '',
  containerNo: '',
  noOfCntr: '',
  sLine: '',
  mblNo: '',
  mblDate: '',
  hblDt: '',
  vessel: '',
  voy: '',
  sob: '',
  ac: '',
  billNo: '',
  billDate: '',
  ccPort: '',
  pod_documents: [],
};

const INITIAL_ORG_FORM_DATA = {
  name: '',
  recordStatus: '',
  salesPerson: '',
  category: '',
  branch: '',
  contactPerson: '',
  doorNo: '',
  buildingName: '',
  street: '',
  area: '',
  city: '',
  state: ''
};

const NewShipments = () => {
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [shipmentType, setShipmentType] = useState('');
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [generatePDF, setGeneratePDF] = useState(false);
  const [pdfShipmentData, setPdfShipmentData] = useState(null);
  
  const tableContainerRef = useRef(null);
  
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [orgFormData, setOrgFormData] = useState(INITIAL_ORG_FORM_DATA);
  const { uploadFile, getFileUrl, uploading, progress: uploadProgress } = useFileUpload();
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleFileSelect = (e) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const savedEditingState = sessionStorage.getItem('editing_shipment');
    const savedCreatingState = sessionStorage.getItem('creating_shipment');
    
    if (savedEditingState) {
      try {
        const state = JSON.parse(savedEditingState);
        setEditingShipment(state.shipment);
        setFormData(state.formData);
        setShipmentType(state.shipmentType);
        setActiveStep(state.activeStep);
        setShowShipmentForm(true);
      } catch (e) {
        console.error('Error restoring editing shipment state:', e);
        sessionStorage.removeItem('editing_shipment');
      }
    } else if (savedCreatingState) {
      try {
        const state = JSON.parse(savedCreatingState);
        setFormData(state.formData);
        setShipmentType(state.shipmentType);
        setActiveStep(state.activeStep);
        setShowShipmentForm(true);
      } catch (e) {
        console.error('Error restoring creating shipment state:', e);
        sessionStorage.removeItem('creating_shipment');
      }
    }
  }, []);

  useEffect(() => {
    if (showShipmentForm && editingShipment) {
      sessionStorage.setItem('editing_shipment', JSON.stringify({
        shipment: editingShipment,
        formData: formData,
        shipmentType: shipmentType,
        activeStep: activeStep
      }));
    } else if (showShipmentForm) {
      sessionStorage.setItem('creating_shipment', JSON.stringify({
        formData: formData,
        shipmentType: shipmentType,
        activeStep: activeStep
      }));
    } else {
      sessionStorage.removeItem('editing_shipment');
      sessionStorage.removeItem('creating_shipment');
    }
  }, [showShipmentForm, editingShipment, formData, shipmentType, activeStep]);

  useEffect(() => {
    if (!showShipmentForm) return;

    const handleBeforeUnload = (e) => {
      if (formData.client || formData.shipper || formData.consignee) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [showShipmentForm, formData.client, formData.shipper, formData.consignee]);

  const requiredFields = useMemo(() => ({
    1: ['shipmentType'],
    2: [],
    3: []
  }), []);

  const [filteredJobs, setFilteredJobs] = useState([]);

  useEffect(() => {
    if (!shipmentType) {
      setFilteredJobs(jobs);
    } else {
      setFilteredJobs(jobs.filter(job => job.job_type === shipmentType));
    }
  }, [jobs, shipmentType]);

  const fetchJobs = async () => {
    try {
      setIsLoadingJobs(true);
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const formattedJobs = (data || []).map(job => ({
        id: job.id,
        job_no: job.job_no,
        job_no_display: job.job_no || `JOB-${job.id.toString().padStart(6, '0')}`,
        client: job.client || '',
        shipper: job.shipper || '',
        consignee: job.consignee || '',
        address: job.address || '',
        por: job.por || '',
        lcl_fcl: job.lcl_fcl || '',
        poi: job.poi || '',
        pod: job.pod || '',
        pof: job.pof || '',
        pol: job.pol || '',
        pdf: job.pdf || '',
        hbl_no: job.hbl_no || '',
        etd: job.etd || '',
        eta: job.eta || '',
        incoterms: job.incoterms || '',
        service_type: job.service_type || '',
        freight: job.freight || '',
        payable_at: job.payable_at || '',
        dispatch_at: job.dispatch_at || '',
        carrier: job.carrier || '',
        vessel_name: job.vessel_name || '',
        no_of_res: job.no_of_res || '',
        volume: job.volume || '',
        gross_weight: job.gross_weight || '',
        description: job.description || '',
        remarks: job.remarks || '',
        hs_code: job.hs_code || '',
        branch: job.branch || '',
        department: job.department || '',
        job_type: job.job_type || '',
        trade_direction: job.trade_direction || 'EXPORT',
        mtd_registration_no: job.mtd_registration_no || '',
        pod_attachment: job.pod_attachment || '',

        // Air Freight fields
        airport_of_departure: job.airport_of_departure || '',
        airport_of_destination: job.airport_of_destination || '',
        no_of_packages: job.no_of_packages || '',
        dimension_cms: job.dimension_cms || '',
        chargeable_weight: job.chargeable_weight || '',
        client_no: job.client_no || '',
        name_of_airline: job.name_of_airline || '',
        awb: job.awb || '',
        flight_from: job.flight_from || '',
        flight_to: job.flight_to || '',
        flight_eta: job.flight_eta || '',
        invoiceNo: job.invoiceNo || '',
        invoiceDate: job.invoice_date || '',
        notify_party: job.notify_party || '',

        // Sea Freight fields
        exporter: job.exporter || '',
        importer: job.importer || '',
        stuffingDate: job.stuffingDate || '',
        hoDate: job.hoDate || '',
        terms: job.terms || '',
        sbNo: job.sbNo || '',
        sbDate: job.sbDate || '',
        destination: job.destination || '',
        commodity: job.commodity || '',
        fob: job.fob || '',
        grWeight: job.grWeight || '',
        netWeight: job.netWeight || '',
        railOutDate: job.railOutDate || '',
        containerNo: job.containerNo || '',
        noOfCntr: job.noOfCntr || '',
        sLine: job.sLine || '',
        mblNo: job.mblNo || '',
        mblDate: job.mblDate || '',
        hblDt: job.hblDt || '',
        vessel: job.vessel || '',
        voy: job.voy || '',
        sob: job.sob || '',
        ac: job.ac || '',
        billNo: job.billNo || '',
        billDate: job.billDate || '',
        ccPort: job.ccPort || '',
      }));
      
      setJobs(formattedJobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError('Failed to load jobs: ' + error.message);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const mappedShipments = (data || []).map(shipment => ({
        id: shipment.id,
        shipmentNo: shipment.shipment_no || `${shipment.id.toString().padStart(6, '0')}`,
        client: shipment.client,
        jobNo: shipment.job_no || `${shipment.id.toString().padStart(6, '0')}`,
        por: shipment.por,
        pof: shipment.pof,
        createdAt: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : '',
        updatedAt: shipment.updated_at ? new Date(shipment.updated_at).toLocaleDateString() : '',
        etd: shipment.etd ? new Date(shipment.etd).toLocaleDateString() : '',
        eta: shipment.eta ? new Date(shipment.eta).toLocaleDateString() : '',
        ...shipment
      }));
      
      localStorage.setItem('cache_new_shipments', JSON.stringify(mappedShipments));
      setShipments(mappedShipments);
    } catch (error) {
      if (error.message.includes('Failed to fetch') || !navigator.onLine) {
        window.dispatchEvent(new Event('force_offline'));
        const cached = localStorage.getItem('cache_new_shipments');
        if (cached) setShipments(JSON.parse(cached));
        else setShipments([]);
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (shipmentType && formData.jobNo) {
      const selectedJob = jobs.find(job => job.job_no === formData.jobNo);
      if (selectedJob && selectedJob.job_type !== shipmentType) {
        setFormData(prev => ({ ...prev, jobNo: '' }));
      }
    }
  }, [shipmentType, jobs, formData.jobNo]);

  useEffect(() => {
    fetchJobs();
    fetchShipments();
    
    const handleLocalRefresh = () => {
      fetchJobs();
      fetchShipments();
    };
    window.addEventListener('shipment_data_updated', handleLocalRefresh);
    window.addEventListener('job_data_updated', handleLocalRefresh);

    const channel = supabase
      .channel('public:shipments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, payload => {
        setShipments(currentShipments => {
          if (payload.eventType === 'DELETE') {
             return currentShipments.filter(s => s.id !== payload.old.id);
          }
          
          const shipment = payload.new;
          
          const mappedShipment = {
            id: shipment.id,
            shipmentNo: shipment.shipment_no || `${shipment.id.toString().padStart(6, '0')}`,
            client: shipment.client,
            jobNo: shipment.job_no || `${shipment.id.toString().padStart(6, '0')}`,
            por: shipment.por,
            pof: shipment.pof,
            createdAt: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : '',
            updatedAt: shipment.updated_at ? new Date(shipment.updated_at).toLocaleDateString() : '',
            etd: shipment.etd ? new Date(shipment.etd).toLocaleDateString() : '',
            eta: shipment.eta ? new Date(shipment.eta).toLocaleDateString() : '',
            ...shipment
          };
          
          if (payload.eventType === 'INSERT') {
             return [mappedShipment, ...currentShipments];
          } else if (payload.eventType === 'UPDATE') {
             const existingIdx = currentShipments.findIndex(s => s.id === shipment.id);
             if (existingIdx >= 0) {
                 const newShipments = [...currentShipments];
                 newShipments[existingIdx] = mappedShipment;
                 return newShipments;
             }
             return [mappedShipment, ...currentShipments];
          }
          return currentShipments;
        });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('shipment_data_updated', handleLocalRefresh);
      window.removeEventListener('job_data_updated', handleLocalRefresh);
    };
  }, []);


  const handleJobSelect = async (e) => {
    const selectedJobNo = e.target.value;
    setFormData((prev) => ({ ...prev, jobNo: selectedJobNo }));

    if (!selectedJobNo) return;

    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_no", selectedJobNo)
        .single();

      if (error) {
        console.error("Error fetching job:", error.message);
        return;
      }

      if (data) {
        const formatDateOnly = (dateString) => {
          if (!dateString) return '';
          const date = new Date(dateString);
          return date.toISOString().split('T')[0];
        };

        setFormData((prev) => ({
          ...prev,
          branch: data.branch || prev.branch,
          department: data.department || prev.department,
          shipmentDate: formatDateOnly(data.job_date) || prev.shipmentDate,
          client: data.client || prev.client,
          shipper: data.shipper || prev.shipper,
          consignee: data.consignee || prev.consignee,
          address: data.address || prev.address,
          por: data.por || prev.por,
          pol: data.pol || prev.pol,
          pod: data.pod || prev.pod,
          pof: data.pof || prev.pof,
          hblNo: data.hbl_no || prev.hblNo,
          lclFcl: data.lcl_fcl || prev.lclFcl,
          etd: formatDateOnly(data.etd) || prev.etd,
          eta: formatDateOnly(data.eta) || prev.eta,
          incoterms: data.incoterms || prev.incoterms,
          serviceType: data.service_type || prev.serviceType,
          freight: data.freight || prev.freight,
          payableAt: data.payable_at || prev.payableAt,
          dispatchAt: data.dispatch_at || prev.dispatchAt,
          tradeDirection: data.trade_direction || prev.tradeDirection,
          volume: data.volume || prev.volume,
          grossWeight: data.gross_weight || prev.grossWeight,
          description: data.description || prev.description,
          remarks: data.remarks || prev.remarks,
          hs_code: data.hs_code || prev.hs_code,
          mtdRegistrationNo: data.mtd_registration_no || prev.mtdRegistrationNo,
          pod_attachment: data.pod_attachment || prev.pod_attachment,

          airport_of_departure: data.airport_of_departure || prev.airport_of_departure,
          airport_of_destination: data.airport_of_destination || prev.airport_of_destination,
          no_of_packages: data.no_of_packages || prev.no_of_packages,
          dimension_cms: data.dimension_cms || prev.dimension_cms,
          chargeable_weight: data.chargeable_weight || prev.chargeable_weight,
          client_no: data.client_no || prev.client_no,
          name_of_airline: data.name_of_airline || prev.name_of_airline,
          awb: data.awb || prev.awb,
          flight_from: data.flight_from || prev.flight_from,
          flight_to: data.flight_to || prev.flight_to,
          flight_eta: formatDateOnly(data.flight_eta) || prev.flight_eta,
          invoiceNo: data.invoice_no || prev.invoiceNo,
          invoiceDate: formatDateOnly(data.invoice_date) || prev.invoiceDate,
          notify_party: data.notify_party || prev.notify_party,

          exporter: data.exporter || prev.exporter,
          importer: data.importer || prev.importer,
          stuffingDate: formatDateOnly(data.stuffing_date) || prev.stuffingDate,
          hoDate: formatDateOnly(data.ho_date) || prev.hoDate,
          terms: data.terms || prev.terms,
          sbNo: data.sb_no || prev.sbNo,
          sbDate: formatDateOnly(data.sb_date) || prev.sbDate,
          boeNo: data.boe_no || prev.boeNo,
          boeDate: formatDateOnly(data.boe_date) || prev.boeDate,
          destination: data.destination || prev.destination,
          commodity: data.commodity || prev.commodity,
          fob: data.fob || prev.fob,
          grWeight: data.gr_weight || prev.grWeight,
          netWeight: data.net_weight || prev.netWeight,
          railOutDate: formatDateOnly(data.rail_out_date) || prev.railOutDate,
          containerNo: data.container_no || prev.containerNo,
          noOfCntr: data.no_of_cntr || prev.noOfCntr,
          sLine: data.s_line || prev.sLine,
          mblNo: data.mbl_no || prev.mblNo,
          mblDate: formatDateOnly(data.mbl_date) || prev.mblDate,
          hblDt: formatDateOnly(data.hbl_dt) || prev.hblDt,
          vessel: data.vessel || prev.vessel,
          voy: data.voy || prev.voy,
          sob: data.sob || prev.sob,
          ac: data.ac || prev.ac,
          billNo: data.bill_no || prev.billNo,
          billDate: formatDateOnly(data.bill_date) || prev.billDate,
          ccPort: data.cc_port || prev.ccPort,
        }));
        
        if (data.job_type && !shipmentType) {
          setShipmentType(data.job_type);
        }
      }
    } catch (err) {
      console.error("Unexpected error fetching job:", err);
    }
  };

  const validateStep = useCallback((step) => {
    const errors = {};
    const fieldsToValidate = requiredFields[step];
    
    if (step === 1) {
      if (!shipmentType) {
        errors.shipmentType = 'Shipment type is required';
      }
    } else {
      fieldsToValidate.forEach(field => {
        if (!formData[field] || formData[field].toString().trim() === '') {
          errors[field] = `${field} is required`;
        }
      });
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [shipmentType, formData, requiredFields]);

  const handleNext = useCallback(() => {
    if (validateStep(activeStep)) {
      if (activeStep < STEPS.length) {
        setActiveStep(activeStep + 1);
      }
    }
  }, [activeStep, validateStep]);

  const handleBack = useCallback(() => {
    if (activeStep > 1) {
      setActiveStep(activeStep - 1);
    }
  }, [activeStep]);

  const handleCancel = useCallback(() => {
    setActiveStep(1);
    setShipmentType('');
    setShowShipmentForm(false);
    setEditingShipment(null);
    setValidationErrors({});
    setFormData(INITIAL_FORM_DATA);
    setSelectedFiles([]);
    
    sessionStorage.removeItem('editing_shipment');
    sessionStorage.removeItem('creating_shipment');
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = {...prev};
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [validationErrors]);

  const handleOrgInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setOrgFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleShipmentTypeSelect = useCallback((type) => {
    setShipmentType(type);
    setFormData(prev => ({ ...prev, jobNo: '' }));
    if (validationErrors.shipmentType) {
      setValidationErrors(prev => {
        const newErrors = {...prev};
        delete newErrors.shipmentType;
        return newErrors;
      });
    }
  }, [validationErrors]);

  const handleCreateOrganization = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .insert([orgFormData])
        .select();
      
      if (error) throw error;
      
      setFormData(prev => ({
        ...prev,
        client: data[0].name
      }));
      
      if (validationErrors.client) {
        setValidationErrors(prev => {
          const newErrors = {...prev};
          delete newErrors.client;
          return newErrors;
        });
      }
      
      setShowOrgModal(false);
      setSuccess('Organization created successfully!');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [orgFormData, validationErrors]);

  const preparePDFData = (shipmentData, result, isEditing) => {
    return {
      ...shipmentData,
      shipmentNo: isEditing ? (editingShipment.shipment_no || editingShipment.shipmentNo) : (result?.[0]?.shipment_no || `MTD-${result?.[0]?.id?.toString().padStart(6, '0') || 'DOCUMENT'}`),
      mtdNumber: isEditing ? (editingShipment.shipment_no || editingShipment.shipmentNo) : (result?.[0]?.shipment_no || `MTD-${result?.[0]?.id?.toString().padStart(6, '0') || 'DOCUMENT'}`),
      hs_code: shipmentData.hs_code || '',
      gross_weight: shipmentData.gross_weight || '',
      net_weight: shipmentData.net_weight || '',
      volume: shipmentData.volume || '',
      job_no: shipmentData.job_no || '',
      shipper_tel: '',
      shipper_fax: '',
      consignee_address: shipmentData.address || '',
      consignee_contact: '',
      consignee_tel: '',
      notify_party_address: shipmentData.address || '',
      notify_party_contact: '',
      notify_party_tel: '',
      transhipment: 'None',
      mode_of_transport: shipmentData.service_type || '',
      marks: 'BOX NO.1,2,3,4,5,6, 7,8,9,10,',
      sealNo: '20SD86 WHA1382852',
      packages: shipmentData.no_of_res ? `${shipmentData.no_of_res} (${shipmentData.no_of_res} BOXES ONLY)` : '15 (FIFTEEN BOXES ONLY)',
      description: shipmentData.description || 'CI CASTING (SIDE COVER R, SIDE COVER C, BALANCE WEIGHT,',
      place_of_issue: shipmentData.branch || 'New Delhi',
      date_of_issue: shipmentData.shipment_date || new Date().toLocaleDateString('en-GB'),
      number_of_originals: 'THREE (03)',
      delivery_agent: shipmentData.carrier || '',
      delivery_agent_address: '',
      delivery_agent_tel: '',
      delivery_agent_fax: '',
      jurisdiction: 'INDIAN',
    };
  };

  const handleConfirmShipment = useCallback(async () => {
    if (validateStep(activeStep)) {
      try {
        setLoading(true);
        
        let userEmail = 'Unknown';
        let userId = 'anon';
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            userEmail = user.email;
            userId = user.id;
          }
        } catch (err) {
          console.warn('Could not fetch user for audit trail', err);
        }

        let podDocs = formData.pod_documents ? [...formData.pod_documents] : [];
        if (selectedFiles && selectedFiles.length > 0) {
          for (const file of selectedFiles) {
            const uploadResult = await uploadFile(file, userId, 'pod-attachments');
            if (uploadResult && uploadResult.path) {
              podDocs.push({
                path: uploadResult.path,
                name: file.name
              });
            }
          }
        }
        
        const formatDateForDB = (dateValue) => {
          if (!dateValue || dateValue.toString().trim() === '') {
            return null;
          }
          return dateValue;
        };

        const formatNumericForDB = (numericValue) => {
          if (!numericValue || numericValue.toString().trim() === '') {
            return null;
          }
          const num = parseFloat(numericValue);
          return isNaN(num) ? null : num;
        };

        const formatStringForDB = (stringValue) => {
          if (!stringValue || stringValue.toString().trim() === '') {
            return null;
          }
          return stringValue;
        };

        const shipmentData = {
          branch: formatStringForDB(formData.branch),
          department: formatStringForDB(formData.department),
          shipment_date: formatDateForDB(formData.shipmentDate),
          client: formatStringForDB(formData.client),
          client_email: formatStringForDB(formData.client_email),
          shipper: formatStringForDB(formData.shipper),
          consignee: formatStringForDB(formData.consignee),
          address: formatStringForDB(formData.address),
          por: formatStringForDB(formData.por),
          poi: formatStringForDB(formData.poi),
          pod: formatStringForDB(formData.pod),
          pof: formatStringForDB(formData.pof),
          hbl_no: formatStringForDB(formData.hblNo),
          job_no: formatStringForDB(formData.jobNo),
          etd: formatDateForDB(formData.etd),
          eta: formatDateForDB(formData.eta),
          lcl_fcl: formatStringForDB(formData.lclFcl),
          incoterms: formatStringForDB(formData.incoterms),
          service_type: formatStringForDB(formData.serviceType),
          freight: formatStringForDB(formData.freight),
          payable_at: formatStringForDB(formData.payableAt),
          dispatch_at: formatStringForDB(formData.dispatchAt),
          hs_code: formatStringForDB(formData.HSCode),
          pol: formatStringForDB(formData.pol),
          pdf: formatStringForDB(formData.pdf),
          carrier: formatStringForDB(formData.carrier),
          vessel_name_summary: formatStringForDB(formData.vesselNameSummary),
          no_of_res: formatNumericForDB(formData.noOfRes),
          volume: formatNumericForDB(formData.volume),
          gross_weight: formatNumericForDB(formData.grossWeight),
          description: formatStringForDB(formData.description),
          remarks: formatStringForDB(formData.remarks),
          mtd_registration_no: formatStringForDB(formData.mtdRegistrationNo),
          shipment_type: shipmentType,
          trade_direction: formatStringForDB(formData.tradeDirection),
          pod_documents: podDocs,
          updated_at: new Date().toISOString(),
          
          airport_of_departure: formatStringForDB(formData.airport_of_departure),
          airport_of_destination: formatStringForDB(formData.airport_of_destination),
          no_of_packages: formatNumericForDB(formData.no_of_packages),
          dimension_cms: formatStringForDB(formData.dimension_cms),
          chargeable_weight: formatNumericForDB(formData.chargeable_weight),
          client_no: formatStringForDB(formData.client_no),
          name_of_airline: formatStringForDB(formData.name_of_airline),
          awb: formatStringForDB(formData.awb),
          flight_from: formatStringForDB(formData.flight_from),
          flight_to: formatStringForDB(formData.flight_to),
          flight_eta: formatDateForDB(formData.flight_eta),
          invoiceNo: formatStringForDB(formData.invoiceNo),
          invoiceDate: formatDateForDB(formData.invoiceDate),
          notify_party: formatStringForDB(formData.notify_party),
          
          exporter: formatStringForDB(formData.exporter),
          importer: formatStringForDB(formData.importer),
          stuffingDate: formatDateForDB(formData.stuffingDate),
          hoDate: formatDateForDB(formData.hoDate),
          terms: formatStringForDB(formData.terms),
          sbNo: formatStringForDB(formData.sbNo),
          sbDate: formatDateForDB(formData.sbDate),
          boe_no: formatStringForDB(formData.boeNo),
          boe_date: formatDateForDB(formData.boeDate),
          destination: formatStringForDB(formData.destination),
          commodity: formatStringForDB(formData.commodity),
          fob: formatStringForDB(formData.fob),
          grWeight: formatNumericForDB(formData.grWeight),
          netWeight: formatNumericForDB(formData.netWeight),
          railOutDate: formatDateForDB(formData.railOutDate),
          containerNo: formatStringForDB(formData.containerNo),
          noOfCntr: formatNumericForDB(formData.noOfCntr),
          sLine: formatStringForDB(formData.sLine),
          mblNo: formatStringForDB(formData.mblNo),
          mblDate: formatDateForDB(formData.mblDate),
          hblDt: formatDateForDB(formData.hblDt),
          vessel: formatStringForDB(formData.vessel),
          voy: formatStringForDB(formData.voy),
          sob: formatStringForDB(formData.sob),
          ac: formatStringForDB(formData.ac),
          billNo: formatStringForDB(formData.billNo),
          billDate: formatDateForDB(formData.billDate),
          ccPort: formatStringForDB(formData.ccPort),
        };
        
        const cleanShipmentData = Object.fromEntries(
          Object.entries(shipmentData).filter(([_, value]) => value !== null && value !== undefined)
        );
        
        let result;
        if (editingShipment) {
          cleanShipmentData.updated_by = userEmail;
          const { data: updatedShipment, error } = await supabase
            .from('shipments')
            .update(cleanShipmentData)
            .eq('id', editingShipment.id)
            .select();
          
          if (error) throw error;
          result = updatedShipment;
        } else {
          const { count, error: countErr } = await supabase
            .from('shipments')
            .select('*', { count: 'exact', head: true });
          
          if (countErr) console.error('Error fetching shipment count:', countErr);
          
          const nextNum = (count || 0) + 1;
          const shipmentNo = `MTD-${String(nextNum).padStart(6, '0')}`;
          
          const { data: newShipment, error } = await supabase
            .from('shipments')
            .insert([{ ...cleanShipmentData, shipment_no: shipmentNo, created_by: userEmail }])
            .select();
          
          if (error) throw error;
          result = newShipment;
        }
        
        const preparedPDFData = preparePDFData(cleanShipmentData, result, !!editingShipment);
        setPdfShipmentData(preparedPDFData);
        setGeneratePDF(true);
        
        handleCancel();
        sessionStorage.removeItem('editing_shipment');
        sessionStorage.removeItem('creating_shipment');
        
        setSuccess(editingShipment ? 'Shipment updated successfully!' : 'Shipment created successfully!');
        fetchShipments();
      } catch (error) {
        console.error('Error saving shipment:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }
  }, [formData, shipmentType, editingShipment, activeStep, validateStep, handleCancel, selectedFiles, uploadFile]);

  const handleEditShipment = useCallback((shipment) => {
    window.dispatchEvent(new CustomEvent('open_global_shipment_form', { detail: shipment }));
  }, []);

  const handleDeleteShipment = useCallback(async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('shipments')
        .delete()
        .eq('id', shipmentToDelete.id);
      
      if (error) throw error;
      
      setShowDeleteModal(false);
      setShipmentToDelete(null);
      setSuccess('Shipment deleted successfully!');
      fetchShipments();
    } catch (error) {
      console.error('Error deleting shipment:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [shipmentToDelete]);

  const confirmDelete = useCallback((shipment) => {
    setShipmentToDelete(shipment);
    setShowDeleteModal(true);
  }, []);

  const SpecificFields = useMemo(() => {
    if (!shipmentType) return null;
    
    if (shipmentType === 'AIR FREIGHT') {
      return (
        <div className="specific-fields-section">
          <h3>Air Freight Details - {formData.tradeDirection}</h3>
          <div className="form-grid-two-column">
            <div className="form-group">
              <label>MTD Registration No.</label>
              <input 
                type="text"
                name="mtdRegistrationNo"
                value={formData.mtdRegistrationNo}
                onChange={handleInputChange}
                placeholder="Enter MTD Registration Number"
              />
            </div>
            {[
              { label: 'Airport of Departure', name: 'airport_of_departure', type: 'text' },
              { label: 'Airport of Destination', name: 'airport_of_destination', type: 'text' },
              { label: 'No of Packages', name: 'no_of_packages', type: 'number' },
              { label: 'Dimension (CMS)', name: 'dimension_cms', type: 'text' },
              { label: 'Chargeable Weight', name: 'chargeable_weight', type: 'number' },
              { label: 'Client No', name: 'client_no', type: 'text' },
              { label: 'Name of Airline', name: 'name_of_airline', type: 'text' },
              { label: 'AWB', name: 'awb', type: 'text' },
              { label: 'Flight From', name: 'flight_from', type: 'text' },
              { label: 'Flight To', name: 'flight_to', type: 'text' },
              { label: 'Flight ETA', name: 'flight_eta', type: 'date' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text' },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date' },
              { label: 'Notify Party', name: 'notify_party', type: 'text' },
            ].map((field, index) => (
              <div key={index} className="form-group">
                <label>{field.label}</label>
                <input 
                  type={field.type}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (shipmentType === 'TRANSPORT') {
      return (
        <div className="specific-fields-section">
          <h3>Land Freight Details - {formData.tradeDirection}</h3>
          <div className="form-grid-two-column">
            <div className="form-group">
              <label>MTD Registration No.</label>
              <input 
                type="text"
                name="mtdRegistrationNo"
                value={formData.mtdRegistrationNo}
                onChange={handleInputChange}
                placeholder="Enter MTD Registration Number"
              />
            </div>
            <div className="form-group">
              <label>LCL/FCL</label>
              <select 
                name="lclFcl"
                value={formData.lclFcl}
                onChange={handleInputChange}
              >
                <option value="">Select Option</option>
                <option value="LCL">LCL (Less than Container Load)</option>
                <option value="FCL">FCL (Full Container Load)</option>
              </select>
            </div>
          </div>
        </div>
      );
    }
    
    if (shipmentType === 'SEA FREIGHT') {
      return (
        <div className="specific-fields-section">
          <h3>Sea Freight Details - {formData.tradeDirection}</h3>
          <div className="form-grid-two-column">
            <div className="form-group">
              <label>MTD Registration No.</label>
              <input 
                type="text"
                name="mtdRegistrationNo"
                value={formData.mtdRegistrationNo}
                onChange={handleInputChange}
                placeholder="Enter MTD Registration Number"
              />
            </div>
            {[
              { label: 'Exporter', name: 'exporter', type: 'text', condition: formData.tradeDirection === 'EXPORT' },
              { label: 'Importer', name: 'importer', type: 'text', condition: formData.tradeDirection === 'IMPORT' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text', condition: true },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date', condition: true },
              { label: 'Stuffing Date', name: 'stuffingDate', type: 'date', condition: true },
              { label: 'H/O Date', name: 'hoDate', type: 'date', condition: true },
              { label: 'Terms', name: 'terms', type: 'text', condition: true },
              { label: 'S/B No', name: 'sbNo', type: 'text', condition: formData.tradeDirection === 'EXPORT' },
              { label: 'S/B Date', name: 'sbDate', type: 'date', condition: formData.tradeDirection === 'EXPORT' },
              { label: 'BOE', name: 'boeNo', type: 'text', condition: formData.tradeDirection === 'IMPORT' },
              { label: 'BOE Date', name: 'boeDate', type: 'date', condition: formData.tradeDirection === 'IMPORT' },
              { label: 'Destination', name: 'destination', type: 'text', condition: true },
              { label: 'Commodity', name: 'commodity', type: 'text', condition: true },
              { label: 'FOB', name: 'fob', type: 'text', condition: true },
              { label: 'GR Weight', name: 'grWeight', type: 'number', condition: true },
              { label: 'Net Weight', name: 'netWeight', type: 'number', condition: true },
              { label: 'RAIL Out Date', name: 'railOutDate', type: 'date', condition: true },
              { label: 'Container No', name: 'containerNo', type: 'text', condition: true },
              { label: 'No of CNTR', name: 'noOfCntr', type: 'number', condition: true },
              { label: 'S/Line', name: 'sLine', type: 'text', condition: true },
              { label: 'MBL No', name: 'mblNo', type: 'text', condition: true },
              { label: 'MBL Date', name: 'mblDate', type: 'date', condition: true },
              { label: 'HBL DT', name: 'hblDt', type: 'date', condition: true },
              { label: 'VESSEL', name: 'vessel', type: 'text', condition: true },
              { label: 'VOY', name: 'voy', type: 'text', condition: true },
              { label: 'SOB', name: 'sob', type: 'text', condition: true },
              { label: 'A/C', name: 'ac', type: 'text', condition: true },
              { label: 'Bill No', name: 'billNo', type: 'text', condition: true },
              { label: 'Bill Date', name: 'billDate', type: 'date', condition: true },
              { label: 'C/C Port', name: 'ccPort', type: 'text', condition: true },
            ].map((field, index) => 
              field.condition ? (
                <div key={index} className="form-group">
                  <label>{field.label}</label>
                  <input 
                    type={field.type}
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleInputChange}
                  />
                </div>
              ) : null
            )}
          </div>
        </div>
      );
    }
    
    return null;
  }, [shipmentType, formData.tradeDirection, formData.mtdRegistrationNo, formData.lclFcl, handleInputChange]);

  return (
    <div className="new-shipment-container">
      {showDeleteModal && (
        <div className="modal-overlay" style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: 'white', padding: '24px', borderRadius: '8px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: '#d9534f' }}>Confirm Deletion</h3>
            <p>Are you sure you want to delete shipment <strong>{shipmentToDelete?.shipment_no || shipmentToDelete?.shipmentNo}</strong>? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={() => setShowDeleteModal(false)}
                style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ccc', background: '#f8f9fa', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteShipment}
                style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#d9534f', color: 'white', cursor: 'pointer' }}
              >
                {loading ? 'Deleting...' : 'Delete Shipment'}
              </button>
            </div>
          </div>
        </div>
      )}
      {generatePDF && pdfShipmentData && (
        <div style={{ 
          textAlign: 'center', 
          margin: '20px 0', 
          padding: '15px', 
          backgroundColor: '#e8f4f8', 
          borderRadius: '8px',
          border: '1px solid #b3e0ff'
        }}>
          <h4 style={{ marginBottom: '10px', color: '#0066cc' }}>
            {editingShipment ? 'Shipment Updated!' : 'Shipment Created!'}
          </h4>
          <p style={{ marginBottom: '15px' }}>
            Download your {editingShipment ? 'updated' : 'new'} shipment document:
          </p>
          <Suspense fallback={<div style={{ color: '#666' }}>Preparing PDF...</div>}>
            <PDFDownloadLink
              document={<PDFGenerator shipmentData={pdfShipmentData} />}
              fileName={`${pdfShipmentData.shipmentNo}.pdf`}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#0066cc',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                marginBottom: '10px'
              }}
            >
              {({ loading }) => loading ? 'Generating PDF...' : `Download ${pdfShipmentData.shipmentNo}.pdf`}
            </PDFDownloadLink>
          </Suspense>
          <div>
            <button
              onClick={() => setGeneratePDF(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}

      {error && (
        <div className="error-message">
          Error: {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {success && (
        <div className="success-message">
          {success}
          <button onClick={() => setSuccess(false)}>Dismiss</button>
        </div>
      )}
      
      <div className="card expandable-card">
        <div className="table-header">
          <h2>Current Shipments</h2>
          <button className="add-shipment-btn" onClick={() => window.dispatchEvent(new CustomEvent('open_global_shipment_form'))}>
            <span className="plus-icon">+</span>
            Add Shipment
          </button>
        </div>
        <div
          className="table-container"
          ref={tableContainerRef}
          style={{ maxHeight: 'calc(100vh - 250px)', minHeight: '500px', overflowY: 'auto' }}
        >
          <table className="activity-table">
            <thead>
              <tr>
                <th>Shipment No.</th>
                <th>Client</th>
                <th>Job No.</th>
                <th>POR</th>
                <th>POF</th>
                <th>Author</th>
                <th>POD</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length > 0 ? (
                shipments.map((shipment, index) => (
                  <tr key={index}>
                    <td>{shipment.shipmentNo}</td>
                    <td>{shipment.client}</td>
                    <td>{shipment.jobNo}</td>
                    <td>{shipment.por}</td>
                    <td>{shipment.pof}</td>
                    <td>
                      {shipment.created_by && <div className="audit-badge" title={`Created By: ${shipment.created_by}`}><UserPlus size={12} /> {shipment.created_by.split('@')[0]}</div>}
                      {shipment.updated_by && <div className="audit-badge edit" title={`Updated By: ${shipment.updated_by}`}><PenLine size={12} /> {shipment.updated_by.split('@')[0]}</div>}
                    </td>
                    <td>
                      {shipment.pod_documents && shipment.pod_documents.length > 0 ? (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {shipment.pod_documents.map((doc, idx) => (
                            <a 
                              key={idx}
                              href={getFileUrl(doc.path, 'pod-attachments')} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="pod-table-link"
                              title={`View POD: ${doc.name || 'Document ' + (idx + 1)}`}
                            >
                              <FileText size={18} />
                            </a>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="edit-btn"
                        onClick={() => handleEditShipment(shipment)}
                        title="Edit Shipment"
                      >
                        Edit
                      </button>
                      <button 
                        className="delete-btn"
                        onClick={() => confirmDelete(shipment)}
                        title="Delete Shipment"
                      >
                        Delete
                      </button>
                      <button
                        className="pdf-btn"
                        onClick={() => {
                          setPdfShipmentData(shipment);
                          setGeneratePDF(true);
                        }}
                        style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          border: 'none',
                          cursor: 'pointer',
                          marginLeft: '5px'
                        }}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{textAlign: 'center', padding: '20px'}}>
                    No shipments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      </div>
  );
};

export default NewShipments;
