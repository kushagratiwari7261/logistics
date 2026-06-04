// src/components/ActiveJob.jsx
import './ActivityTable.css';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, PenLine, FileUp, ExternalLink, FileText, ArrowLeft, ArrowRight, Minus, X, Maximize2 } from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabaseClient';

import { fetchNextJobNumber } from '../utils/jobUtils';

// Constants for better maintainability
const JOB_TYPES = ['AIR FREIGHT', 'SEA FREIGHT', 'TRANSPORT', 'OTHERS'];
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
  jobNo: '',
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
  sobDate: '',
  hal: '',
  buyingRate: '',
  buyingCurrency: 'INR',
  sellingRate: '',
  sellingCurrency: 'INR',
  exchangeRate: '',
  spotRate: '',
  spotRateCurrency: 'INR',
  freightValidity: '',

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
  vehicle_type: '',
  lrn_no: '',
  from: '',
  to: '',
  ship_to: '',
  factory_reporting_date: '',
  dispatch_date: '',
  reporting_date: '',
  unloading_date: '',
  days_of_detention: '',
  transporter: '',
  vehicle_buy_amount: '',
  vehicle_billing_amount: '',
  movement: '',
  vehicle_number: '',
  driver_name: '',
  driver_mobile_no: '',
  order_no: '',
  order_date: '',
  amount: '',
  advance: '',
  eway_bill_no: '',
  invoice_attachment: null,
  eway_bill_attachment: null,
  description_of_goods: '',
  goods_attachment: null,
  consignee_address: '',
  consignee_contact: '',
  ship_to_address: '',
  ship_to_contact: '',
  pod_documents: []
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

const JobFormWindow = ({ formConfig, onClose, onMinimize, onRestore }) => {
  const navigate = useNavigate();
  const tableContainerRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState('auto');


  const [maxStepReached, setMaxStepReached] = useState(formConfig.initialState?.maxStepReached || 1);
  const [activeStep, setActiveStep] = useState(formConfig.initialState?.activeStep || 1);
  const [jobType, setJobType] = useState(formConfig.initialState?.jobType || '');
  const [tradeDirection, setTradeDirection] = useState(formConfig.initialState?.tradeDirection || '');
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
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
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState(formConfig.initialState?.formData || INITIAL_FORM_DATA);
  const [orgFormData, setOrgFormData] = useState(INITIAL_ORG_FORM_DATA);
  const [editingJob, setEditingJob] = useState(formConfig.initialState?.editingJob || null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobSummary, setShowJobSummary] = useState(false);
  const { uploadFile, getFileUrl, uploading, progress: uploadProgress } = useFileUpload();
  const [newPods, setNewPods] = useState([{ podNo: '', file: null }]);
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);

  const fetchClientSuggestions = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setClientSuggestions([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('vendorName, partner_type')
        .ilike('vendorName', `%${searchTerm}%`)
        .limit(10);
      if (!error && data) {
        const uniqueNames = Array.from(new Set(data.map(d => d.vendorName)));
        setClientSuggestions(uniqueNames);
      }
    } catch (err) {
      console.error('Error fetching client suggestions:', err);
    }
  }, []);

  // Fetch next sequential job number on load if creating new job
  useEffect(() => {
    let isMounted = true;
    if (!editingJob && !formData.jobNo) {
      const initJobNo = async () => {
        const nextNo = await fetchNextJobNumber();
        if (isMounted) {
          setFormData(prev => ({ ...prev, jobNo: nextNo }));
        }
      };
      initJobNo();
    }
    return () => { isMounted = false; };
  }, [editingJob, formData.jobNo]);

  const handleAddPodEntry = useCallback(() => {
    setNewPods(prev => [...prev, { podNo: '', file: null }]);
  }, []);

  const handlePodNoChange = useCallback((index, value) => {
    setNewPods(prev => {
      const updated = [...prev];
      updated[index].podNo = value;
      return updated;
    });
  }, []);

  const handlePodFileSelect = useCallback((index, e) => {
    const file = e.target.files[0];
    if (file) {
      setNewPods(prev => {
        const updated = [...prev];
        updated[index].file = file;
        return updated;
      });
    }
  }, []);

  const removePodEntry = useCallback((index) => {
    setNewPods(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Memoize required fields based on job type
  const requiredFields = useMemo(() => {
    if (jobType === 'AIR FREIGHT') {
      return {
        1: ['jobType'],
        2: ['tradeDirection'],
        3: [],
        4: []
      };
    } else if (jobType === 'TRANSPORT') {
      return {
        1: ['jobType'],
        2: ['tradeDirection'],
        3: [],
        4: []
      };
    } else {
      return {
        1: ['jobType'],
        2: ['tradeDirection'],
        3: [],
        4: []
      };
    }
  }, [jobType]);

  // Function to get location fields based on job type
  const getLocationFields = useCallback((job) => {
    switch (job.job_type) {
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
          ship_to: safeValue(job.ship_to),
          transporter: safeValue(job.transporter),
          vehicle_number: safeValue(job.vehicle_number),
          driver_name: safeValue(job.driver_name),
          vehicle_billing_amount: job.vehicle_billing_amount,
          amount: job.amount,
          advance: job.advance,
          eway_bill_no: safeValue(job.eway_bill_no),
          invoice_attachment: job.invoice_attachment || null,
          eway_bill_attachment: job.eway_bill_attachment || null,
          description_of_goods: safeValue(job.description_of_goods),
          goods_attachment: job.goods_attachment || null,
          consignee_address: safeValue(job.consignee_address),
          consignee_contact: safeValue(job.consignee_contact),
          ship_to_address: safeValue(job.ship_to_address),
          ship_to_contact: safeValue(job.ship_to_contact),
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

          let from_loc = '';
          let to_loc = '';
          switch (job.job_type) {
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
            ship_to: safeValue(job.ship_to),
            transporter: safeValue(job.transporter),
            vehicle_number: safeValue(job.vehicle_number),
            driver_name: safeValue(job.driver_name),
            vehicle_billing_amount: job.vehicle_billing_amount,
            amount: job.amount,
            advance: job.advance,
            eway_bill_no: safeValue(job.eway_bill_no),
            invoice_attachment: job.invoice_attachment || null,
            eway_bill_attachment: job.eway_bill_attachment || null,
            description_of_goods: safeValue(job.description_of_goods),
            goods_attachment: job.goods_attachment || null,
            consignee_address: safeValue(job.consignee_address),
            consignee_contact: safeValue(job.consignee_contact),
            ship_to_address: safeValue(job.ship_to_address),
            ship_to_contact: safeValue(job.ship_to_contact),
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


  // Auto-calculate Days of Detention
  useEffect(() => {
    if (jobType !== 'TRANSPORT') return;

    const calculateDays = (start, end) => {
      if (!start || !end) return 0;
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 0;

      const diffTime = endDate.getTime() - startDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 24 hours (1 day) free
      return Math.max(0, diffDays - 1);
    };

    const factoryDetention = calculateDays(formData.factory_reporting_date, formData.dispatch_date);
    const destDetention = calculateDays(formData.reporting_date, formData.unloading_date);
    const totalDetention = factoryDetention + destDetention;

    setFormData(prev => {
      // Auto-update if dates exist, allowing manual override otherwise
      if (prev.days_of_detention != totalDetention && (formData.dispatch_date || formData.unloading_date)) {
        return { ...prev, days_of_detention: totalDetention };
      }
      return prev;
    });
  }, [
    jobType,
    formData.factory_reporting_date,
    formData.dispatch_date,
    formData.reporting_date,
    formData.unloading_date
  ]);

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
    return Object.keys(errors).length === 0;
  };

  const handleNext = useCallback(() => {
    if (validateStep(activeStep)) {
      if (activeStep < STEPS.length) {
        setMaxStepReached(Math.max(maxStepReached, activeStep + 1));
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
  const handleCancel = useCallback((e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    onClose(formConfig.id);
  }, [formConfig.id, onClose]);



  const handleInputChange = useCallback((e) => {
    const { name, value, type, files } = e.target;
    const valToSet = type === 'file' ? (files && files[0] ? files[0] : null) : value;

    setFormData(prev => ({
      ...prev,
      [name]: valToSet
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

      let currentPodDocuments = formData.pod_documents || [];
      // Sanitize existing pod_documents — strip any non-serializable data
      currentPodDocuments = currentPodDocuments.map(doc => ({
        podNo: doc.podNo || '',
        path: doc.path || '',
        name: doc.name || '',
        size: doc.size || 0,
        type: doc.type || '',
        uploadedAt: doc.uploadedAt || new Date().toISOString()
      }));

      const validPodsToUpload = newPods.filter(p => p.file);

      if (validPodsToUpload.length > 0) {
        const uploadPromises = validPodsToUpload.map(async (p) => {
          const res = await uploadFile(p.file, userId, 'pod-attachments');
          return {
            podNo: p.podNo || '',
            path: res.path,
            name: res.name,
            size: res.size,
            type: res.type,
          };
        });
        const uploadResults = await Promise.all(uploadPromises);

        const newDocuments = uploadResults.map(res => ({
          podNo: res.podNo,
          path: res.path,
          name: res.name,
          size: res.size,
          type: res.type,
          uploadedAt: new Date().toISOString()
        }));

        currentPodDocuments = [...currentPodDocuments, ...newDocuments];
      }

      let invoiceAttachmentData = formData.invoice_attachment || null;
      if (formData.invoice_attachment instanceof File) {
        const res = await uploadFile(formData.invoice_attachment, userId, 'invoice-attachments');
        invoiceAttachmentData = { path: res.path, name: res.name, size: res.size, type: res.type };
      }

      let ewayBillAttachmentData = formData.eway_bill_attachment || null;
      if (formData.eway_bill_attachment instanceof File) {
        const res = await uploadFile(formData.eway_bill_attachment, userId, 'eway-bill-attachments');
        ewayBillAttachmentData = { path: res.path, name: res.name, size: res.size, type: res.type };
      }

      let goodsAttachmentData = formData.goods_attachment || null;
      if (formData.goods_attachment instanceof File) {
        const res = await uploadFile(formData.goods_attachment, userId, 'goods-attachments');
        goodsAttachmentData = { path: res.path, name: res.name, size: res.size, type: res.type };
      }

      // Function to convert empty strings to null for numeric fields
      const cleanNumericValue = (value) => {
        if (value === "" || value === null || value === undefined) {
          return null;
        }
        if (typeof value === 'string' && value.trim() !== "") {
          const num = Number(value);
          return isNaN(num) ? null : num;
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
        buying_rate: cleanNumericValue(formData.buyingRate),
        selling_rate: cleanNumericValue(formData.sellingRate),
        exchange_rate: cleanNumericValue(formData.exchangeRate),
        spot_rate: cleanNumericValue(formData.spotRate),

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
        sob_date: formData.sobDate ? new Date(formData.sobDate).toISOString() : null,
        freight_validity: formData.freightValidity ? new Date(formData.freightValidity).toISOString() : null,

        // Text fields
        pol: formData.pol || null,
        lcl_fcl: formData.lclFcl || null,
        container_type: formData.containerType || null,
        pod: formData.pod || null,
        hal: formData.hal || null,
        buying_currency: formData.buyingCurrency || 'INR',
        selling_currency: formData.sellingCurrency || 'INR',
        spot_rate_currency: formData.spotRateCurrency || 'INR',
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
        order_no: formData.orderNo || null,
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

        vehicle_type: formData.vehicle_type || null,
        lrn_no: formData.lrn_no || null,
        from_location: formData.from || null,
        to_location: formData.to || null,
        ship_to: formData.ship_to || null,
        factory_reporting_date: formData.factory_reporting_date ? new Date(formData.factory_reporting_date).toISOString() : null,
        dispatch_date: formData.dispatch_date ? new Date(formData.dispatch_date).toISOString() : null,
        reporting_date: formData.reporting_date ? new Date(formData.reporting_date).toISOString() : null,
        unloading_date: formData.unloading_date ? new Date(formData.unloading_date).toISOString() : null,
        days_of_detention: cleanNumericValue(formData.days_of_detention),
        transporter: formData.transporter || null,
        vehicle_buy_amount: cleanNumericValue(formData.vehicle_buy_amount),
        vehicle_billing_amount: cleanNumericValue(formData.vehicle_billing_amount),
        movement: formData.movement || null,
        vehicle_number: formData.vehicle_number || null,
        driver_name: formData.driver_name || null,
        driver_mobile_no: formData.driver_mobile_no || null,
        order_date: formData.order_date ? new Date(formData.order_date).toISOString() : null,
        amount: cleanNumericValue(formData.amount),
        advance: cleanNumericValue(formData.advance),
        eway_bill_no: formData.eway_bill_no || null,
        invoice_attachment: invoiceAttachmentData,
        eway_bill_attachment: ewayBillAttachmentData,
        description_of_goods: formData.description_of_goods || null,
        goods_attachment: goodsAttachmentData,
        consignee_address: formData.consignee_address || null,
        consignee_contact: formData.consignee_contact || null,
        ship_to_address: formData.ship_to_address || null,
        ship_to_contact: formData.ship_to_contact || null,

        job_type: jobType,
        trade_direction: tradeDirection,
        pod_documents: currentPodDocuments,
        status: 'active',
        updated_at: new Date().toISOString()
      };

      let result;
      if (editingJob) {
        // Update existing job
        jobData.updated_by = userEmail;
        let { data: updatedJob, error: updateError } = await supabase
          .from('jobs')
          .update(jobData)
          .eq('id', editingJob.id)
          .select('*');

        // If pod_documents column doesn't exist, retry without it
        if (updateError && updateError.code === 'PGRST204' && updateError.message?.includes('pod_documents')) {
          console.warn('pod_documents column not found, saving without it. Please add the column to your Supabase jobs table.');
          const { pod_documents, ...jobDataWithoutPod } = jobData;
          const retryResult = await supabase
            .from('jobs')
            .update(jobDataWithoutPod)
            .eq('id', editingJob.id)
            .select('*');
          if (retryResult.error) {
            console.error('Supabase update error details:', JSON.stringify(retryResult.error));
            throw retryResult.error;
          }
          updatedJob = retryResult.data;
          updateError = null;
        }

        if (updateError) {
          console.error('Supabase update error details:', JSON.stringify(updateError));
          throw updateError;
        }
        result = updatedJob;
      } else {
        // Create new job
        jobData.created_by = userEmail;

        let { data: newJob, error: insertError } = await supabase
          .from('jobs')
          .insert([jobData])
          .select('*');

        // If pod_documents column doesn't exist, retry without it
        if (insertError && insertError.code === 'PGRST204' && insertError.message?.includes('pod_documents')) {
          console.warn('pod_documents column not found, saving without it. Please add the column to your Supabase jobs table.');
          const { pod_documents, ...jobDataWithoutPod } = jobData;
          const retryResult = await supabase
            .from('jobs')
            .insert([jobDataWithoutPod])
            .select('*');
          if (retryResult.error) {
            console.error('Supabase insert error details:', JSON.stringify(retryResult.error));
            throw retryResult.error;
          }
          newJob = retryResult.data;
          insertError = null;
        }

        if (insertError) {
          console.error('Supabase insert error details:', JSON.stringify(insertError));
          throw insertError;
        }
        result = newJob;

        // Broadcast notification to all users
        supabase.rpc('notify_all_users', {
          p_title: 'New Job Order',
          p_message: `Job Order ${jobData.job_no} created by ${userEmail}.`,
          p_type: 'info'
        }).catch(err => console.error('Notification error', err));
      }

      // ============ FIX 5: CLEAR STORAGE AFTER SAVE ============
      onClose(formConfig.id);
      setNewPods([{ podNo: '', file: null }]);
      window.dispatchEvent(new Event('job_data_updated'));

      setSuccess(editingJob ? 'Job updated successfully!' : 'Job created successfully!');

      // Refresh the jobs list immediately after creating/updating a job
      fetchJobs();
    } catch (error) {
      console.error('Error saving job:', error);
      setError(typeof error === 'object' && error.message ? error.message : String(error));
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
      sobDate: job.sob_date ? new Date(job.sob_date).toISOString().split('T')[0] : '',
      freightValidity: job.freight_validity ? new Date(job.freight_validity).toISOString().split('T')[0] : '',
      pol: safeValue(job.pol),
      containerType: safeValue(job.container_type),
      pod: safeValue(job.pod),
      destination: safeValue(job.destination),
      commodity: safeValue(job.commodity),
      terms: safeValue(job.terms),
      hal: safeValue(job.hal),
      sbNo: safeValue(job.sb_no),
      containerNo: safeValue(job.container_no),
      sLine: safeValue(job.s_line),
      buyingRate: safeValue(job.buying_rate),
      buyingCurrency: job.buying_currency || 'INR',
      sellingRate: safeValue(job.selling_rate),
      sellingCurrency: job.selling_currency || 'INR',
      exchangeRate: safeValue(job.exchange_rate),
      spotRate: safeValue(job.spot_rate),
      spotRateCurrency: job.spot_rate_currency || 'INR',
      mblNo: safeValue(job.mbl_no),
      hblNo: safeValue(job.hbl_no),
      vessel: safeValue(job.vessel),
      voy: safeValue(job.voy),
      sob: safeValue(job.sob),
      ac: safeValue(job.ac),
      orderNo: safeValue(job.order_no),
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
      ship_to: safeValue(job.ship_to),
      vehicle_type: safeValue(job.vehicle_type),
      lrn_no: safeValue(job.lrn_no),
      from: safeValue(job.from_location),
      to: safeValue(job.to_location),
      factory_reporting_date: job.factory_reporting_date ? new Date(job.factory_reporting_date).toISOString().split('T')[0] : '',
      dispatch_date: job.dispatch_date ? new Date(job.dispatch_date).toISOString().split('T')[0] : '',
      reporting_date: job.reporting_date ? new Date(job.reporting_date).toISOString().split('T')[0] : '',
      unloading_date: job.unloading_date ? new Date(job.unloading_date).toISOString().split('T')[0] : '',
      days_of_detention: safeValue(job.days_of_detention),
      transporter: safeValue(job.transporter),
      vehicle_buy_amount: safeValue(job.vehicle_buy_amount),
      vehicle_billing_amount: safeValue(job.vehicle_billing_amount),
      movement: safeValue(job.movement),
      vehicle_number: safeValue(job.vehicle_number),
      driver_name: safeValue(job.driver_name),
      driver_mobile_no: safeValue(job.driver_mobile_no),
      order_no: safeValue(job.order_no),
      order_date: job.order_date ? new Date(job.order_date).toISOString().split('T')[0] : '',
      amount: safeValue(job.amount),
      advance: safeValue(job.advance),
      eway_bill_no: safeValue(job.eway_bill_no),
      invoice_attachment: job.invoice_attachment || null,
      eway_bill_attachment: job.eway_bill_attachment || null,
      description_of_goods: safeValue(job.description_of_goods),
      goods_attachment: job.goods_attachment || null,
      consignee_address: safeValue(job.consignee_address),
      consignee_contact: safeValue(job.consignee_contact),
      ship_to_address: safeValue(job.ship_to_address),
      ship_to_contact: safeValue(job.ship_to_contact),
      pod_documents: job.pod_documents || [],
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
      return ['AOL', 'Airport of Destination'];
    } else if (jobType === 'TRANSPORT') {
      return ['From', 'To'];
    } else {
      return ['POL', 'POD'];
    }
  }, []);

  // Delete an existing pod document
  const handleDeleteExistingPod = useCallback((index) => {
    setFormData(prev => ({
      ...prev,
      pod_documents: prev.pod_documents.filter((_, i) => i !== index)
    }));
  }, []);

  // Render POD upload section
  const renderPodUploadSection = useCallback(() => {
    const handleNoOfPodsInputChange = (e) => {
      let value = parseInt(e.target.value);
      if (isNaN(value) || value < 0) value = 0;

      setNewPods(prev => {
        const currentLength = prev.length;
        if (value > currentLength) {
          const additional = Array(value - currentLength).fill(null).map(() => ({ podNo: '', file: null }));
          return [...prev, ...additional];
        } else if (value < currentLength) {
          return prev.slice(0, value);
        }
        return prev;
      });
    };

    return (
      <div className="pod-upload-section">
        <h3 className="pod-upload-header">
          <FileUp size={18} /> Attachments
        </h3>
        <div className="pod-upload-input-group">

          {/* Existing POD Documents (from database) */}
          {formData.pod_documents && formData.pod_documents.length > 0 && (
            <div className="existing-pod-files" style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} /> Previously Attached ({formData.pod_documents.length}):
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {formData.pod_documents.map((doc, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                      <FileText size={14} color="var(--primary-color)" />
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>#{idx + 1}</span>
                      {doc.podNo && <span style={{ background: 'var(--primary-color)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>No: {doc.podNo}</span>}
                      <span style={{ color: 'var(--text-secondary)' }}>{doc.name || `Document ${idx + 1}`}</span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a href={getFileUrl(doc.path, 'pod-attachments')} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', color: 'var(--primary-color)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '500', border: '1px solid var(--primary-color)', borderRadius: '4px' }}>
                        <ExternalLink size={12} /> View
                      </a>
                      <button type="button" onClick={() => handleDeleteExistingPod(idx)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>
                        <X size={12} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Attachments */}
          <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '600' }}>Add New Attachments:</label>
            <input
              type="number"
              min="0"
              value={newPods.length}
              onChange={handleNoOfPodsInputChange}
              style={{ width: '80px', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}
            />
          </div>

          {newPods.map((pod, index) => (
            <div key={index} className="pod-entry-row" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', background: 'var(--bg-surface)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem' }}>Attachment No.</label>
                <input
                  type="text"
                  placeholder="Enter No"
                  value={pod.podNo}
                  onChange={(e) => handlePodNoChange(index, e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem' }}>Upload Document (PDF/Image)</label>
                <input
                  type="file"
                  onChange={(e) => handlePodFileSelect(index, e)}
                  accept=".pdf,image/*"
                  style={{ width: '100%', padding: '5px' }}
                />
                {pod.file && <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--text-secondary)' }}>Selected: {pod.file.name}</div>}
              </div>
              {newPods.length > 1 && (
                <button type="button" onClick={() => removePodEntry(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', marginTop: '28px', padding: '4px' }}>
                  <X size={18} />
                </button>
              )}
            </div>
          ))}

          {uploading && <div className="upload-progress" style={{ marginTop: '15px' }}>Uploading: {uploadProgress}%</div>}
        </div>
      </div>
    );
  }, [newPods, uploading, uploadProgress, formData.pod_documents, handlePodNoChange, handlePodFileSelect, removePodEntry, getFileUrl, handleDeleteExistingPod]);

  // Render step 3 fields based on job type
  const renderStep3Fields = useCallback(() => {
    if (jobType === 'AIR FREIGHT') {
      return (
        <div className="port-details-form">
          <h2>Air Freight Details - {tradeDirection}</h2>
          <div className="form-grid-two-column">
            {[
              { label: 'Job No.', name: 'jobNo', type: 'text' },
              { label: 'Client Name', name: 'client', type: 'autocomplete' },
              { label: 'Shipper', name: 'shipper', type: 'text' },
              { label: 'Consignee', name: 'consignee', type: 'text' },
              { label: 'Notify Party', name: 'notify_party', type: 'text' },
              { label: 'Invoice Number', name: 'invoiceNo', type: 'text' },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date' },
              { label: 'AOL', name: 'airport_of_departure', type: 'text' },
              { label: 'Airport of Destination', name: 'airport_of_destination', type: 'text' },
              { label: 'No of Packages', name: 'no_of_packages', type: 'number' },
              { label: 'Gross Weight', name: 'grossWeight', type: 'number' },
              { label: 'Dimension', name: 'dimension_cms', type: 'text' },
              { label: 'Chargeable Weight', name: 'chargeable_weight', type: 'number' },
              { label: 'Name of Airline', name: 'name_of_airline', type: 'text' },
              { label: 'AWB', name: 'awb', type: 'text' },
              { label: 'ETA (Date)', name: 'flight_eta', type: 'date' },
              { label: 'Terms', name: 'terms', type: 'text' },
              { label: 'Buying Rate', name: 'buyingRate', type: 'currency-amount', currencyName: 'buyingCurrency' },
              { label: 'Selling Rate', name: 'sellingRate', type: 'currency-amount', currencyName: 'sellingCurrency' },
              { label: 'Exchange Rate', name: 'exchangeRate', type: 'number' },
              { label: 'Spot Rate', name: 'spotRate', type: 'currency-amount', currencyName: 'spotRateCurrency' },
              { label: 'Freight Validity', name: 'freightValidity', type: 'date' },
            ].map((field, index) => (
              <div key={index} className="form-group">
                <label>{field.label} <span className="required">*</span></label>
                {field.type === 'currency-amount' ? (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      name={field.currencyName}
                      value={formData[field.currencyName]}
                      onChange={handleInputChange}
                      style={{ width: '80px', padding: '10px 15px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-surface)' }}
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                    </select>
                    <input
                      type="number"
                      name={field.name}
                      value={formData[field.name]}
                      onChange={handleInputChange}
                      className={validationErrors[field.name] ? 'error' : ''}
                      style={{ flex: 1 }}
                    />
                  </div>
                ) : field.type === 'autocomplete' ? (
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      name={field.name}
                      value={formData[field.name] || ''}
                      onChange={(e) => {
                        handleInputChange(e);
                        if (field.name === 'client') {
                          fetchClientSuggestions(e.target.value);
                          setShowClientSuggestions(true);
                        }
                      }}
                      className={validationErrors[field.name] ? 'error' : ''}
                      onFocus={() => {
                        if (field.name === 'client' && formData[field.name]) {
                          fetchClientSuggestions(formData[field.name]);
                          setShowClientSuggestions(true);
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                      autoComplete="off"
                    />
                    {showClientSuggestions && clientSuggestions.length > 0 && field.name === 'client' && (
                      <ul className="suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', zIndex: 10, listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                        {clientSuggestions.map((sug, i) => (
                          <li key={i} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onMouseDown={() => {
                            setFormData(prev => ({ ...prev, [field.name]: sug }));
                            setShowClientSuggestions(false);
                          }}>
                            {sug}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.type}
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleInputChange}
                    className={validationErrors[field.name] ? 'error' : ''}
                  />
                )}
                {validationErrors[field.name] &&
                  <span className="field-error">{validationErrors[field.name]}</span>
                }
              </div>
            ))}
          </div>

          <div className="client-os-info">
            Client O/S: Credit Term: CASH | Total O/S: 46000 | Over Due O/S: 46000
          </div>

          {renderPodUploadSection()}
        </div>
      );

    } else if (jobType === 'TRANSPORT') {
      return (
        <div className="port-details-form">
          <h2>Transport Details - {tradeDirection}</h2>
          <div className="form-grid-two-column">
            {/* Add PTL/FTL dropdown at the top */}
            <div className="form-group">
              <label>PTL/FTL <span className="required">*</span></label>
              <select
                name="lclFcl"
                value={formData.lclFcl}
                onChange={handleInputChange}
                className={validationErrors.lclFcl ? 'error' : ''}
              >
                <option value="">Select</option>
                <option value="PTL">PTL</option>
                <option value="FTL">FTL</option>
              </select>
              {validationErrors.lclFcl &&
                <span className="field-error">{validationErrors.lclFcl}</span>
              }
            </div>
            {[
              { label: 'Job No.', name: 'jobNo', type: 'text' },
              { label: 'Client Name', name: 'client', type: 'autocomplete' },
              { label: 'Vehicle Type', name: 'vehicle_type', type: 'text' },
              { label: 'LRN No', name: 'lrn_no', type: 'text' },
              { label: 'From', name: 'from', type: 'text' },
              { label: 'To', name: 'to', type: 'text' },
              { label: 'Consignee', name: 'consignee', type: 'text' },
              { label: 'Consignor', name: 'shipper', type: 'text' },
              { label: 'S/B No', name: 'sbNo', type: 'text', condition: tradeDirection === 'EXPORT' },
              { label: 'BOE', name: 'boeNo', type: 'text', condition: tradeDirection === 'IMPORT' },
              { label: 'Factory Reporting Date', name: 'factory_reporting_date', type: 'date', condition: tradeDirection !== 'IMPORT' },
              { label: 'Dispatch Date', name: 'dispatch_date', type: 'date' },
              { label: 'Reporting Date', name: 'reporting_date', type: 'date' },
              { label: 'Unloading Date', name: 'unloading_date', type: 'date' },
              { label: 'Days of Detention', name: 'days_of_detention', type: 'number' },
              { label: 'Transporter', name: 'transporter', type: 'text' },
              { label: 'Vehicle Buy Amount', name: 'vehicle_buy_amount', type: 'number' },
              { label: 'Vehicle Billing Amount', name: 'vehicle_billing_amount', type: 'number' },
              { label: 'Vehicle Number', name: 'vehicle_number', type: 'text' },
              { label: 'Driver Name', name: 'driver_name', type: 'text' },
              { label: 'Driver Mobile No', name: 'driver_mobile_no', type: 'text' },
              { label: 'E-Way Bill Number', name: 'eway_bill_no', type: 'text' },
              { label: 'E-Way Bill Attachment', name: 'eway_bill_attachment', type: 'file' },
              { label: 'Description of Goods', name: 'description_of_goods', type: 'text' },
              { label: 'No of Packages', name: 'no_of_packages', type: 'number' },
              { label: 'Weight', name: 'grossWeight', type: 'number' },
              { label: 'Amount', name: 'amount', type: 'number' },
              { label: 'Advance', name: 'advance', type: 'number' },
            ].map((field, index) =>
              field.condition !== false && (
                <div key={index} className="form-group">
                  <label>{field.label} <span className="required">*</span></label>
                  {field.type === 'autocomplete' ? (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={(e) => {
                          handleInputChange(e);
                          if (field.name === 'client') {
                            fetchClientSuggestions(e.target.value);
                            setShowClientSuggestions(true);
                          }
                        }}
                        className={validationErrors[field.name] ? 'error' : ''}
                        onFocus={() => {
                          if (field.name === 'client' && formData[field.name]) {
                            fetchClientSuggestions(formData[field.name]);
                            setShowClientSuggestions(true);
                          }
                        }}
                        onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                        autoComplete="off"
                      />
                      {showClientSuggestions && clientSuggestions.length > 0 && field.name === 'client' && (
                        <ul className="suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', zIndex: 10, listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                          {clientSuggestions.map((sug, i) => (
                            <li key={i} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onMouseDown={() => {
                              setFormData(prev => ({ ...prev, [field.name]: sug }));
                              setShowClientSuggestions(false);
                            }}>
                              {sug}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <input
                      type={field.type}
                      name={field.name}
                      value={field.type === 'file' ? undefined : (formData[field.name] || '')}
                      onChange={handleInputChange}
                      className={validationErrors[field.name] ? 'error' : ''}
                    />
                  )}
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

          {renderPodUploadSection()}
        </div>
      );
    } else {
      return (
        <div className="port-details-form">
          <h2>Port Details - {tradeDirection}</h2>
          <div className="form-grid-two-column">
            {[
              { label: 'Job No.', name: 'jobNo', type: 'text', condition: true },
              { label: 'Client Name', name: 'client', type: 'autocomplete', condition: true },
              { label: 'Exporter', name: 'exporter', type: 'text', condition: tradeDirection === 'EXPORT' },
              { label: 'Importer', name: 'importer', type: 'text', condition: tradeDirection === 'IMPORT' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text', condition: true },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date', condition: true },
              { label: 'MBL No', name: 'mblNo', type: 'text', condition: true },
              { label: 'MBL Date', name: 'mblDate', type: 'date', condition: true },
              { label: 'HBL No', name: 'hblNo', type: 'text', condition: true },
              { label: 'HBL DT', name: 'hblDt', type: 'date', condition: true },
              { label: 'Container Type', name: 'containerType', type: 'text', condition: true },
              { label: 'Container No', name: 'containerNo', type: 'text', condition: true },
              { label: 'No of CNTR', name: 'noOfCntr', type: 'number', condition: true },
              { label: 'Pickup Date', name: 'stuffingDate', type: 'date', condition: true },
              { label: 'Terms', name: 'terms', type: 'text', condition: true },
              { label: 'Consignee', name: 'consignee', type: 'text', condition: true },
              { label: 'Commodity', name: 'commodity', type: 'text', condition: true },
              { label: 'S/B No', name: 'sbNo', type: 'text', condition: tradeDirection === 'EXPORT' },
              { label: 'S/B Date', name: 'sbDate', type: 'date', condition: tradeDirection === 'EXPORT' },
              { label: 'BOE', name: 'boeNo', type: 'text', condition: tradeDirection === 'IMPORT' },
              { label: 'BOE Date', name: 'boeDate', type: 'date', condition: tradeDirection === 'IMPORT' },
              { label: 'POR', name: 'pol', type: 'text', condition: true },
              { label: 'To', name: 'pod', type: 'text', condition: true },
              { label: 'Freight Validity', name: 'freightValidity', type: 'date', condition: true },
              { label: 'Invoice Value', name: 'invoiceValue', type: 'text', condition: true },
              { label: 'Volume', name: 'volume', type: 'text', condition: true },
              { label: 'GR Weight', name: 'grWeight', type: 'number', condition: true },
              { label: 'Net Weight', name: 'netWeight', type: 'number', condition: true },
              { label: 'S/Line', name: 'sLine', type: 'text', condition: true },
              { label: 'Vessel/voyage', name: 'vessel', type: 'text', condition: true },
              { label: 'ETD', name: 'etd', type: 'datetime-local', condition: true },
              { label: 'ETA', name: 'eta', type: 'datetime-local', condition: true },
              { label: 'SOB', name: 'sob', type: 'text', condition: true },
              { label: 'SOB Date', name: 'sobDate', type: 'date', condition: true },
              { label: 'C/C Port', name: 'ccPort', type: 'text', condition: true },
              { label: 'Buying Rate', name: 'buyingRate', type: 'currency-amount', currencyName: 'buyingCurrency', condition: true },
              { label: 'Selling Rate', name: 'sellingRate', type: 'currency-amount', currencyName: 'sellingCurrency', condition: true },
              { label: 'Exchange Rate', name: 'exchangeRate', type: 'number', condition: true },
              { label: 'Spot Rate', name: 'spotRate', type: 'currency-amount', currencyName: 'spotRateCurrency', condition: true },
            ].map((field, index) =>
              field.condition && (
                <div key={index} className="form-group">
                  <label>{field.label} <span className="required">*</span></label>
                  {field.type === 'currency-amount' ? (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <select
                        name={field.currencyName}
                        value={formData[field.currencyName]}
                        onChange={handleInputChange}
                        style={{ width: '80px', padding: '10px 15px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-surface)' }}
                      >
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                      </select>
                      <input
                        type="number"
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={handleInputChange}
                        className={validationErrors[field.name] ? 'error' : ''}
                        style={{ flex: 1 }}
                      />
                    </div>
                  ) : field.type === 'autocomplete' ? (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={(e) => {
                          handleInputChange(e);
                          if (field.name === 'client') {
                            fetchClientSuggestions(e.target.value);
                            setShowClientSuggestions(true);
                          }
                        }}
                        className={validationErrors[field.name] ? 'error' : ''}
                        onFocus={() => {
                          if (field.name === 'client' && formData[field.name]) {
                            fetchClientSuggestions(formData[field.name]);
                            setShowClientSuggestions(true);
                          }
                        }}
                        onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                        autoComplete="off"
                      />
                      {showClientSuggestions && clientSuggestions.length > 0 && field.name === 'client' && (
                        <ul className="suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', zIndex: 10, listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                          {clientSuggestions.map((sug, i) => (
                            <li key={i} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onMouseDown={() => {
                              setFormData(prev => ({ ...prev, [field.name]: sug }));
                              setShowClientSuggestions(false);
                            }}>
                              {sug}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <input
                      type={field.type}
                      name={field.name}
                      value={formData[field.name] || ''}
                      onChange={handleInputChange}
                      className={validationErrors[field.name] ? 'error' : ''}
                    />
                  )}
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

          {renderPodUploadSection()}
        </div>
      );
    }
  }, [jobType, tradeDirection, formData, handleInputChange, validationErrors, renderPodUploadSection]);

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
                {selectedJob.pod_documents && selectedJob.pod_documents.length > 0 && (
                  <div className="summary-row" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                    <span className="label" style={{ alignSelf: 'flex-start', paddingTop: '5px' }}>Attachments:</span>
                    <span className="value" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {selectedJob.pod_documents.map((doc, idx) => (
                        <a
                          key={idx}
                          href={getFileUrl(doc.path, 'pod-attachments')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pod-preview-link"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'var(--bg-surface-hover)', borderRadius: '4px', textDecoration: 'none' }}
                        >
                          <ExternalLink size={14} />
                          {doc.podNo ? <strong style={{ color: 'var(--text-primary)' }}>[{doc.podNo}]</strong> : null} {doc.name || `Document ${idx + 1}`}
                        </a>
                      ))}
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
                    <span className="label">PTL/FTL:</span>
                    <span className="value">{getValue(selectedJob.lcl_fcl)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Vehicle Type:</span>
                    <span className="value">{getValue(selectedJob.vehicle_type)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Consignee:</span>
                    <span className="value">{getValue(selectedJob.consignee)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Consignee Address:</span>
                    <span className="value">{getValue(selectedJob.consignee_address)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Consignee Contact No:</span>
                    <span className="value">{getValue(selectedJob.consignee_contact)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Consignor:</span>
                    <span className="value">{getValue(selectedJob.shipper)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Ship To:</span>
                    <span className="value">{getValue(selectedJob.ship_to)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Ship To Address:</span>
                    <span className="value">{getValue(selectedJob.ship_to_address)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Ship To Contact No:</span>
                    <span className="value">{getValue(selectedJob.ship_to_contact)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Transporter:</span>
                    <span className="value">{getValue(selectedJob.transporter)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Vehicle Number:</span>
                    <span className="value">{getValue(selectedJob.vehicle_number)}</span>
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
                    <span className="label">Invoice Number:</span>
                    <span className="value">{getValue(selectedJob.invoice_no)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Invoice Attachment:</span>
                    <span className="value">
                      {selectedJob.invoice_attachment?.path ?
                        <a href={getFileUrl(selectedJob.invoice_attachment.path)} target="_blank" rel="noopener noreferrer">View</a> :
                        'No File'}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">E-Way Bill Number:</span>
                    <span className="value">{getValue(selectedJob.eway_bill_no)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">E-Way Bill Attachment:</span>
                    <span className="value">
                      {selectedJob.eway_bill_attachment?.path ?
                        <a href={getFileUrl(selectedJob.eway_bill_attachment.path)} target="_blank" rel="noopener noreferrer">View</a> :
                        'No File'}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Description of Goods:</span>
                    <span className="value">{getValue(selectedJob.description_of_goods)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Goods Attachment:</span>
                    <span className="value">
                      {selectedJob.goods_attachment?.path ?
                        <a href={getFileUrl(selectedJob.goods_attachment.path)} target="_blank" rel="noopener noreferrer">View</a> :
                        'No File'}
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">No of Packages:</span>
                    <span className="value">{getValue(selectedJob.no_of_packages)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Weight:</span>
                    <span className="value">{getValue(selectedJob.gross_weight)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Amount:</span>
                    <span className="value">{getValue(selectedJob.amount)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Advance:</span>
                    <span className="value">{getValue(selectedJob.advance)}</span>
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

            {/* Dedicated POD Documents Section */}
            <div className="summary-section">
              <h3><FileText size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />Attached Documents</h3>
              {selectedJob.pod_documents && selectedJob.pod_documents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedJob.pod_documents.map((doc, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
                        <FileText size={16} color="var(--primary-color)" />
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>#{idx + 1}</span>
                        {doc.podNo && <span style={{ background: 'var(--primary-color)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>POD: {doc.podNo}</span>}
                        <span style={{ color: 'var(--text-secondary)' }}>{doc.name || `Document ${idx + 1}`}</span>
                      </span>
                      <a
                        href={getFileUrl(doc.path, 'pod-attachments')}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 12px', background: 'var(--primary-color)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '500' }}
                      >
                        <ExternalLink size={12} /> View
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  No POD documents attached to this job.
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

      {formConfig.isMinimized && (
        <div className="minimized-job-bar" onClick={() => onRestore(formConfig.id)}>
          <div className="minimized-job-content">
            <span className="minimized-job-title">
              {editingJob ? 'Editing Job' : 'Creating Job'} - {jobType || 'Draft'}
            </span>
            <div className="minimized-actions">
              <button className="window-btn" title="Restore"><Maximize2 size={14} /></button>
              <button className="window-btn close-btn" onClick={(e) => { e.stopPropagation(); onClose(formConfig.id); }} title="Close"><X size={14} /></button>
            </div>
          </div>
        </div>
      )}
      {!formConfig.isMinimized && (
        <div className="modal-overlay">
          <div className="modal-content job-modal full-screen-modal">
            <div className="new-shipment-card full-height-card">
              <div className="new-shipment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button className="window-btn" onClick={handleBack} disabled={activeStep === 1} title="Back" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: activeStep === 1 ? 'not-allowed' : 'pointer', opacity: activeStep === 1 ? 0.4 : 1, color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
                    <ArrowLeft size={16} />
                  </button>
                  <button className="window-btn" onClick={handleNext} disabled={activeStep >= Math.max(maxStepReached, STEPS.length)} title="Forward" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: activeStep >= Math.min(maxStepReached, STEPS.length) ? 'not-allowed' : 'pointer', opacity: activeStep >= Math.min(maxStepReached, STEPS.length) ? 0.4 : 1, color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
                    <ArrowRight size={16} />
                  </button>
                  <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{editingJob ? 'Edit Job' : 'Create Job'}</h1>
                  {editingJob && (
                    <div className="modal-author-info" style={{ display: 'flex', gap: '10px' }}>
                      {editingJob.created_by && <span className="audit-badge"><UserPlus size={12} /> {editingJob.created_by.split('@')[0]}</span>}
                      {editingJob.updated_by && <span className="audit-badge edit"><PenLine size={12} /> {editingJob.updated_by.split('@')[0]}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => onMinimize(formConfig.id)} title="Minimize" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
                    <Minus size={16} />
                  </button>
                  <button onClick={handleCancel} title="Close" style={{ background: '#e74c3c', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center' }}>
                    <X size={16} />
                  </button>
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
              <div className="step-content content-scrollable">
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
                              { label: 'Invoice Number:', value: formData.invoiceNo },
                              { label: 'Invoice Date:', value: formData.invoiceDate },
                              { label: 'AOL:', value: formData.airport_of_departure },
                              { label: 'Airport of Destination:', value: formData.airport_of_destination },
                              { label: 'No of Packages:', value: formData.no_of_packages },
                              { label: 'Gross Weight:', value: formData.grossWeight },
                              { label: 'Dimension:', value: formData.dimension_cms },
                              { label: 'Chargeable Weight:', value: formData.chargeable_weight },
                              { label: 'Name of Airline:', value: formData.name_of_airline },
                              { label: 'AWB:', value: formData.awb },
                              { label: 'ETA (Date):', value: formData.flight_eta },
                              { label: 'Terms:', value: formData.terms },
                              { label: 'Buying Rate:', value: `${formData.buyingCurrency || 'INR'} ${formData.buyingRate || ''}` },
                              { label: 'Selling Rate:', value: `${formData.sellingCurrency || 'INR'} ${formData.sellingRate || ''}` },
                              { label: 'Exchange Rate:', value: formData.exchangeRate },
                              { label: 'Spot Rate:', value: `${formData.spotRateCurrency || 'INR'} ${formData.spotRate || ''}` },
                              { label: 'Freight Validity:', value: formData.freightValidity },
                            ].map((item, index) => (
                              <div key={index} className="booking-info-row">
                                <span className="label">{item.label}</span>
                                <span className="value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.pod_documents && formData.pod_documents.length > 0 && (
                          <div className="summary-pod-section" style={{ marginTop: '15px', padding: '10px', background: 'rgba(54, 179, 126, 0.1)', borderRadius: '6px', border: '1px solid rgba(54, 179, 126, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a7a4d', marginBottom: '8px' }}>
                              <FileText size={16} /> <strong style={{ fontSize: '0.9rem' }}>Attachments ({formData.pod_documents.length})</strong>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '24px' }}>
                              {formData.pod_documents.map((doc, idx) => (
                                <a key={idx} href={getFileUrl(doc.path, 'pod-attachments')} target="_blank" rel="noopener noreferrer" style={{ color: '#0052CC', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <ExternalLink size={12} /> {doc.name || `Document ${idx + 1}`}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
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
                              { label: 'PTL/FTL:', value: formData.lclFcl },
                              { label: 'Vehicle Type:', value: formData.vehicle_type },
                              { label: 'LRN No:', value: formData.lrn_no },
                              { label: 'From:', value: formData.from },
                              { label: 'To:', value: formData.to },
                              { label: 'Consignee:', value: formData.consignee },
                              { label: 'Consignee Address:', value: formData.consignee_address },
                              { label: 'Consignee Contact No:', value: formData.consignee_contact },
                              { label: 'Consignor:', value: formData.shipper },
                              { label: 'Ship To:', value: formData.ship_to },
                              { label: 'Ship To Address:', value: formData.ship_to_address },
                              { label: 'Ship To Contact No:', value: formData.ship_to_contact },
                              { label: 'Factory Reporting Date:', value: formData.factory_reporting_date },
                              { label: 'Dispatch Date:', value: formData.dispatch_date },
                              { label: 'Reporting Date:', value: formData.reporting_date },
                              { label: 'Unloading Date:', value: formData.unloading_date },
                              { label: 'Days of Detention:', value: formData.days_of_detention },
                              { label: 'Transporter:', value: formData.transporter },
                              { label: 'Vehicle Buy Amount:', value: formData.vehicle_buy_amount },
                              { label: 'Vehicle Billing Amount:', value: formData.vehicle_billing_amount },
                              { label: 'Vehicle Number:', value: formData.vehicle_number },
                              { label: 'Driver Name:', value: formData.driver_name },
                              { label: 'Driver Mobile No:', value: formData.driver_mobile_no },
                              { label: 'Order No:', value: formData.order_no },
                              { label: 'Order Date:', value: formData.order_date },
                              { label: 'Invoice Number:', value: formData.invoiceNo },
                              { label: 'Invoice Attachment:', value: formData.invoice_attachment?.name || 'No file' },
                              { label: 'E-Way Bill Number:', value: formData.eway_bill_no },
                              { label: 'E-Way Bill Attachment:', value: formData.eway_bill_attachment?.name || 'No file' },
                              { label: 'Description of Goods:', value: formData.description_of_goods },
                              { label: 'Goods Attachment:', value: formData.goods_attachment?.name || 'No file' },
                              { label: 'No of Packages:', value: formData.no_of_packages },
                              { label: 'Weight:', value: formData.grossWeight },
                              { label: 'Amount:', value: formData.amount },
                              { label: 'Advance:', value: formData.advance },
                            ].map((item, index) => (
                              <div key={index} className="booking-info-row">
                                <span className="label">{item.label}</span>
                                <span className="value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.pod_documents && formData.pod_documents.length > 0 && (
                          <div className="summary-pod-section" style={{ marginTop: '15px', padding: '10px', background: 'rgba(54, 179, 126, 0.1)', borderRadius: '6px', border: '1px solid rgba(54, 179, 126, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a7a4d', marginBottom: '8px' }}>
                              <FileText size={16} /> <strong style={{ fontSize: '0.9rem' }}>Attachments ({formData.pod_documents.length})</strong>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '24px' }}>
                              {formData.pod_documents.map((doc, idx) => (
                                <a key={idx} href={getFileUrl(doc.path, 'pod-attachments')} target="_blank" rel="noopener noreferrer" style={{ color: '#0052CC', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <ExternalLink size={12} /> {doc.name || `Document ${idx + 1}`}
                                </a>
                              ))}
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
                              { label: 'Pickup Date:', value: formData.stuffingDate },
                              { label: 'Terms:', value: formData.terms },
                              { label: 'Consignee:', value: formData.consignee },
                              { label: 'Commodity:', value: formData.commodity },
                              ...(tradeDirection === 'EXPORT' ? [
                                { label: 'S/B No:', value: formData.sbNo },
                                { label: 'S/B Date:', value: formData.sbDate }
                              ] : []),
                              ...(tradeDirection === 'IMPORT' ? [
                                { label: 'BOE:', value: formData.boeNo },
                                { label: 'BOE Date:', value: formData.boeDate }
                              ] : []),
                              { label: 'Container Type:', value: formData.containerType },
                              { label: 'Container No:', value: formData.containerNo },
                              { label: 'No of CNTR:', value: formData.noOfCntr },
                              { label: 'POR:', value: formData.pol },
                              { label: 'POD:', value: formData.pod },
                              { label: 'Destination:', value: formData.destination },
                              { label: 'Freight Validity:', value: formData.freightValidity },
                              { label: 'Invoice Value:', value: formData.invoiceValue },
                              { label: 'GR Weight:', value: formData.grWeight },
                              { label: 'Net Weight:', value: formData.netWeight },
                              { label: 'Volume:', value: formData.volume },
                              { label: 'S/Line:', value: formData.sLine },
                              { label: 'Vessel/voyage:', value: formData.vessel },
                              { label: 'MBL No:', value: formData.mblNo },
                              { label: 'MBL Date:', value: formData.mblDate },
                              { label: 'HBL No:', value: formData.hblNo },
                              { label: 'HBL DT:', value: formData.hblDt },
                              { label: 'ETD:', value: formData.etd ? new Date(formData.etd).toLocaleString() : 'N/A' },
                              { label: 'ETA:', value: formData.eta ? new Date(formData.eta).toLocaleString() : 'N/A' },
                              { label: 'SOB:', value: formData.sob },
                              { label: 'SOB Date:', value: formData.sobDate },
                              { label: 'A/C:', value: formData.ac },
                              { label: 'C/C Port:', value: formData.ccPort },
                              { label: 'Order No:', value: formData.orderNo },
                              { label: 'Order Date:', value: formData.orderDate },
                              { label: 'Buying Rate:', value: `${formData.buyingCurrency || 'INR'} ${formData.buyingRate || ''}` },
                              { label: 'Selling Rate:', value: `${formData.sellingCurrency || 'INR'} ${formData.sellingRate || ''}` },
                              { label: 'Exchange Rate:', value: formData.exchangeRate },
                              { label: 'Spot Rate:', value: `${formData.spotRateCurrency || 'INR'} ${formData.spotRate || ''}` },
                            ].map((item, index) => (
                              <div key={index} className="booking-info-row">
                                <span className="label">{item.label}</span>
                                <span className="value">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.pod_documents && formData.pod_documents.length > 0 && (
                          <div className="summary-pod-section" style={{ marginTop: '15px', padding: '10px', background: 'rgba(54, 179, 126, 0.1)', borderRadius: '6px', border: '1px solid rgba(54, 179, 126, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a7a4d', marginBottom: '8px' }}>
                              <FileText size={16} /> <strong style={{ fontSize: '0.9rem' }}>Attachments ({formData.pod_documents.length})</strong>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '24px' }}>
                              {formData.pod_documents.map((doc, idx) => (
                                <a key={idx} href={getFileUrl(doc.path, 'pod-attachments')} target="_blank" rel="noopener noreferrer" style={{ color: '#0052CC', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <ExternalLink size={12} /> {doc.name || `Document ${idx + 1}`}
                                </a>
                              ))}
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
                <div className="step-buttons">
                  {activeStep < STEPS.length && (
                    <button className="next-button" onClick={handleNext}>
                      Next
                    </button>
                  )}
                  {activeStep === STEPS.length && (
                    <button className="confirm-button" onClick={handleCreateJob} disabled={loading || isOffline} style={{ padding: '8px 24px', fontWeight: 'bold' }}>
                      {isOffline ? 'Offline - Reconnect to Save' : (loading ? 'Saving...' : (editingJob ? 'Save Changes' : 'Confirm & Save Job'))}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}



const GlobalJobForm = () => {
  const [forms, setForms] = useState(() => {
    const saved = sessionStorage.getItem('job_forms_v2');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('job_forms_v2', JSON.stringify(forms));
  }, [forms]);

  useEffect(() => {
    const handleOpenGlobalForm = (e) => {
      const jobToEdit = e.detail;

      // Handle migration from enquiry — creates a NEW job with pre-filled data
      if (jobToEdit && jobToEdit._fromEnquiry) {
        const newFormId = `enq-migrate-${Date.now()}`;
        setForms(prev => {
          const newForm = {
            id: newFormId,
            isMinimized: false,
            initialState: {
              editingJob: null,
              jobType: jobToEdit._jobType || '',
              tradeDirection: jobToEdit._tradeDirection || '',
              formData: { ...INITIAL_FORM_DATA, ...jobToEdit._formData },
              activeStep: jobToEdit._activeStep || 3,
              maxStepReached: jobToEdit._activeStep || 4
            }
          };
          return [...prev.map(f => ({ ...f, isMinimized: true })), newForm];
        });
        return;
      }

      const newFormId = jobToEdit ? `edit-${jobToEdit.id}` : `new-${Date.now()}`;

      setForms(prev => {
        const existingForm = prev.find(f => f.id === newFormId);
        if (existingForm) {
          return prev.map(f => f.id === newFormId ? { ...f, isMinimized: false } : { ...f, isMinimized: true });
        }

        const newForm = {
          id: newFormId,
          isMinimized: false,
          initialState: jobToEdit ? {
            editingJob: jobToEdit,
            jobType: jobToEdit._jobType || jobToEdit.job_type || '',
            tradeDirection: jobToEdit._tradeDirection || jobToEdit.trade_direction || '',
            formData: jobToEdit._formData || { ...INITIAL_FORM_DATA },
            activeStep: jobToEdit._activeStep || 3,
            maxStepReached: jobToEdit._activeStep || 3
          } : {
            editingJob: null,
            jobType: '',
            tradeDirection: '',
            formData: { ...INITIAL_FORM_DATA },
            activeStep: 1,
            maxStepReached: 1
          }
        };

        return [...prev.map(f => ({ ...f, isMinimized: true })), newForm];
      });
    };

    window.addEventListener('open_global_job_form', handleOpenGlobalForm);
    return () => window.removeEventListener('open_global_job_form', handleOpenGlobalForm);
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
        <JobFormWindow
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
            <JobFormWindow
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
        <div className="minimized-taskbar-container">
          {forms.map(form => form.isMinimized && (
            <JobFormWindow
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

export default GlobalJobForm;