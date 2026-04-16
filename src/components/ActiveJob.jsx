// src/components/ActiveJob.jsx
import './ActivityTable.css';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { UserPlus, PenLine, FileUp, ExternalLink, FileText } from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabaseClient';

// Constants for better maintainability
const JOB_TYPES = ['AIR FREIGHT', 'SEA FREIGHT',  'TRANSPORT', 'OTHERS'];
const TRADE_DIRECTIONS = {
  'AIR FREIGHT': ['EXPORT', 'IMPORT'],
  'SEA FREIGHT': ['EXPORT', 'IMPORT'],
  'TRANSPORT': ['EXPORT', 'IMPORT', 'LOCAL'],
  'OTHERS': ['EXPORT', 'IMPORT']
};
const STEPS = ['Create Job', 'Trade Direction', 'Port Details', 'Summary'];
const CATEGORIES = [
  'AGENT', 'ARLINE', 'BANK', 'BIKE', 'BIOKER', 'BUYER', 
  'CAREER', 'CAREER AGENT'
];

// Function to generate unique job numbers
const generateJobNumber = () => {
  const timestamp = new Date().getTime().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${timestamp}${random}`;
};

// Initial form data
const INITIAL_FORM_DATA = {
  branch: '',
  department: '',
  jobDate: new Date().toISOString().split('T')[0],
  client: '',
  shipper: '',
  consignee: '',
  address: '',
  por: '',
  poi: '',
  pod: '',
  pof: '',
  jobNo: generateJobNumber(),
  etd: '',
  eta: '',
  incoterms: '',
  serviceType: '',
  freight: '',
  payableAt: '',
  dispatchAt: '',
  lclFcl: '',
  
  // Sea freight fields
  pol: '',
  pdf: '',
  carrier: '',
  vesselNameSummary: '',
  noOfRes: '',
  volume: '',
  grossWeight: '',
  description: '',
  remarks: '',
  
  // Sea freight step 2 fields
  containerType: '',
  exporter: '',
  importer: '',
  invoiceNo: '',
  invoiceDate: '',
  stuffingDate: '',
  hoDate: '',
  terms: '',
  noOfCartoons: '',
  sbNo: '',
  sbDate: '',
  boeNo: '',
  boeDate: '',
  destination: '',
  commodity: '',
  invoiceValue: '',
  grWeight: '',
  netWeight: '',
  railOutDate: '',
  containerNo: '',
  noOfCntr: '',
  sLine: '',
  mblNo: '',
  mblDate: '',
  hblNo: '',
  hblDt: '',
  vessel: '',
  voy: '',
  sob: '',
  ac: '',
  billNo: '',
  billDate: '',
  ccPort: '',
  
  // Air freight fields
  notify_party: '',
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
  
  // Transport fields
  port: '',
  vehicle_type: '', 
  size: '',
  lrn_no: '',
  from: '',
  to: '',
  shipper_name: '',
  party_name: '',
  factory_reporting_date: '',
  factory_reporting_out: '',
  offloading_date: '',
  days_of_detention: '',
  transporter: '',
  vehicle_buy_amount: '',
  vehicle_billing_amount: '',
  movement: '',
  driver_name: '',
  driver_mobile_no: '',
  bill_no: '',
  bill_date: '',
  amount: '',
  pod_attachment: ''
};

const INITIAL_ORG_FORM_DATA = {
  name: 'KRYTON LOGISTICS',
  recordStatus: 'Active',
  salesPerson: '',
  category: 'AGENT',
  branch: 'CHENNAI',
  contactPerson: 'ARUNA',
  doorNo: '',
  buildingName: '',
  street: '',
  area: '',
  city: '',
  state: ''
};

const ActiveJob = () => {
  const navigate = useNavigate();
  const tableContainerRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState('auto');
  const [showJobForm, setShowJobForm] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [jobType, setJobType] = useState('');
  const [tradeDirection, setTradeDirection] = useState('');
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [orgFormData, setOrgFormData] = useState(INITIAL_ORG_FORM_DATA);
  const [editingJob, setEditingJob] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobSummary, setShowJobSummary] = useState(false);
  const { uploadFile, getFileUrl, uploading, progress: uploadProgress } = useFileUpload();
  const [selectedFile, setSelectedFile] = useState(null);

  // ============ FIX 1: RESTORE STATE ON MOUNT ============
  useEffect(() => {
    // Restore editing state if exists
    const savedEditingState = sessionStorage.getItem('editing_job');
    const savedCreatingState = sessionStorage.getItem('creating_job');
    
    if (savedEditingState) {
      try {
        const state = JSON.parse(savedEditingState);
        setEditingJob(state.job);
        setFormData(state.formData);
        setJobType(state.jobType);
        setTradeDirection(state.tradeDirection);
        setActiveStep(state.activeStep);
        setShowJobForm(true);
        console.log('Restored editing state from sessionStorage');
      } catch (e) {
        console.error('Error restoring editing state:', e);
        sessionStorage.removeItem('editing_job');
      }
    } else if (savedCreatingState) {
      try {
        const state = JSON.parse(savedCreatingState);
        setFormData(state.formData);
        setJobType(state.jobType);
        setTradeDirection(state.tradeDirection);
        setActiveStep(state.activeStep);
        setShowJobForm(true);
        console.log('Restored creating state from sessionStorage');
      } catch (e) {
        console.error('Error restoring creating state:', e);
        sessionStorage.removeItem('creating_job');
      }
    }
  }, []); // Empty dependency array - run only once on mount

  // ============ FIX 2: AUTO-SAVE STATE TO SESSIONSTORAGE ============
  useEffect(() => {
    if (showJobForm && editingJob) {
      // Save editing state to sessionStorage
      sessionStorage.setItem('editing_job', JSON.stringify({
        job: editingJob,
        formData: formData,
        jobType: jobType,
        tradeDirection: tradeDirection,
        activeStep: activeStep
      }));
    } else if (showJobForm) {
      // Save creating state
      sessionStorage.setItem('creating_job', JSON.stringify({
        formData: formData,
        jobType: jobType,
        tradeDirection: tradeDirection,
        activeStep: activeStep
      }));
    } else {
      // Clear saved state when modal is closed
      sessionStorage.removeItem('editing_job');
      sessionStorage.removeItem('creating_job');
    }
  }, [showJobForm, editingJob, formData, jobType, tradeDirection, activeStep]);

  // ============ FIX 3: PREVENT TAB DISCARD ============
  useEffect(() => {
    if (!showJobForm) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    // Add warning before leaving page
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Keep page active to prevent Chrome tab discarding
    const keepAlive = setInterval(() => {
      document.title = document.title; // Dummy operation
    }, 30000); // Every 30 seconds

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(keepAlive);
    };
  }, [showJobForm]);

  // Memoize required fields based on job type
  const requiredFields = useMemo(() => {
    if (jobType === 'AIR FREIGHT') {
      return {
        1: ['jobType'],
        2: ['tradeDirection'],
        3: ['jobNo', 'shipper', 'consignee', 'notify_party', 'airport_of_departure', 
            'airport_of_destination', 'no_of_packages', 'grossWeight', 'dimension_cms',
            'chargeable_weight', 'client_no', 'name_of_airline', 'awb', 'flight_from',
            'flight_to', 'flight_eta', 'invoiceNo', 'invoiceDate'],
        4: []
      };
    } else if (jobType === 'TRANSPORT') {
      return {
        1: ['jobType'],
        2: ['tradeDirection'],
        3: ['lclFcl', 'jobNo', 'port', 'vehicle_type', 'containerNo', 'containerType', 'size', 'lrn_no', 'from', 'to',
            'shipper_name', 'party_name', 'factory_reporting_date', 'factory_reporting_out',
            'offloading_date', 'days_of_detention', 'transporter', 'vehicle_buy_amount',
            'vehicle_billing_amount', 'movement', 'driver_name', 'driver_mobile_no',
            'bill_no', 'bill_date', 'amount'],
        4: []
      };
    } else {
      return {
        1: ['jobType'],
        2: ['tradeDirection'],
        3: ['jobNo', 'exporter', 'importer', 'invoiceNo', 'invoiceDate', 'stuffingDate', 
            'hoDate', 'terms', 'consignee', 'noOfCartoons', 'sbNo', 'sbDate',
            'pol', 'pod', 'destination', 'commodity', 'invoiceValue',
            'grWeight', 'netWeight', 'railOutDate', 'containerNo', 'containerType', 'noOfCntr', 'volume',
            'sLine', 'mblNo', 'mblDate', 'hblNo', 'hblDt', 'vessel', 'voy',
            'etd', 'sob', 'eta', 'ac', 'billNo', 'billDate', 'ccPort'],
        4: []
      };
    }
  }, [jobType]);

  // Function to get location fields based on job type
  const getLocationFields = useCallback((job) => {
    switch(job.job_type) {
      case 'AIR FREIGHT':
        return {
          from: job.airport_of_departure,
          to: job.airport_of_destination
        };
      case 'TRANSPORT':
        return {
          from: job.from,
          to: job.to
        };
      default: // SEA FREIGHT and OTHERS
        return {
          from: job.pol,
          to: job.pod
        };
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Map database fields to display fields
      const mappedJobs = (data || []).map(job => {
        const locationFields = getLocationFields(job);
        
        // Helper function to safely handle null values
        const safeValue = (value) => value || '';
        
        return {
          id: job.id,
          jobNo: safeValue(job.job_no),
          client: safeValue(job.client),
          from: safeValue(job.from_location),
          to: safeValue(job.to_location),
          createdAt: job.created_at ? new Date(job.created_at).toLocaleDateString() : '',
          updatedAt: job.updated_at ? new Date(job.updated_at).toLocaleDateString() : '',
          eta: job.eta ? new Date(job.eta).toLocaleDateString() : '',
          flight_eta: job.flight_eta ? new Date(job.flight_eta).toLocaleDateString() : '',
          jobType: safeValue(job.job_type),
          tradeDirection: safeValue(job.trade_direction),
          
          // Include all fields that might be needed for the summary view
          shipper: safeValue(job.shipper),
          consignee: safeValue(job.consignee),
          exporter: safeValue(job.exporter),
          importer: safeValue(job.importer),
          no_of_packages: job.no_of_packages,
          gross_weight: job.gross_weight,
          chargeable_weight: job.chargeable_weight,
          name_of_airline: safeValue(job.name_of_airline),
          awb: safeValue(job.awb),
          airport_of_departure: safeValue(job.airport_of_departure),
          airport_of_destination: safeValue(job.airport_of_destination),
          shipper_name: safeValue(job.shipper_name),
          party_name: safeValue(job.party_name),
          transporter: safeValue(job.transporter),
          driver_name: safeValue(job.driver_name),
          vehicle_billing_amount: job.vehicle_billing_amount,
          amount: job.amount,
          volume: job.volume,
          container_no: safeValue(job.container_no),
          vessel: safeValue(job.vessel),
          pol: safeValue(job.pol),
          pod: safeValue(job.pod),
          // Add all other original fields from the database
          ...job
        };
      });
      
      setJobs(mappedJobs);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [getLocationFields]);

  // Load jobs on component mount
  useEffect(() => {
    fetchJobs();
    
    // Subscribe to realtime jobs updates (Optimistic / Smart Update)
    const channel = supabase
      .channel('public:jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, payload => {
        setJobs(currentJobs => {
          if (payload.eventType === 'DELETE') {
             return currentJobs.filter(j => j.id !== payload.old.id);
          }
          
          const job = payload.new;
          if (job.status !== 'active') {
             return currentJobs.filter(j => j.id !== job.id);
          }
          
          let from_loc = '';
          let to_loc = '';
          switch(job.job_type) {
             case 'AIR FREIGHT': from_loc = job.airport_of_departure; to_loc = job.airport_of_destination; break;
             case 'TRANSPORT': from_loc = job.from_location; to_loc = job.to_location; break;
             default: from_loc = job.pol; to_loc = job.pod; break;
          }
          
          const safeValue = (value) => value || '';
          
          const mappedJob = {
            id: job.id,
            jobNo: safeValue(job.job_no),
            client: safeValue(job.client),
            from: safeValue(from_loc),
            to: safeValue(to_loc),
            createdAt: job.created_at ? new Date(job.created_at).toLocaleDateString() : '',
            updatedAt: job.updated_at ? new Date(job.updated_at).toLocaleDateString() : '',
            eta: job.eta ? new Date(job.eta).toLocaleDateString() : '',
            flight_eta: job.flight_eta ? new Date(job.flight_eta).toLocaleDateString() : '',
            jobType: safeValue(job.job_type),
            tradeDirection: safeValue(job.trade_direction),
            shipper: safeValue(job.shipper),
            consignee: safeValue(job.consignee),
            exporter: safeValue(job.exporter),
            importer: safeValue(job.importer),
            no_of_packages: job.no_of_packages,
            gross_weight: job.gross_weight,
            chargeable_weight: job.chargeable_weight,
            name_of_airline: safeValue(job.name_of_airline),
            awb: safeValue(job.awb),
            airport_of_departure: safeValue(job.airport_of_departure),
            airport_of_destination: safeValue(job.airport_of_destination),
            shipper_name: safeValue(job.shipper_name),
            party_name: safeValue(job.party_name),
            transporter: safeValue(job.transporter),
            driver_name: safeValue(job.driver_name),
            vehicle_billing_amount: job.vehicle_billing_amount,
            amount: job.amount,
            volume: job.volume,
            container_no: safeValue(job.container_no),
            vessel: safeValue(job.vessel),
            pol: safeValue(job.pol),
            pod: safeValue(job.pod),
            ...job
          };
          
          if (payload.eventType === 'INSERT') {
             return [mappedJob, ...currentJobs];
          } else if (payload.eventType === 'UPDATE') {
             const existingIdx = currentJobs.findIndex(j => j.id === job.id);
             if (existingIdx >= 0) {
                 const newJobs = [...currentJobs];
                 newJobs[existingIdx] = mappedJob;
                 return newJobs;
             }
             return [mappedJob, ...currentJobs];
          }
          return currentJobs;
        });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs]);


  // Validate current step before proceeding
  const validateStep = (step) => {
    const errors = {};
    const fieldsToValidate = requiredFields[step];
    
    if (step === 1) {
      if (!jobType) errors.jobType = 'Job type is required';
    } else if (step === 2) {
      if (!tradeDirection) errors.tradeDirection = 'Trade direction is required';
    } else {
      fieldsToValidate.forEach(field => {
        if (jobType === 'AIR FREIGHT') {
          if (!formData[field] || formData[field].toString().trim() === '') {
            errors[field] = `${field.replace(/_/g, ' ')} is required`;
          }
        } else if (jobType === 'TRANSPORT') {
          if (!formData[field] || formData[field].toString().trim() === '') {
            errors[field] = `${field.replace(/_/g, ' ')} is required`;
          }
        } else {
          if (field === 'exporter' && tradeDirection === 'EXPORT' && 
              (!formData[field] || formData[field].toString().trim() === '')) {
            errors[field] = `${field} is required`;
          } else if (field === 'importer' && tradeDirection === 'IMPORT' && 
              (!formData[field] || formData[field].toString().trim() === '')) {
            errors[field] = `${field} is required`;
          } else if (field !== 'exporter' && field !== 'importer' && 
              (!formData[field] || formData[field].toString().trim() === '')) {
            errors[field] = `${field} is required`;
          }
        }
      });
    }
    
    setValidationErrors(errors);
    return true;
  };

  const handleNext = useCallback(() => {
    if (validateStep(activeStep)) {
      if (activeStep < STEPS.length) {
        setActiveStep(activeStep + 1);
      }
    }
  }, [activeStep, jobType, tradeDirection, formData, requiredFields]);

  const handleBack = useCallback(() => {
    if (activeStep > 1) {
      setActiveStep(activeStep - 1);
    }
  }, [activeStep]);

  // ============ FIX 4: CLEAR STORAGE ON CANCEL ============
  const handleCancel = useCallback(() => {
    setActiveStep(1);
    setJobType('');
    setTradeDirection('');
    setShowJobForm(false);
    setEditingJob(null);
    setValidationErrors({});
    setFormData({...INITIAL_FORM_DATA, jobNo: generateJobNumber()});
    
    // Clear sessionStorage
    sessionStorage.removeItem('editing_job');
    sessionStorage.removeItem('creating_job');
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
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

  const handleJobTypeSelect = useCallback((type) => {
    setJobType(type);
    // Clear job type validation error if any
    if (validationErrors.jobType) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.jobType;
        return newErrors;
      });
    }
  }, [validationErrors]);

  const handleTradeDirectionSelect = useCallback((direction) => {
    setTradeDirection(direction);
    // Clear trade direction validation error if any
    if (validationErrors.tradeDirection) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.tradeDirection;
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
      
      // Update the client field with the new organization
      setFormData(prev => ({
        ...prev,
        client: data[0].name
      }));
      
      // Clear any client validation error
      if (validationErrors.client) {
        setValidationErrors(prev => {
          const newErrors = { ...prev };
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

  const handleCreateJob = useCallback(async () => {
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

      let podUrl = formData.pod_attachment;
      if (selectedFile) {
        const uploadResult = await uploadFile(selectedFile, userId, 'pod-attachments');
        podUrl = uploadResult.path;
      }
      
      // Function to convert empty strings to null for numeric fields
      const cleanNumericValue = (value) => {
        if (value === "" || value === null || value === undefined) {
          return null;
        }
        // Convert string numbers to actual numbers
        if (typeof value === 'string' && value.trim() !== "") {
          return Number(value);
        }
        return value;
      };

      // Prepare job data for insertion with proper value handling
      const jobData = {
        // Map all your fields to match database columns
        job_no: formData.jobNo,
        client: formData.client,
        shipper: formData.shipper,
        consignee: formData.consignee,
        
        // Handle numeric fields
        no_of_packages: cleanNumericValue(formData.no_of_packages),
        gross_weight: cleanNumericValue(formData.grossWeight),
        chargeable_weight: cleanNumericValue(formData.chargeable_weight),
        no_of_cartoons: cleanNumericValue(formData.noOfCartoons),
        gr_weight: cleanNumericValue(formData.grWeight),
        net_weight: cleanNumericValue(formData.netWeight),
        no_of_cntr: cleanNumericValue(formData.noOfCntr),
        volume: cleanNumericValue(formData.volume),
        invoice_no: formData.invoiceNo,
        fob: cleanNumericValue(formData.invoiceValue),
        
        // Handle date fields
        job_date: formData.jobDate ? new Date(formData.jobDate).toISOString() : null,
        etd: formData.etd ? new Date(formData.etd).toISOString() : null,
        eta: formData.eta ? new Date(formData.eta).toISOString() : null,
        flight_eta: formData.flight_eta ? new Date(formData.flight_eta).toISOString() : null,
        invoice_date: formData.invoiceDate ? new Date(formData.invoiceDate).toISOString() : null,
        stuffing_date: formData.stuffingDate ? new Date(formData.stuffingDate).toISOString() : null,
        ho_date: formData.hoDate ? new Date(formData.hoDate).toISOString() : null,
        sb_date: formData.sbDate ? new Date(formData.sbDate).toISOString() : null,
        boe_no: formData.boeNo || null,
        boe_date: formData.boeDate ? new Date(formData.boeDate).toISOString() : null,
        mbl_date: formData.mblDate ? new Date(formData.mblDate).toISOString() : null,
        hbl_dt: formData.hblDt ? new Date(formData.hblDt).toISOString() : null,
        rail_out_date: formData.railOutDate ? new Date(formData.railOutDate).toISOString() : null,  
        
        // Text fields
        pol: formData.pol || null,
        lcl_fcl: formData.lclFcl || null,
        container_type: formData.containerType || null, 
        pod: formData.pod || null,
        destination: formData.destination || null,
        commodity: formData.commodity || null,
        terms: formData.terms || null,
        sb_no: formData.sbNo || null,
        container_no: formData.containerNo || null,
        s_line: formData.sLine || null,
        exporter: formData.exporter || null,
        mbl_no: formData.mblNo || null,
        hbl_no: formData.hblNo || null,
        vessel: formData.vessel || null,
        voy: formData.voy || null,
        sob: formData.sob || null,
        ac: formData.ac || null,
        bill_no: formData.billNo || null,
        cc_port: formData.ccPort || null,
        notify_party: formData.notify_party || null,
        airport_of_departure: formData.airport_of_departure || null,
        airport_of_destination: formData.airport_of_destination || null,
        dimension_cms: formData.dimension_cms || null,
        client_no: formData.client_no || null,
        name_of_airline: formData.name_of_airline || null,
        awb: formData.awb || null,
        flight_from: formData.flight_from || null,
        flight_to: formData.flight_to || null,
        
        // Transport fields
        port: formData.port || null,
        vehicle_type: formData.vehicle_type || null,
        size: formData.size || null,
        lrn_no: formData.lrn_no || null,
        from_location: formData.from || null,
        to_location: formData.to || null,
        shipper_name: formData.shipper_name || null,
        party_name: formData.party_name || null,
        factory_reporting_date: formData.factory_reporting_date ? new Date(formData.factory_reporting_date).toISOString() : null,
        factory_reporting_out: formData.factory_reporting_out ? new Date(formData.factory_reporting_out).toISOString() : null,
        offloading_date: formData.offloading_date ? new Date(formData.offloading_date).toISOString() : null,
        days_of_detention: cleanNumericValue(formData.days_of_detention),
        transporter: formData.transporter || null,
        vehicle_buy_amount: cleanNumericValue(formData.vehicle_buy_amount),
        vehicle_billing_amount: cleanNumericValue(formData.vehicle_billing_amount),
        movement: formData.movement || null,
        driver_name: formData.driver_name || null,
        driver_mobile_no: formData.driver_mobile_no || null,
        bill_date: formData.bill_date ? new Date(formData.bill_date).toISOString() : null,
        amount: cleanNumericValue(formData.amount),
        
        job_type: jobType,
        trade_direction: tradeDirection,
        pod_attachment: podUrl,
        status: 'active',
        updated_at: new Date().toISOString()
      };
       
      let result;
      if (editingJob) {
        // Update existing job
        jobData.updated_by = userEmail;
        const { data: updatedJob, error } = await supabase
          .from('jobs')
          .update(jobData)
          .eq('id', editingJob.id)
          .select('*');
        
        if (error) throw error;
        result = updatedJob;
      } else {
        // Create new job
        jobData.created_by = userEmail;
        
        const { data: newJob, error } = await supabase
          .from('jobs')
          .insert([jobData])
          .select('*');
        
        if (error) throw error;
        result = newJob;
      }
      
      // ============ FIX 5: CLEAR STORAGE AFTER SAVE ============
      handleCancel();
      setSelectedFile(null);
      sessionStorage.removeItem('editing_job');
      sessionStorage.removeItem('creating_job');
      
      setSuccess(editingJob ? 'Job updated successfully!' : 'Job created successfully!');
      
      // Refresh the jobs list immediately after creating/updating a job
      fetchJobs();
    } catch (error) {
      console.error('Error saving job:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [formData, jobType, tradeDirection, editingJob, handleCancel, fetchJobs]);

  // Handle edit job
  const handleEditJob = useCallback((job) => {
    setEditingJob(job);
    setJobType(job.job_type);
    setTradeDirection(job.trade_direction);
    
    // Helper function to safely handle null/undefined values
    const safeValue = (value) => value || '';
    
    // Map database fields to form fields
    const formDataFromJob = {
      jobNo: safeValue(job.job_no),
      client: safeValue(job.client),
      shipper: safeValue(job.shipper),
      consignee: safeValue(job.consignee),
      no_of_packages: safeValue(job.no_of_packages),
      grossWeight: safeValue(job.gross_weight),
      chargeable_weight: safeValue(job.chargeable_weight),
      noOfCartoons: safeValue(job.no_of_cartoons),
      grWeight: safeValue(job.gr_weight),
      netWeight: safeValue(job.net_weight),
      lclFcl: safeValue(job.lcl_fcl),
      noOfCntr: safeValue(job.no_of_cntr),
      volume: safeValue(job.volume),
      invoiceValue: safeValue(job.fob),
      jobDate: job.job_date ? new Date(job.job_date).toISOString().split('T')[0] : '',
      etd: job.etd ? new Date(job.etd).toISOString().split('T')[0] : '',
      eta: job.eta ? new Date(job.eta).toISOString().split('T')[0] : '',
      flight_eta: job.flight_eta ? new Date(job.flight_eta).toISOString().split('T')[0] : '',
      invoiceDate: job.invoice_date ? new Date(job.invoice_date).toISOString().split('T')[0] : '',
      stuffingDate: job.stuffing_date ? new Date(job.stuffing_date).toISOString().split('T')[0] : '',
      hoDate: job.ho_date ? new Date(job.ho_date).toISOString().split('T')[0] : '',
      sbDate: job.sb_date ? new Date(job.sb_date).toISOString().split('T')[0] : '',
      mblDate: job.mbl_date ? new Date(job.mbl_date).toISOString().split('T')[0] : '',
      hblDt: job.hbl_dt ? new Date(job.hbl_dt).toISOString().split('T')[0] : '',
      railOutDate: job.rail_out_date ? new Date(job.rail_out_date).toISOString().split('T')[0] : '',
      billDate: job.bill_date ? new Date(job.bill_date).toISOString().split('T')[0] : '',
      pol: safeValue(job.pol),
      containerType: safeValue(job.container_type), 
      pod: safeValue(job.pod),
      destination: safeValue(job.destination),
      commodity: safeValue(job.commodity),
      terms: safeValue(job.terms),
      sbNo: safeValue(job.sb_no),
      containerNo: safeValue(job.container_no),
      sLine: safeValue(job.s_line),
      mblNo: safeValue(job.mbl_no),
      hblNo: safeValue(job.hbl_no),
      vessel: safeValue(job.vessel),
      voy: safeValue(job.voy),
      sob: safeValue(job.sob),
      ac: safeValue(job.ac),
      billNo: safeValue(job.bill_no),
      ccPort: safeValue(job.cc_port),
      notify_party: safeValue(job.notify_party),
      airport_of_departure: safeValue(job.airport_of_departure),
      airport_of_destination: safeValue(job.airport_of_destination),
      dimension_cms: safeValue(job.dimension_cms),
      client_no: safeValue(job.client_no),
      name_of_airline: safeValue(job.name_of_airline),
      awb: safeValue(job.awb),
      flight_from: safeValue(job.flight_from),
      flight_to: safeValue(job.flight_to),
      exporter: safeValue(job.exporter),
      importer: safeValue(job.importer),
      invoiceNo: safeValue(job.invoice_no),
      
      // Transport fields
      port: safeValue(job.port),
      vehicle_type: safeValue(job.vehicle_type),
      lrn_no: safeValue(job.lrn_no),
      from: safeValue(job.from_location),
      to: safeValue(job.to_location),
      shipper_name: safeValue(job.shipper_name),
      party_name: safeValue(job.party_name),
      factory_reporting_date: job.factory_reporting_date ? new Date(job.factory_reporting_date).toISOString().split('T')[0] : '',
      factory_reporting_out: job.factory_reporting_out ? new Date(job.factory_reporting_out).toISOString().split('T')[0] : '',
      offloading_date: job.offloading_date ? new Date(job.offloading_date).toISOString().split('T')[0] : '',
      days_of_detention: safeValue(job.days_of_detention),
      transporter: safeValue(job.transporter),
      vehicle_buy_amount: safeValue(job.vehicle_buy_amount),
      vehicle_billing_amount: safeValue(job.vehicle_billing_amount),
      movement: safeValue(job.movement),
      driver_name: safeValue(job.driver_name),
      driver_mobile_no: safeValue(job.driver_mobile_no),
      bill_no: safeValue(job.bill_no),
      bill_date: job.bill_date ? new Date(job.bill_date).toISOString().split('T')[0] : '',
      amount: safeValue(job.amount),
      pod_attachment: safeValue(job.pod_attachment),
    };
    
    setFormData(formDataFromJob);
    setShowJobForm(true);
    setActiveStep(3);
  }, []);
  
  // Handle delete job
  const handleDeleteJob = useCallback(async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobToDelete.id);
      
      if (error) throw error;
      
      setShowDeleteModal(false);
      setJobToDelete(null);
      setSuccess('Job deleted successfully!');
      
      // Refresh the jobs list
      fetchJobs();
    } catch (error) {
      console.error('Error deleting job:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [jobToDelete, fetchJobs]);

  // Confirm delete
  const confirmDelete = useCallback((job) => {
    setJobToDelete(job);
    setShowDeleteModal(true);
  }, []);

  // Handle job selection for summary view
  const handleJobSelect = useCallback((job) => {
    setSelectedJob(job);
    setShowJobSummary(true);
  }, []);

  // Get column headers based on job type
  const getLocationColumnHeaders = useCallback((jobType) => {
    if (jobType === 'AIR FREIGHT') {
      return ['Airport of Departure', 'Airport of Destination'];
    } else if (jobType === 'TRANSPORT') {
      return ['From', 'To'];
    } else {
      return ['POL', 'POD'];
    }
  }, []);

  // Render step 3 fields based on job type
  const renderStep3Fields = useCallback(() => {
    if (jobType === 'AIR FREIGHT') {
      return (
        <div className="port-details-form">
          <h2>Air Freight Details - {tradeDirection}</h2>
          <div className="form-grid-two-column">
            {[
              { label: 'Job No.', name: 'jobNo', type: 'number' },
              { label: 'Shipper', name: 'shipper', type: 'text' },
              { label: 'Consignee', name: 'consignee', type: 'text' },
              { label: 'Notify Party', name: 'notify_party', type: 'text' },
              { label: 'Airport of Departure', name: 'airport_of_departure', type: 'text' },
              { label: 'Airport of Destination', name: 'airport_of_destination', type: 'text' },
              { label: 'No of Packages', name: 'no_of_packages', type: 'number' },
              { label: 'Gross Weight', name: 'grossWeight', type: 'number' },
              { label: 'Dimension (CMS)', name: 'dimension_cms', type: 'text' },
              { label: 'Chargeable Weight', name: 'chargeable_weight', type: 'number' },
              { label: 'Client No', name: 'client_no', type: 'text' },
              { label: 'Name of Airline', name: 'name_of_airline', type: 'text' },
              { label: 'AWB', name: 'awb', type: 'text' },
              { label: 'From', name: 'flight_from', type: 'text' },
              { label: 'To', name: 'flight_to', type: 'text' },
              { label: 'ETA (Date)', name: 'flight_eta', type: 'date' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text' },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date' },
            ].map((field, index) => (
              <div key={index} className="form-group">
                <label>{field.label} <span className="required">*</span></label>
                <input 
                  type={field.type} 
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  className={validationErrors[field.name] ? 'error' : ''}
                />
                {validationErrors[field.name] && 
                  <span className="field-error">{validationErrors[field.name]}</span>
                }
              </div>
            ))}
          </div>
          
          <div className="client-os-info">
            Client O/S: Credit Term: CASH | Total O/S: 46000 | Over Due O/S: 46000
          </div>

          <div className="pod-upload-section" style={{ marginTop: '20px', padding: '15px', border: '1px dashed #2b4df0', borderRadius: '8px', background: 'rgba(43, 77, 240, 0.05)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#2b4df0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileUp size={18} /> Proof of Delivery (POD)
            </h3>
            <div className="form-group">
              <label>Upload POD Document (PDF/Image)</label>
              <input 
                type="file" 
                onChange={(e) => setSelectedFile(e.target.files[0])}
                accept=".pdf,image/*"
                style={{ padding: '8px' }}
              />
              {uploading && <div className="upload-progress" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#2b4df0' }}>Uploading: {uploadProgress}%</div>}
              {formData.pod_attachment && !selectedFile && (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#36b37e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ExternalLink size={14} /> Existing POD attached
                </div>
              )}
            </div>
          </div>
        </div>
      );
      
    } else if (jobType === 'TRANSPORT') {
      return (
        <div className="port-details-form">
          <h2>Transport Details - {tradeDirection}</h2>
          <div className="form-grid-two-column">
            {/* Add LCL/FCL dropdown at the top */}
            <div className="form-group">
              <label>LCL/FCL <span className="required">*</span></label>
              <select 
                name="lclFcl"
                value={formData.lclFcl}
                onChange={handleInputChange}
                className={validationErrors.lclFcl ? 'error' : ''}
              >
                <option value="">Select</option>
                <option value="LCL">LCL</option>
                <option value="FCL">FCL</option>
              </select>
              {validationErrors.lclFcl && 
                <span className="field-error">{validationErrors.lclFcl}</span>
              }
            </div>
            {[
              { label: 'Job No.', name: 'jobNo', type: 'number' },
              { label: 'Port', name: 'port', type: 'text' },
              { label: 'Container Type', name: 'containerType', type: 'text', condition: true }, 
              { label: 'Vehicle Type', name: 'vehicle_type', type: 'text' }, 
              { label: 'Container No', name: 'containerNo', type: 'text' },
              { label: 'Size', name: 'size', type: 'text' },
              { label: 'LRN No', name: 'lrn_no', type: 'text' },
              { label: 'From', name: 'from', type: 'text' },
              { label: 'To', name: 'to', type: 'text' },
              { label: 'Shipper Name', name: 'shipper_name', type: 'text' },
              { label: 'Party Name', name: 'party_name', type: 'text' },
              { label: 'Factory Reporting Date', name: 'factory_reporting_date', type: 'date' },
              { label: 'Factory Reporting Out', name: 'factory_reporting_out', type: 'date' },
              { label: 'Offloading Date', name: 'offloading_date', type: 'date' },
              { label: 'Days of Detention', name: 'days_of_detention', type: 'number' },
              { label: 'Transporter', name: 'transporter', type: 'text' },
              { label: 'Vehicle Buy Amount', name: 'vehicle_buy_amount', type: 'number' },
              { label: 'Vehicle Billing Amount', name: 'vehicle_billing_amount', type: 'number' },
              { label: 'Movement', name: 'movement', type: 'text' },
              { label: 'Driver Name', name: 'driver_name', type: 'text' },
              { label: 'Driver Mobile No', name: 'driver_mobile_no', type: 'text' },
              { label: 'Bill No', name: 'bill_no', type: 'text' },
              { label: 'Bill Date', name: 'bill_date', type: 'date' },
              { label: 'Amount', name: 'amount', type: 'number' },
            ].map((field, index) => (
              <div key={index} className="form-group">
                <label>{field.label} <span className="required">*</span></label>
                <input 
                  type={field.type} 
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                  className={validationErrors[field.name] ? 'error' : ''}
                />
                {validationErrors[field.name] && 
                  <span className="field-error">{validationErrors[field.name]}</span>
                }
              </div>
            ))}
          </div>
          
          <div className="client-os-info">
            Client O/S: Credit Term: CASH | Total O/S: 46000 | Over Due O/S: 46000
          </div>

          <div className="pod-upload-section" style={{ marginTop: '20px', padding: '15px', border: '1px dashed #2b4df0', borderRadius: '8px', background: 'rgba(43, 77, 240, 0.05)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#2b4df0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileUp size={18} /> Proof of Delivery (POD)
            </h3>
            <div className="form-group">
              <label>Upload POD Document (PDF/Image)</label>
              <input 
                type="file" 
                onChange={(e) => setSelectedFile(e.target.files[0])}
                accept=".pdf,image/*"
                style={{ padding: '8px' }}
              />
              {uploading && <div className="upload-progress" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#2b4df0' }}>Uploading: {uploadProgress}%</div>}
              {formData.pod_attachment && !selectedFile && (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#36b37e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ExternalLink size={14} /> Existing POD attached
                </div>
              )}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="port-details-form">
          <h2>Port Details - {tradeDirection}</h2>
          <div className="form-grid-two-column">
            {[
              { label: 'Job No.', name: 'jobNo', type: 'number', condition: true },
              { label: 'Exporter', name: 'exporter', type: 'text', condition: tradeDirection === 'EXPORT' },
              { label: 'Importer', name: 'importer', type: 'text', condition: tradeDirection === 'IMPORT' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text', condition: true },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date', condition: true },
              { label: 'Container Type', name: 'containerType', type: 'text', condition: true }, 
              { label: 'Stuffing Date', name: 'stuffingDate', type: 'date', condition: true },
              { label: 'H/O Date', name: 'hoDate', type: 'date', condition: true },
              { label: 'Terms', name: 'terms', type: 'text', condition: true },
              { label: 'Consignee', name: 'consignee', type: 'text', condition: true },
              { label: 'S/B No', name: 'sbNo', type: 'text', condition: tradeDirection === 'EXPORT' },
              { label: 'S/B Date', name: 'sbDate', type: 'date', condition: tradeDirection === 'EXPORT' },
              { label: 'BOE', name: 'boeNo', type: 'text', condition: tradeDirection === 'IMPORT' },
              { label: 'BOE Date', name: 'boeDate', type: 'date', condition: tradeDirection === 'IMPORT' },
              { label: 'From', name: 'pol', type: 'text', condition: true },
              { label: 'To', name: 'pod', type: 'text', condition: true },
              { label: 'Destination', name: 'destination', type: 'text', condition: true },
              { label: 'Commodity', name: 'commodity', type: 'text', condition: true },
              { label: 'Invoice Value', name: 'invoiceValue', type: 'text', condition: true }, 
              { label: 'GR Weight', name: 'grWeight', type: 'number', condition: true },
              { label: 'Net Weight', name: 'netWeight', type: 'number', condition: true },
              { label: 'RAIL Out Date', name: 'railOutDate', type: 'date', condition: true },
              { label: 'Container No', name: 'containerNo', type: 'text', condition: true },
              { label: 'No of CNTR', name: 'noOfCntr', type: 'number', condition: true },
              { label: 'Volume(CBM)', name: 'volume', type: 'number', condition: true },
              { label: 'S/Line', name: 'sLine', type: 'text', condition: true },
              { label: 'MBL No', name: 'mblNo', type: 'text', condition: true },
              { label: 'MBL Date', name: 'mblDate', type: 'date', condition: true },
              { label: 'HBL No', name: 'hblNo', type: 'text', condition: true },
              { label: 'HBL DT', name: 'hblDt', type: 'date', condition: true },
              { label: 'VESSEL', name: 'vessel', type: 'text', condition: true },
              { label: 'VOY', name: 'voy', type: 'text', condition: true },
              { label: 'ETD', name: 'etd', type: 'datetime-local', condition: true },
              { label: 'ETA', name: 'eta', type: 'datetime-local', condition: true },
              { label: 'SOB', name: 'sob', type: 'text', condition: true },
              { label: 'A/C', name: 'ac', type: 'text', condition: true },
              { label: 'Bill No', name: 'billNo', type: 'text', condition: true },
              { label: 'Bill Date', name: 'billDate', type: 'date', condition: true },
              { label: 'C/C Port', name: 'ccPort', type: 'text', condition: true },
            ].map((field, index) => 
              field.condition && (
                <div key={index} className="form-group">
                  <label>{field.label} <span className="required">*</span></label>
                  <input 
                    type={field.type} 
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleInputChange}
                    className={validationErrors[field.name] ? 'error' : ''}
                  />
                  {validationErrors[field.name] && 
                    <span className="field-error">{validationErrors[field.name]}</span>
                  }
                </div>
              )
            )}
          </div>
          
          <div className="client-os-info">
            Client O/S: Credit Term: CASH | Total O/S: 46000 | Over Due O/S: 46000
          </div>

          <div className="pod-upload-section" style={{ marginTop: '20px', padding: '15px', border: '1px dashed #2b4df0', borderRadius: '8px', background: 'rgba(43, 77, 240, 0.05)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#2b4df0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileUp size={18} /> Proof of Delivery (POD)
            </h3>
            <div className="form-group">
              <label>Upload POD Document (PDF/Image)</label>
              <input 
                type="file" 
                onChange={(e) => setSelectedFile(e.target.files[0])}
                accept=".pdf,image/*"
                style={{ padding: '8px' }}
              />
              {uploading && <div className="upload-progress" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#2b4df0' }}>Uploading: {uploadProgress}%</div>}
              {formData.pod_attachment && !selectedFile && (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#36b37e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ExternalLink size={14} /> Existing POD attached
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }, [jobType, tradeDirection, formData, handleInputChange, validationErrors]);

  // Render job summary based on job type
  const renderJobSummary = useCallback(() => {
    if (!selectedJob) return null;
    
    const locationHeaders = getLocationColumnHeaders(selectedJob.job_type);
    
    // Helper function to safely get values with fallbacks
    const getValue = (value) => value || 'N/A';
    
    return (
      <div className="modal-overlay">
        <div className="modal-content job-summary-modal">
          <div className="modal-header">
            <h2>Job Summary - {getValue(selectedJob.jobNo)}</h2>
            <button 
              className="close-button"
              onClick={() => setShowJobSummary(false)}
            >
              ×
            </button>
          </div>
          
          <div className="modal-body job-summary-body">
            <div className="summary-section">
              <h3>Basic Information</h3>
              <div className="summary-grid">
                <div className="summary-row">
                  <span className="label">Job Type:</span>
                  <span className="value">{getValue(selectedJob.job_type)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Trade Direction:</span>
                  <span className="value">{getValue(selectedJob.tradeDirection)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Client:</span>
                  <span className="value">{getValue(selectedJob.client)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Job Number:</span>
                  <span className="value">{getValue(selectedJob.jobNo)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">{locationHeaders[0]}:</span>
                  <span className="value">
                    {selectedJob.job_type === 'AIR FREIGHT' ? getValue(selectedJob.airport_of_departure) : 
                     selectedJob.job_type === 'TRANSPORT' ? getValue(selectedJob.from) : 
                     getValue(selectedJob.pol)}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="label">{locationHeaders[1]}:</span>
                  <span className="value">
                    {selectedJob.job_type === 'AIR FREIGHT' ? getValue(selectedJob.airport_of_destination) : 
                     selectedJob.job_type === 'TRANSPORT' ? getValue(selectedJob.to) : 
                     getValue(selectedJob.pod)}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="label">Created:</span>
                  <span className="value">{getValue(selectedJob.createdAt)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Last Updated:</span>
                  <span className="value">{getValue(selectedJob.updatedAt)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">ETA:</span>
                  <span className="value">
                    {selectedJob.job_type === 'AIR FREIGHT' ? getValue(selectedJob.flight_eta) : 
                     getValue(selectedJob.eta)}
                  </span>
                </div>
                {selectedJob.pod_attachment && (
                  <div className="summary-row" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                    <span className="label">Proof of Delivery (POD):</span>
                    <span className="value">
                      <a 
                        href={getFileUrl(selectedJob.pod_attachment, 'pod-attachments')} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#2b4df0', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontWeight: 'bold' }}
                      >
                        <ExternalLink size={14} /> View Document
                      </a>
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="summary-section">
              <h3>Details</h3>
              {selectedJob.job_type === 'AIR FREIGHT' ? (
                <div className="summary-grid">
                  <div className="summary-row">
                    <span className="label">Shipper:</span>
                    <span className="value">{getValue(selectedJob.shipper)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Consignee:</span>
                    <span className="value">{getValue(selectedJob.consignee)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Notify Party:</span>
                    <span className="value">{getValue(selectedJob.notify_party)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">No of Packages:</span>
                    <span className="value">{getValue(selectedJob.no_of_packages)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Gross Weight:</span>
                    <span className="value">{getValue(selectedJob.gross_weight)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Chargeable Weight:</span>
                    <span className="value">{getValue(selectedJob.chargeable_weight)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Airline:</span>
                    <span className="value">{getValue(selectedJob.name_of_airline)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">AWB:</span>
                    <span className="value">{getValue(selectedJob.awb)}</span>
                  </div>
                </div>
              ) : selectedJob.jobType === 'TRANSPORT' ? (
                <div className="summary-grid">
                  <div className="summary-row">
                    <span className="label">LCL/FCL:</span>
                    <span className="value">{getValue(selectedJob.lcl_fcl)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Vehicle Type:</span>
                    <span className="value">{getValue(selectedJob.vehicle_type)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Container Type:</span>
                    <span className="value">{getValue(selectedJob.container_type)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Shipper Name:</span>
                    <span className="value">{getValue(selectedJob.shipper_name)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Party Name:</span>
                    <span className="value">{getValue(selectedJob.party_name)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Transporter:</span>
                    <span className="value">{getValue(selectedJob.transporter)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Driver Name:</span>
                    <span className="value">{getValue(selectedJob.driver_name)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Vehicle Billing Amount:</span>
                    <span className="value">{getValue(selectedJob.vehicle_billing_amount)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Amount:</span>
                    <span className="value">{getValue(selectedJob.amount)}</span>
                  </div>
                </div>
              ) : (
                <div className="summary-grid">
                  <div className="summary-row">
                    <span className="label">Shipper:</span>
                    <span className="value">{getValue(selectedJob.shipper)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Invoice Value:</span>
                    <span className="value">{getValue(selectedJob.fob)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Container Type:</span>
                    <span className="value">{getValue(selectedJob.container_type)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Consignee:</span>
                    <span className="value">{getValue(selectedJob.consignee)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">{selectedJob.tradeDirection === 'EXPORT' ? 'Exporter' : 'Importer'}:</span>
                    <span className="value">
                      {selectedJob.tradeDirection === 'EXPORT' ? 
                       getValue(selectedJob.exporter) : 
                       getValue(selectedJob.importer)}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Vessel:</span>
                    <span className="value">{getValue(selectedJob.vessel)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Volume:</span>
                    <span className="value">{getValue(selectedJob.volume)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Container No:</span>
                    <span className="value">{getValue(selectedJob.container_no)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="modal-footer">
            <button 
              className="close-summary-button"
              onClick={() => setShowJobSummary(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }, [selectedJob, getLocationColumnHeaders]);

  return (
    <>
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
          <h2>Current Active Jobs</h2>
          <button className="add-shipment-btn" onClick={() => setShowJobForm(true)}>
            <span className="plus-icon">+</span>
            Add Job
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
                <th>Job No.</th>
                <th>Client</th>
                <th>Type</th>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Created At</th>
                <th>Updated At</th>
                <th>Author</th>
                <th>ETA</th>
                <th>POD</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length > 0 ? (
                jobs.map((job, index) => (
                  <tr key={index} onClick={() => handleJobSelect(job)} className="job-row">
                    <td>{job.jobNo}</td>
                    <td>{job.client}</td>
                    <td>{job.job_type}</td>
                    <td>{job.tradeDirection}</td>
                    <td>
                      {job.job_type === 'AIR FREIGHT' ? job.airport_of_departure : 
                       job.job_type === 'TRANSPORT' ? job.from_location :
                       job.pol}
                    </td>
                    <td>
                      {job.job_type === 'AIR FREIGHT' ? job.airport_of_destination : 
                       job.job_type === 'TRANSPORT' ? job.to_location :
                       job.pod}
                    </td>
                    <td>{job.createdAt}</td>
                    <td>{job.updatedAt}</td>
                    <td>
                      {job.created_by && <div className="audit-badge" title={`Created By: ${job.created_by}`}><UserPlus size={12} /> {job.created_by.split('@')[0]}</div>}
                      {job.updated_by && <div className="audit-badge edit" title={`Updated By: ${job.updated_by}`}><PenLine size={12} /> {job.updated_by.split('@')[0]}</div>}
                    </td>
                    <td>
                      {job.job_type === 'AIR FREIGHT' ? job.flight_eta : job.eta}
                    </td>
                    <td>
                      {job.pod_attachment ? (
                        <a 
                          href={getFileUrl(job.pod_attachment, 'pod-attachments')} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: '#2b4df0' }}
                          title="View POD"
                        >
                          <FileText size={18} />
                        </a>
                      ) : '—'}
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditJob(job);
                        }}
                        title="Edit Job"
                      >
                        Edit
                      </button>
                      <button 
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(job);
                        }}
                        title="Delete Job"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="11" style={{textAlign: 'center', padding: '20px'}}>
                    No active jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Creation/Edit Form Modal */}
      {showJobForm && (
        <div className="modal-overlay">
          <div className="modal-content job-modal">
            <div className="new-shipment-card">
              <div className="new-shipment-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <h1>{editingJob ? 'Edit Job' : 'Create Job'}</h1>
                  {editingJob && (
                    <div className="modal-author-info" style={{ display: 'flex', gap: '10px' }}>
                      {editingJob.created_by && <span className="audit-badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}><UserPlus size={12} /> {editingJob.created_by.split('@')[0]}</span>}
                      {editingJob.updated_by && <span className="audit-badge edit" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}><PenLine size={12} /> {editingJob.updated_by.split('@')[0]}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Steps */}
              <div className="progress-steps">
                {STEPS.map((step, index) => (
                  <div 
                    key={`step-${index}`} 
                    className={`step ${index + 1 === activeStep ? 'active' : ''} ${index + 1 < activeStep ? 'completed' : ''}`}
                  >
                    <div className="step-number">{index + 1}</div>
                    <div className="step-label">{step}</div>
                  </div>
                ))}
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${((activeStep - 1) / (STEPS.length - 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Step Content */}
              <div className="step-content">
                {activeStep === 1 && (
                  <div className="shipment-type-selection">
                    <h2>What type of Job would you like to {editingJob ? 'edit' : 'create'}?</h2>
                    {validationErrors.jobType && (
                      <div className="validation-error">{validationErrors.jobType}</div>
                    )}
                    <div className="shipment-type-grid">
                      {JOB_TYPES.map((type, index) => (
                        <div 
                          key={`type-${index}`} 
                          className={`shipment-type-card ${jobType === type ? 'selected' : ''}`}
                          onClick={() => handleJobTypeSelect(type)}
                        >
                          {type}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="trade-direction-selection">
                    <h2>Is this an Export, Import{jobType === 'TRANSPORT' ? ', or Local' : ''} job?</h2>
                    {validationErrors.tradeDirection && (
                      <div className="validation-error">{validationErrors.tradeDirection}</div>
                    )}
                    <div className="trade-direction-grid">
                      {(TRADE_DIRECTIONS[jobType] || ['EXPORT', 'IMPORT']).map((direction, index) => (
                        <div 
                          key={`direction-${index}`} 
                          className={`trade-direction-card ${tradeDirection === direction ? 'selected' : ''}`}
                          onClick={() => handleTradeDirectionSelect(direction)}
                        >
                          {direction}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeStep === 3 && renderStep3Fields()}

                {activeStep === 4 && (
                  <div className="summary-step">
                    <h2>Summary - {tradeDirection} - {jobType}</h2>
                    
                    <div className="client-branch-section">
                      <div className="client-info">
                        <span className="label">Client No</span>
                        <span className="value">{formData.client_no}</span>
                      </div>
                    </div>

                    {jobType === 'AIR FREIGHT' ? (
                      <>
                        <div className="shipper-section">
                          <span className="label">Shipper</span>
                          <span className="value">{formData.shipper}</span>
                        </div>
                        
                        <div className="location-summary">
                          <div className="summary-row">
                            <span className="label">{getLocationColumnHeaders(jobType)[0]}:</span>
                            <span className="value">{formData.airport_of_departure}</span>
                          </div>
                          <div className="summary-row">
                            <span className="label">{getLocationColumnHeaders(jobType)[1]}:</span>
                            <span className="value">{formData.airport_of_destination}</span>
                          </div>
                        </div>

                        <div className="divider"></div>

                        <div className="booking-info-section">
                          <h3>Air Freight Booking Info</h3>
                          <div className="booking-info-grid">
                            {[
                              { label: 'Job No:', value: formData.jobNo },
                              { label: 'Shipper:', value: formData.shipper },
                              { label: 'Consignee:', value: formData.consignee },
                              { label: 'Notify Party:', value: formData.notify_party },
                              { label: 'Airport of Departure:', value: formData.airport_of_departure },
                              { label: 'Airport of Destination:', value: formData.airport_of_destination },
                              { label: 'No of Packages:', value: formData.no_of_packages },
                              { label: 'Gross Weight:', value: formData.grossWeight },
                              { label: 'Dimension (CMS):', value: formData.dimension_cms },
                              { label: 'Chargeable Weight:', value: formData.chargeable_weight },
                              { label: 'Client No:', value: formData.client_no },
                              { label: 'Name of Airline:', value: formData.name_of_airline },
                              { label: 'AWB:', value: formData.awb },
                              { label: 'From:', value: formData.flight_from },
                              { label: 'To:', value: formData.flight_to },
                              { label: 'ETA (Date):', value: formData.flight_eta },
                              { label: 'Invoice No:', value: formData.invoiceNo },
                              { label: 'Invoice Date:', value: formData.invoiceDate },
                            ].map((item, index) => (
                              <div key={index} className="booking-info-row">
                                <span className="label">{item.label}</span>
                                <span className="value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : jobType === 'TRANSPORT' ? (
                      <>
                        <div className="shipper-section">
                          <span className="label">Shipper</span>
                          <span className="value">{formData.shipper_name}</span>
                        </div>

                        <div className="divider"></div>
                        
                        <div className="location-summary">
                          <div className="summary-row">
                            <span className="label">{getLocationColumnHeaders(jobType)[0]}:</span>
                            <span className="value">{formData.from}</span>
                          </div>
                          <div className="summary-row">
                            <span className="label">{getLocationColumnHeaders(jobType)[1]}:</span>
                            <span className="value">{formData.to}</span>
                          </div>
                        </div>

                        <div className="booking-info-section">
                          <h3>Transport Booking Info</h3>
                          <div className="booking-info-grid">
                            {[
                              { label: 'Job No:', value: formData.jobNo },
                              { label: 'Port:', value: formData.port },
                              { label: 'LCL/FCL:', value: formData.lclFcl },
                              { label: 'Vehicle Type:', value: formData.vehicle_type },
                              { label: 'Container No:', value: formData.containerNo },
                              { label: 'Size:', value: formData.size },
                              { label: 'LRN No:', value: formData.lrn_no },
                              { label: 'From:', value: formData.from },
                              { label: 'To:', value: formData.to },
                              { label: 'Container Type:', value: formData.containerType },
                              { label: 'Shipper Name:', value: formData.shipper_name },
                              { label: 'Party Name:', value: formData.party_name },
                              { label: 'Factory Reporting Date:', value: formData.factory_reporting_date },
                              { label: 'Factory Reporting Out:', value: formData.factory_reporting_out },
                              { label: 'Offloading Date:', value: formData.offloading_date },
                              { label: 'Days of Detention:', value: formData.days_of_detention },
                              { label: 'Transporter:', value: formData.transporter },
                              { label: 'Vehicle Buy Amount:', value: formData.vehicle_buy_amount },
                              { label: 'Vehicle Billing Amount:', value: formData.vehicle_billing_amount },
                              { label: 'Movement:', value: formData.movement },
                              { label: 'Driver Name:', value: formData.driver_name },
                              { label: 'Driver Mobile No:', value: formData.driver_mobile_no },
                              { label: 'Bill No:', value: formData.bill_no },
                              { label: 'Bill Date:', value: formData.bill_date },
                              { label: 'Amount:', value: formData.amount },
                            ].map((item, index) => (
                              <div key={index} className="booking-info-row">
                                <span className="label">{item.label}</span>
                                <span className="value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.pod_attachment && (
                          <div className="summary-pod-section" style={{ marginTop: '15px', padding: '10px', background: 'rgba(54, 179, 126, 0.1)', borderRadius: '6px', border: '1px solid rgba(54, 179, 126, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a7a4d' }}>
                              <FileText size={16} /> <strong style={{ fontSize: '0.9rem' }}>Proof of Delivery (POD) attached</strong>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="divider"></div>

                        <div className="booking-info-section">
                          <h3>Booking Info</h3>
                          <div className="booking-info-grid">
                            {[
                              { label: 'Job No:', value: formData.jobNo },
                              ...(tradeDirection === 'EXPORT' ? [{ label: 'Exporter:', value: formData.exporter }] : []),
                              ...(tradeDirection === 'IMPORT' ? [{ label: 'Importer:', value: formData.importer }] : []),
                              { label: 'Invoice No:', value: formData.invoiceNo },
                              { label: 'Invoice Date:', value: formData.invoiceDate },
                              { label: 'Stuffing Date:', value: formData.stuffingDate },
                              { label: 'H/O Date:', value: formData.hoDate },
                              { label: 'Terms:', value: formData.terms },
                              { label: 'Consignee:', value: formData.consignee },
                              ...(tradeDirection === 'EXPORT' ? [
                                { label: 'S/B No:', value: formData.sbNo },
                                { label: 'S/B Date:', value: formData.sbDate }
                              ] : []),
                              ...(tradeDirection === 'IMPORT' ? [
                                { label: 'BOE:', value: formData.boeNo },
                                { label: 'BOE Date:', value: formData.boeDate }
                              ] : []),
                              { label: 'Container Type:', value: formData.containerType },
                              { label: 'POL:', value: formData.pol },
                              { label: 'POD:', value: formData.pod },
                              { label: 'Destination:', value: formData.destination },
                              { label: 'Commodity:', value: formData.commodity },
                              { label: 'Invoice Value:', value: formData.invoiceValue },
                              { label: 'GR Weight:', value: formData.grWeight },
                              { label: 'Net Weight:', value: formData.netWeight },
                              { label: 'RAIL Out Date:', value: formData.railOutDate },
                              { label: 'Container No:', value: formData.containerNo },
                              { label: 'No of CNTR:', value: formData.noOfCntr },
                              { label: 'Volume:', value: formData.volume },
                              { label: 'S/Line:', value: formData.sLine },
                              { label: 'MBL No:', value: formData.mblNo },
                              { label: 'MBL Date:', value: formData.mblDate },
                              { label: 'HBL No:', value: formData.hblNo },
                              { label: 'HBL DT:', value: formData.hblDt },
                              { label: 'VESSEL:', value: formData.vessel },
                              { label: 'VOY:', value: formData.voy },
                              { label: 'ETD:', value: formData.etd ? new Date(formData.etd).toLocaleString() : 'N/A' },
                              { label: 'SOB:', value: formData.sob },
                              { label: 'ETA:', value: formData.eta ? new Date(formData.eta).toLocaleString() : 'N/A' },
                              { label: 'A/C:', value: formData.ac },
                              { label: 'Bill No:', value: formData.billNo },
                              { label: 'Bill Date:', value: formData.billDate },
                              { label: 'C/C Port:', value: formData.ccPort },
                            ].map((item, index) => (
                              <div key={index} className="booking-info-row">
                                <span className="label">{item.label}</span>
                                <span className="value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.pod_attachment && (
                          <div className="summary-pod-section" style={{ marginTop: '15px', padding: '10px', background: 'rgba(54, 179, 126, 0.1)', borderRadius: '6px', border: '1px solid rgba(54, 179, 126, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a7a4d' }}>
                              <FileText size={16} /> <strong style={{ fontSize: '0.9rem' }}>Proof of Delivery (POD) attached</strong>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="divider"></div>

                    {/* Checkbox Section */}
                    <div className="confirmation-checkboxes">
                      {[
                        { id: 'confirm1', label: 'I confirm the accuracy of all information' },
                        { id: 'confirm2', label: 'I agree to the terms and conditions' },
                        { id: 'confirm3', label: 'I authorize this job' },
                      ].map((item, index) => (
                        <div key={index} className="checkbox-item">
                          <input type="checkbox" id={item.id} required />
                          <label htmlFor={item.id}>{item.label}</label>
                        </div>
                      ))}
                    </div>

                    <div className="confirmation-prompt">
                      <p>Are you sure you want to {editingJob ? 'update' : 'create'} the job?</p>
                      <div className="confirmation-buttons">
                        <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
                        <button className="confirm-btn" onClick={handleCreateJob}>
                          {editingJob ? 'Update' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Buttons */}
              <div className="navigation-buttons">
                <button className="cancel-button" onClick={handleCancel}>
                  X Cancel
                </button>
                <div className="step-buttons">
                  {activeStep > 1 && (
                    <button className="back-button" onClick={handleBack}>
                      Previous
                    </button>
                  )}
                  {activeStep < STEPS.length && (
                    <button className="next-button" onClick={handleNext}>
                      Next
                    </button>
                  )}
                  {activeStep === STEPS.length && (
                    <button className="confirm-button" onClick={handleCreateJob}>
                      {editingJob ? 'Update Job' : 'Confirm & Create Job'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content delete-modal">
            <div className="modal-header">
              <h2>Confirm Delete</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete job #{jobToDelete?.jobNo}?</p>
              <p>This action cannot be undone.</p>
              {jobToDelete && (jobToDelete.created_by || jobToDelete.updated_by) && (
                <div className="delete-author-info" style={{marginTop: '15px', padding: '10px', background: 'var(--bg-surface-2)', borderRadius: '6px', fontSize: '0.85rem'}}>
                  <strong>Author Information:</strong>
                  <div style={{marginTop: '5px'}}>
                    {jobToDelete.created_by && <div>Created by: {jobToDelete.created_by}</div>}
                    {jobToDelete.updated_by && <div>Last edited by: {jobToDelete.updated_by}</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-button"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className="delete-confirm-button"
                onClick={handleDeleteJob}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organization Creation Modal */}
      {showOrgModal && (
        <div className="modal-overlay">
          <div className="modal-content org-modal">
            <div className="modal-header">
              <h2>Create Organization</h2>
              <button 
                className="close-button"
                onClick={() => setShowOrgModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body org-modal-body">
              <div className="org-form-container">
                <div className="org-form-grid">
                  {[
                    { label: 'Name', name: 'name', type: 'text' },
                    { label: 'Record Status', name: 'recordStatus', type: 'select', options: ['Active', 'Inactive'] },
                    { label: 'Sales person', name: 'salesPerson', type: 'text' },
                    { label: 'Category List', name: 'category', type: 'select', options: CATEGORIES },
                    { label: 'Branch', name: 'branch', type: 'text' },
                    { label: 'Contact Person', name: 'contactPerson', type: 'text' },
                    { label: 'Door No', name: 'doorNo', type: 'text' },
                    { label: 'Building Name', name: 'buildingName', type: 'text' },
                    { label: 'Street', name: 'street', type: 'text' },
                    { label: 'Area', name: 'area', type: 'text' },
                    { label: 'City', name: 'city', type: 'text' },
                    { label: 'State', name: 'state', type: 'text' },
                  ].map((field, index) => (
                    <div key={index} className="org-form-group">
                      <label>{field.label}</label>
                      {field.type === 'select' ? (
                        <select 
                          name={field.name}
                          value={orgFormData[field.name]}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        >
                          {field.options.map((option, i) => (
                            <option key={i} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input 
                          type={field.type} 
                          name={field.name}
                          value={orgFormData[field.name]}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="modal-footer org-modal-footer">
              <button 
                className="org-cancel-button"
                onClick={() => setShowOrgModal(false)}
              >
                Cancel
              </button>
              <button 
                className="org-confirm-button"
                onClick={handleCreateOrganization}
              >
                Create Organization
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showJobSummary && renderJobSummary()}
    </>
  );
};

export default ActiveJob;