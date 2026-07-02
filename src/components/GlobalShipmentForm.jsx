import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Maximize2, Minus, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { UserPlus, PenLine, FileUp, ExternalLink, FileText } from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabaseClient';
import { getServerDateString } from '../utils/serverDate';
import './NewShipments.css';
import './ActivityTable.css';

// Lazy load PDFGenerator to reduce initial bundle size
const PDFGenerator = lazy(() => import('./PDFGenerator.jsx'));

// Constants for better maintainability
const SHIPMENT_TYPES = ['AIR FREIGHT', 'SEA FREIGHT', 'TRANSPORT', 'OTHERS'];
const STEPS = ['Create Shipment', 'Port Details', 'Summary'];
const CATEGORIES = [
  'AGENT', 'ARLINE', 'BANK', 'BIKE', 'BIOKER', 'BUYER', 
  'CAREER', 'CAREER AGENT'
];

const SHIPMENT_TYPE_IMAGES = {
  'AIR FREIGHT': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfEp12ssHJHjPGZbb-2MwENsvs8vCxqliFyo-up01eOBuQ9Dy8EUEL4xOjK2DTi5O27C4jyQIrpbsaDav1zc8yQgnJPfKibFRLiK-ruLGeg5hXY5uoEFkSbA53ExGcS01jtW6xBnZp-PiuWUJTQYGY1iG0Oc1-b-GIOZssL3zbD3D0XV4M8Od2XdiBkV3ZMziOkY32mx15Mv945SVRdWvQWgkxbBp5oCv2FCDUMBvThqyKcCbfK0hXMER_UCpsUTLqp2qSpXT2DEs',
  'SEA FREIGHT': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAJy7IMnj8PPQzu3O3An_AGLLTmfPdyvx2gi-Y_ebIBOqeVgh6nQ29cirfa0zNvwcH98uASd278NI4wS0eFghh0cD402SdKwDgwzaHvy3mM5pw27bzISH8z2TAJ3nQfFd3qBCVNuGU4AY7qHr6P7S3d0oShmo4V33AJAmx0paq-L87hk9e7b0OrzPRPkzXVAAVrqJiBkpex0RDdniYWqB6yj0IlGl0AmXreP3D7d17AYUMRfYaOy7kXb-uvaXPeV8o7VNrYkh3LP-c',
  'TRANSPORT': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXKeKt_8J3V7RQ0W9uyPOb-f1p6KhvG8tUrRV4O-BJJuFAEC3bsVcGLKuNQ7iNRC0dkR341oczjiXHs9T7ngoSYSVVWMeG0BX2mj7aLFLmTeO-dZsooPKBkGCjqNzSchN4dShUUctKiKdsQ9O2v5KDw297ac0F6DLx2t3tPRmbFFg7GFLdyo979rme99G2AZPMRUEuSA1Q9P4zYmP838Hsm22KgecE_xLq6qhjFw70K0qDtibjdaC1QEtQvLF9F46We670k8j1EBQ',
  'OTHERS': 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2Hh_Fs4cN8w3E5TfSIdJJ9ng0zfURtLYOQ738Vae2SqHkxYCSjfReTv18GGk0NhFg3JIihI3LhzLE53XMp1hNw6igbJ2vb0naQcYBmOspJ4DsewkS8XQ36Uh3FU4Foonzh08KUAyu0VqGOrZwWBV6pz2fz7xHURL_KcqXYR-Ucur9sgriEzYyEkMnBe7rLnTO9k7XHbFxSI6kcxN2UZg2r0XQTOo7ruXkOPDhW7I_SXEFNsbIkv397H5ZHQcS1jZZ5aZrMcK_BwA'
};

const SHIPMENT_TYPE_SUBTITLES = {
  'AIR FREIGHT': 'Express global delivery',
  'SEA FREIGHT': 'High volume maritime shipping',
  'TRANSPORT': 'Domestic road & rail freight',
  'OTHERS': 'Custom multi-modal logistics'
};

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
  shipmentDate: '',
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

const ShipmentFormWindow = ({ formConfig, onClose, onMinimize, onRestore }) => {
  
  const [activeStep, setActiveStep] = useState(formConfig.initialState?.activeStep || 1);
  const [shipmentType, setShipmentType] = useState(formConfig.initialState?.shipmentType || '');
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editingShipment, setEditingShipment] = useState(formConfig.initialState?.editingShipment || null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [generatePDF, setGeneratePDF] = useState(false);
  const [pdfShipmentData, setPdfShipmentData] = useState(null);
  
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
  
  const tableContainerRef = useRef(null);
  
  const [formData, setFormData] = useState(formConfig.initialState?.formData || INITIAL_FORM_DATA);
  const [orgFormData, setOrgFormData] = useState(INITIAL_ORG_FORM_DATA);
  const { uploadFile, getFileUrl, uploading, progress: uploadProgress } = useFileUpload();
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Fetch server date for new shipments
  useEffect(() => {
    let isMounted = true;
    if (!editingShipment && !formData.shipmentDate) {
      getServerDateString().then(serverDate => {
        if (isMounted) {
          setFormData(prev => ({ ...prev, shipmentDate: prev.shipmentDate || serverDate }));
        }
      });
    }
    return () => { isMounted = false; };
  }, [editingShipment]);

  const handleFileSelect = (e) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  

  

  

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

  const handleCancel = useCallback((e) => { if (e && e.stopPropagation) e.stopPropagation(); onClose(formConfig.id); }, [formConfig.id, onClose]);

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
      date_of_issue: shipmentData.shipment_date || formData.shipmentDate || '',
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
        
        const saveWithRetry = async (payload, isUpdate = false, retries = 40) => {
          let currentPayload = { ...payload };
          let currentError = null;

          for (let i = 0; i < retries; i++) {
            let response;
            if (isUpdate) {
              response = await supabase
                .from('shipments')
                .update(currentPayload)
                .eq('id', editingShipment.id)
                .select();
            } else {
              response = await supabase
                .from('shipments')
                .insert([currentPayload])
                .select();
            }

            if (response.error) {
              currentError = response.error;
              // Handle missing column error (PGRST204)
              if (currentError.code === 'PGRST204') {
                const match = currentError.message?.match(/'([^']+)' column/);
                if (match && match[1]) {
                  const missingColumn = match[1];
                  console.warn(`Column '${missingColumn}' not found in database. Retrying without it...`);
                  delete currentPayload[missingColumn];
                  continue; // Retry with the modified payload
                }
              }
              // If it's another error, or we couldn't parse the column name, stop retrying
              throw currentError;
            } else {
              return response.data; // Success
            }
          }
          throw new Error("Failed to save shipment after multiple retries due to schema mismatch.");
        };

        if (editingShipment) {
          cleanShipmentData.updated_by = userEmail;
          result = await saveWithRetry(cleanShipmentData, true);
        } else {
          const { count, error: countErr } = await supabase
            .from('shipments')
            .select('*', { count: 'exact', head: true });
          
          if (countErr) console.error('Error fetching shipment count:', countErr);
          
          const nextNum = (count || 0) + 1;
          const shipmentNo = `MTD-${String(nextNum).padStart(6, '0')}`;
          
          cleanShipmentData.shipment_no = shipmentNo;
          cleanShipmentData.created_by = userEmail;
          
          result = await saveWithRetry(cleanShipmentData, false);
        }
        
        const preparedPDFData = preparePDFData(cleanShipmentData, result, !!editingShipment);
        setPdfShipmentData(preparedPDFData);
        setGeneratePDF(true);
        
        window.dispatchEvent(new CustomEvent('show_global_toast', { 
          detail: { title: 'Success', message: editingShipment ? 'Shipment updated successfully!' : 'Shipment created successfully!', type: 'success' } 
        }));
        
        handleCancel();
        sessionStorage.removeItem('editing_shipment');
        sessionStorage.removeItem('creating_shipment');
        onClose(formConfig.id);
        window.dispatchEvent(new Event('shipment_data_updated'));
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
    setEditingShipment(shipment);
    setShipmentType(shipment.shipment_type);
    
    const formDataFromShipment = {
      branch: shipment.branch,
      department: shipment.department,
      shipmentDate: shipment.shipment_date,
      client: shipment.client,
      shipper: shipment.shipper,
      lclFcl: shipment.lcl_fcl,
      consignee: shipment.consignee,
      address: shipment.address,
      por: shipment.por,
      poi: shipment.poi,
      pod: shipment.pod,
      pof: shipment.pof,
      hblNo: shipment.hbl_no,
      jobNo: shipment.job_no,
      etd: shipment.etd,
      eta: shipment.eta,
      incoterms: shipment.incoterms,
      serviceType: shipment.service_type,
      freight: shipment.freight,
      payableAt: shipment.payable_at,
      dispatchAt: shipment.dispatch_at,
      HSCode: shipment.hs_code,
      pol: shipment.pol,
      pdf: shipment.pdf,
      carrier: shipment.carrier,
      vesselNameSummary: shipment.vessel_name_summary,
      noOfRes: shipment.no_of_res,
      volume: shipment.volume,
      grossWeight: shipment.gross_weight,
      description: shipment.description,
      remarks: shipment.remarks,
      tradeDirection: shipment.trade_direction || 'EXPORT',
      mtdRegistrationNo: shipment.mtd_registration_no || '',
      ccPort: shipment.cc_port || '',
      pod_documents: shipment.pod_documents || (shipment.pod_attachment ? [{ path: shipment.pod_attachment, name: 'Legacy POD' }] : []),
      
      airport_of_departure: shipment.airport_of_departure,
      airport_of_destination: shipment.airport_of_destination,
      no_of_packages: shipment.no_of_packages,
      dimension_cms: shipment.dimension_cms,
      chargeable_weight: shipment.chargeable_weight,
      client_no: shipment.client_no,
      name_of_airline: shipment.name_of_airline,
      awb: shipment.awb,
      flight_from: shipment.flight_from,
      flight_to: shipment.flight_to,
      flight_eta: shipment.flight_eta,
      invoiceNo: shipment.invoiceNo,
      invoiceDate: shipment.invoiceDate,
      notify_party: shipment.notify_party,
      
      exporter: shipment.exporter,
      importer: shipment.importer,
      stuffingDate: shipment.stuffingDate,
      hoDate: shipment.hoDate,
      terms: shipment.terms,
      sbNo: shipment.sbNo,
      sbDate: shipment.sbDate,
      boeNo: shipment.boe_no,
      boeDate: shipment.boe_date,
      destination: shipment.destination,
      commodity: shipment.commodity,
      fob: shipment.fob,
      grWeight: shipment.grWeight,
      netWeight: shipment.netWeight,
      railOutDate: shipment.railOutDate,
      containerNo: shipment.containerNo,
      noOfCntr: shipment.noOfCntr,
      sLine: shipment.sLine,
      mblNo: shipment.mblNo,
      mblDate: shipment.mblDate,
      hblDt: shipment.hblDt,
      vessel: shipment.vessel,
      voy: shipment.voy,
      sob: shipment.sob,
      ac: shipment.ac,
      billNo: shipment.billNo,
      billDate: shipment.billDate,
    };
    
    setFormData(formDataFromShipment);
    setShowShipmentForm(true);
    setActiveStep(2);
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
      window.dispatchEvent(new CustomEvent('show_global_toast', { 
        detail: { title: 'Success', message: 'Shipment deleted successfully!', type: 'success' } 
      }));
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
    <>
      {formConfig.isMinimized && (
        <div className="minimized-job-bar" onClick={() => onRestore(formConfig.id)}>
          <div className="minimized-job-content">
            <span className="minimized-job-title">
              {editingShipment ? 'Editing Shipment' : 'Creating Shipment'} - {shipmentType || 'Draft'}
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
              <div className="new-shipment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#2d3748', borderBottom: 'none', color: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleBack} disabled={activeStep === 1} title="Back" style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(85,95,113,0.4)', border: 'none', cursor: activeStep === 1 ? 'not-allowed' : 'pointer', opacity: activeStep === 1 ? 0.4 : 1, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                      <ArrowLeft size={14} />
                    </button>
                    <button onClick={handleNext} disabled={activeStep >= STEPS.length} title="Forward" style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(85,95,113,0.4)', border: 'none', cursor: activeStep >= STEPS.length ? 'not-allowed' : 'pointer', opacity: activeStep >= STEPS.length ? 0.4 : 1, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>{editingShipment ? 'Edit Shipment' : 'Create Shipment'}</h1>
                  {editingShipment && (
                    <div className="modal-author-info" style={{ display: 'flex', gap: '10px' }}>
                      {editingShipment.created_by && <span className="audit-badge" style={{ color: 'white', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><UserPlus size={12} /> {editingShipment.created_by.split('@')[0]}</span>}
                      {editingShipment.updated_by && <span className="audit-badge edit" style={{ color: 'white', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><PenLine size={12} /> {editingShipment.updated_by.split('@')[0]}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => onMinimize(formConfig.id, { activeStep, maxStepReached: false, shipmentType, formData, editingShipment })} title="Minimize" style={{ width: 32, height: 32, background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
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
                {STEPS.map((step, index) => (
                  <div
                    key={`step-${index}`}
                    className={`stitch-step ${index + 1 === activeStep ? 'active' : ''} ${index + 1 < activeStep ? 'completed' : ''} ${index === 0 ? 'first' : ''} ${index === STEPS.length - 1 ? 'last' : ''}`}
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
                    <h2>What type of Shipment would you like to {editingShipment ? 'edit' : 'create'}?</h2>
                    {validationErrors.shipmentType && (
                      <div className="validation-error">{validationErrors.shipmentType}</div>
                    )}
                    <div className="shipment-type-grid">
                      {SHIPMENT_TYPES.map((type, index) => (
                        <div
                          key={`type-${index}`}
                          className={`shipment-type-card ${shipmentType === type ? 'selected' : ''}`}
                          onClick={() => handleShipmentTypeSelect(type)}
                        >
                          <div className="shipment-card-img-wrap">
                            <img src={SHIPMENT_TYPE_IMAGES[type]} alt={type} className="shipment-card-img" />
                          </div>
                          <div className="shipment-card-info">
                            <span className="shipment-type-text">{type}</span>
                            <span className="shipment-type-subtitle">{SHIPMENT_TYPE_SUBTITLES[type]}</span>
                          </div>
                          {shipmentType === type && <div className="shipment-card-check">✓</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="port-details-form">
                    <h2>Port Details</h2>
                    
                    {shipmentType && TRADE_DIRECTIONS[shipmentType] && (
                      <div className="form-group">
                        <label>Trade Direction</label>
                        <div className="trade-image-grid" style={{ marginTop: '8px' }}>
                          {TRADE_DIRECTIONS[shipmentType].map((direction, index) => (
                            <div
                              key={`direction-${index}`}
                              className={`trade-image-card ${formData.tradeDirection === direction ? 'selected' : ''}`}
                              data-direction={direction}
                              onClick={() => {
                                handleInputChange({ target: { name: 'tradeDirection', value: direction } })
                              }}
                            >
                              <span>{direction}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="form-grid-two-column">
                      <div className="form-group">
                        <label>Branch</label>
                        <input 
                          type="text" 
                          name="branch"
                          value={formData.branch}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Department</label>
                        <input 
                          type="text" 
                          name="department"
                          value={formData.department}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Shipment Date</label>
                        <input 
                          type="date" 
                          name="shipmentDate"
                          value={formData.shipmentDate}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group with-button" style={{ position: 'relative' }}>
                        <label>Client</label>
                        <div className="input-with-button">
                          <input 
                            type="text" 
                            name="client"
                            value={formData.client || ''}
                            onChange={(e) => {
                              handleInputChange(e);
                              fetchClientSuggestions(e.target.value);
                              setShowClientSuggestions(true);
                            }}
                            onFocus={() => {
                              if (formData.client) {
                                fetchClientSuggestions(formData.client);
                                setShowClientSuggestions(true);
                              }
                            }}
                            onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                            autoComplete="off"
                          />
                          <button 
                            className="add-button"
                            onClick={(e) => {
                              e.preventDefault();
                              setShowOrgModal(true);
                            }}
                          >
                            +
                          </button>
                        </div>
                        {showClientSuggestions && clientSuggestions.length > 0 && (
                          <ul className="suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', zIndex: 10, listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                            {clientSuggestions.map((sug, i) => (
                              <li key={i} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} onMouseDown={() => {
                                setFormData(prev => ({ ...prev, client: sug }));
                                setShowClientSuggestions(false);
                              }}>
                                {sug}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Client Email (for payment link)</label>
                        <input 
                          type="email" 
                          name="client_email"
                          placeholder="client@example.com"
                          value={formData.client_email}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Shipper</label>
                        <input 
                          type="text" 
                          name="shipper"
                          value={formData.shipper}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Consignee</label>
                        <input 
                          type="text" 
                          name="consignee"
                          value={formData.consignee}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Address</label>
                        <input 
                          type="text" 
                          name="address"
                          value={formData.address}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>POR</label>
                        <input 
                          type="text" 
                          name="por"
                          value={formData.por}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>POL</label>
                        <input 
                          type="text" 
                          name="pol"
                          value={formData.pol}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>POD</label>
                        <input 
                          type="text" 
                          name="pod"
                          value={formData.pod}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>POF</label>
                        <input 
                          type="text" 
                          name="pof"
                          value={formData.pof}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>HBL No.</label>
                        <input 
                          type="text" 
                          name="hblNo"
                          value={formData.hblNo}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Job No.</label>
                        <select 
                          name="jobNo"
                          value={formData.jobNo}
                          onChange={handleJobSelect}
                        >
                          <option value="">Select a Job</option>
                          {isLoadingJobs ? (
                            <option value="" disabled>Loading jobs...</option>
                          ) : (
                            filteredJobs.map((job) => (
                              <option key={job.id} value={job.job_no}>
                                {job.job_no} - {job.client || 'No Client'} ({job.job_type || 'No Type'})
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>ETD</label>
                        <input 
                          type="date" 
                          name="etd"
                          value={formData.etd}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>ETA</label>
                        <input 
                          type="date" 
                          name="eta"
                          value={formData.eta}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>INCOTERMS</label>
                        <input 
                          type="text" 
                          name="incoterms"
                          value={formData.incoterms}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Service Type</label>
                        <input 
                          type="text" 
                          name="serviceType"
                          value={formData.serviceType}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Freight</label>
                        <input 
                          type="text" 
                          name="freight"
                          value={formData.freight}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Payable At</label>
                        <input 
                          type="text" 
                          name="payableAt"
                          value={formData.payableAt}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Dispatch At</label>
                        <input 
                          type="text" 
                          name="dispatchAt"
                          value={formData.dispatchAt}
                          onChange={handleInputChange}
                        />
                      </div>
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
                    </div>
                    
                    {SpecificFields}

                    <div className="pod-upload-section">
                      <h3 className="pod-upload-header">
                        <FileUp size={18} /> Proof of Delivery (POD)
                      </h3>
                      <div className="pod-upload-input-group">
                        <label>Upload POD Documents (PDF/Image)</label>
                        <input 
                          type="file" 
                          multiple
                          onChange={handleFileSelect}
                          accept=".pdf,image/*"
                        />
                        {uploading && <div className="upload-progress">Uploading: {uploadProgress}%</div>}
                        
                        {selectedFiles && selectedFiles.length > 0 && (
                          <div className="selected-files-list" style={{ marginTop: '10px' }}>
                            <h4>Files to upload ({selectedFiles.length}):</h4>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                              {selectedFiles.map((file, index) => (
                                <li key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{file.name}</span>
                                  <button type="button" onClick={() => removeSelectedFile(index)} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}><X size={14} /></button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {formData.pod_documents && formData.pod_documents.length > 0 && (
                          <div className="existing-pod-files" style={{ marginTop: '10px' }}>
                            <h4>Existing PODs ({formData.pod_documents.length}):</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {formData.pod_documents.map((doc, idx) => (
                                <div key={idx} className="pod-status-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-surface-hover)', borderRadius: '4px' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                    <ExternalLink size={12} /> {doc.name || `Document ${idx + 1}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="client-os-info">
                      Client O/S: Credit Term: CASH | Total O/S: 46000 | Over Due O/S: 46000
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="summary-step">
                    <h2>Summary</h2>
                    
                    <div className="client-branch-section">
                      <div className="client-info">
                        <span className="label">Client</span>
                        <span className="value">{formData.client}</span>
                      </div>
                      <div className="branch-info">
                        <span className="label">Branch</span>
                        <span className="value">{formData.branch}</span>
                      </div>
                      <div className="department-info">
                        <span className="label">Department</span>
                        <span className="value">{formData.department}</span>
                      </div>
                      <div className="shipment-type-info">
                        <span className="label">Shipment Type</span>
                        <span className="value">{shipmentType}</span>
                      </div>
                      <div className="trade-direction-info">
                        <span className="label">Trade Direction</span>
                        <span className="value">{formData.tradeDirection}</span>
                      </div>
                      <div className="mtd-registration-info">
                        <span className="label">MTD Registration No.</span>
                        <span className="value">{formData.mtdRegistrationNo}</span>
                      </div>
                    </div>

                    <div className="divider"></div>

                    <div className="parties-section">
                      <h3>Parties Information</h3>
                      <div className="summary-grid">
                        <div className="summary-row">
                          <span className="label">Shipper:</span>
                          <span className="value">{formData.shipper}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Consignee:</span>
                          <span className="value">{formData.consignee}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Notify Party:</span>
                          <span className="value">{formData.notify_party}</span>
                        </div>
                        <div className="summary-row full-width">
                          <span className="label">Address:</span>
                          <span className="value">{formData.address}</span>
                        </div>
                      </div>
                    </div>

                    <div className="divider"></div>

                    <div className="booking-info-section">
                      <h3>Booking Information</h3>
                      <div className="summary-grid">
                        <div className="summary-row">
                          <span className="label">POR:</span>
                          <span className="value">{formData.por}</span>
                          <span className="label">POL:</span>
                          <span className="value">{formData.pol}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">POD:</span>
                          <span className="value">{formData.pod}</span>
                          <span className="label">POF:</span>
                          <span className="value">{formData.pof}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">POI:</span>
                          <span className="value">{formData.poi}</span>
                          <span className="label">PDF:</span>
                          <span className="value">{formData.pdf}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">ETD:</span>
                          <span className="value">{formData.etd}</span>
                          <span className="label">ETA:</span>
                          <span className="value">{formData.eta}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Shipment Date:</span>
                          <span className="value">{formData.shipmentDate}</span>
                          <span className="label">INCO Terms:</span>
                          <span className="value">{formData.incoterms}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Service Type:</span>
                          <span className="value">{formData.serviceType}</span>
                          <span className="label">Freight:</span>
                          <span className="value">{formData.freight}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Payable At:</span>
                          <span className="value">{formData.payableAt}</span>
                          <span className="label">Dispatch At:</span>
                          <span className="value">{formData.dispatchAt}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Job No:</span>
                          <span className="value">{formData.jobNo}</span>
                          <span className="label">HBL No:</span>
                          <span className="value">{formData.hblNo}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Carrier:</span>
                          <span className="value">{formData.carrier}</span>
                          <span className="label">HS Code:</span>
                          <span className="value">{formData.HSCode}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">No of Res:</span>
                          <span className="value">{formData.noOfRes}</span>
                          <span className="label">Volume:</span>
                          <span className="value">{formData.volume}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">Gross Weight:</span>
                          <span className="value">{formData.grossWeight}</span>
                        </div>
                        <div className="summary-row full-width">
                          <span className="label">Description:</span>
                          <span className="value">{formData.description}</span>
                        </div>
                        <div className="summary-row full-width">
                          <span className="label">Remarks:</span>
                          <span className="value">{formData.remarks}</span>
                        </div>
                        <div className="summary-row">
                          <span className="label">MTD Registration No.:</span>
                          <span className="value">{formData.mtdRegistrationNo}</span>
                        </div>
                      </div>
                    </div>

                    {shipmentType === 'AIR FREIGHT' && (
                      <>
                        <div className="divider"></div>
                        <div className="air-freight-section">
                          <h3>Air Freight Details</h3>
                          <div className="summary-grid">
                            <div className="summary-row">
                              <span className="label">MTD Registration No.:</span>
                              <span className="value">{formData.mtdRegistrationNo}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Airport of Departure:</span>
                              <span className="value">{formData.airport_of_departure}</span>
                              <span className="label">Airport of Destination:</span>
                              <span className="value">{formData.airport_of_destination}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">No of Packages:</span>
                              <span className="value">{formData.no_of_packages}</span>
                              <span className="label">Dimension (CMS):</span>
                              <span className="value">{formData.dimension_cms}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Chargeable Weight:</span>
                              <span className="value">{formData.chargeable_weight}</span>
                              <span className="label">Client No:</span>
                              <span className="value">{formData.client_no}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Name of Airline:</span>
                              <span className="value">{formData.name_of_airline}</span>
                              <span className="label">AWB:</span>
                              <span className="value">{formData.awb}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Flight From:</span>
                              <span className="value">{formData.flight_from}</span>
                              <span className="label">Flight To:</span>
                              <span className="value">{formData.flight_to}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Flight ETA:</span>
                              <span className="value">{formData.flight_eta}</span>
                              <span className="label">Invoice No:</span>
                              <span className="value">{formData.invoiceNo}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Invoice Date:</span>
                              <span className="value">{formData.invoiceDate}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {shipmentType === 'TRANSPORT' && (
                      <>
                        <div className="divider"></div>
                        <div className="land-freight-section">
                          <h3>Land Freight Details</h3>
                          <div className="summary-grid">
                            <div className="summary-row">
                              <span className="label">MTD Registration No.:</span>
                              <span className="value">{formData.mtdRegistrationNo}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">LCL/FCL:</span>
                              <span className="value">{formData.lclFcl}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {shipmentType === 'SEA FREIGHT' && (
                      <>
                        <div className="divider"></div>
                        <div className="sea-freight-section">
                          <h3>Sea Freight Details</h3>
                          <div className="summary-grid">
                            <div className="summary-row">
                              <span className="label">MTD Registration No.:</span>
                              <span className="value">{formData.mtdRegistrationNo}</span>
                            </div>
                            {formData.tradeDirection === 'EXPORT' && (
                              <div className="summary-row">
                                <span className="label">Exporter:</span>
                                <span className="value">{formData.exporter}</span>
                              </div>
                            )}
                            {formData.tradeDirection === 'IMPORT' && (
                              <div className="summary-row">
                                <span className="label">Importer:</span>
                                <span className="value">{formData.importer}</span>
                              </div>
                            )}
                            <div className="summary-row">
                              <span className="label">Invoice No:</span>
                              <span className="value">{formData.invoiceNo}</span>
                              <span className="label">Invoice Date:</span>
                              <span className="value">{formData.invoiceDate}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Stuffing Date:</span>
                              <span className="value">{formData.stuffingDate}</span>
                              <span className="label">H/O Date:</span>
                              <span className="value">{formData.hoDate}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Terms:</span>
                              <span className="value">{formData.terms}</span>
                              {formData.tradeDirection === 'EXPORT' ? (
                                <>
                                  <span className="label">S/B No:</span>
                                  <span className="value">{formData.sbNo}</span>
                                </>
                              ) : (
                                <>
                                  <span className="label">BOE:</span>
                                  <span className="value">{formData.boeNo}</span>
                                </>
                              )}
                            </div>
                            <div className="summary-row">
                              {formData.tradeDirection === 'EXPORT' ? (
                                <>
                                  <span className="label">S/B Date:</span>
                                  <span className="value">{formData.sbDate}</span>
                                </>
                              ) : (
                                <>
                                  <span className="label">BOE Date:</span>
                                  <span className="value">{formData.boeDate}</span>
                                </>
                              )}
                              <span className="label">Destination:</span>
                              <span className="value">{formData.destination}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Commodity:</span>
                              <span className="value">{formData.commodity}</span>
                              <span className="label">FOB:</span>
                              <span className="value">{formData.fob}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">GR Weight:</span>
                              <span className="value">{formData.grWeight}</span>
                              <span className="label">Net Weight:</span>
                              <span className="value">{formData.netWeight}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">RAIL Out Date:</span>
                              <span className="value">{formData.railOutDate}</span>
                              <span className="label">Container No:</span>
                              <span className="value">{formData.containerNo}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">No of CNTR:</span>
                              <span className="value">{formData.noOfCntr}</span>
                              <span className="label">S/Line:</span>
                              <span className="value">{formData.sLine}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">MBL No:</span>
                              <span className="value">{formData.mblNo}</span>
                              <span className="label">MBL Date:</span>
                              <span className="value">{formData.mblDate}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">HBL DT:</span>
                              <span className="value">{formData.hblDt}</span>
                              <span className="label">VESSEL:</span>
                              <span className="value">{formData.vessel}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">VOY:</span>
                              <span className="value">{formData.voy}</span>
                              <span className="label">SOB:</span>
                              <span className="value">{formData.sob}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">A/C:</span>
                              <span className="value">{formData.ac}</span>
                              <span className="label">Bill No:</span>
                              <span className="value">{formData.billNo}</span>
                            </div>
                            <div className="summary-row">
                              <span className="label">Bill Date:</span>
                              <span className="value">{formData.billDate}</span>
                              <span className="label">C/C Port:</span>
                              <span className="value">{formData.ccPort}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {formData.pod_documents && formData.pod_documents.length > 0 && (
                      <div className="pod-summary-alert" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div className="pod-summary-alert-header">
                          <FileText size={18} /> Proof of Delivery (POD) attached ({formData.pod_documents.length} files)
                        </div>
                        {formData.jobNo && <div className="pod-summary-alert-note">Carried over from Job #{formData.jobNo}</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
                          {formData.pod_documents.map((doc, idx) => (
                            <a 
                              key={idx}
                              href={getFileUrl(doc.path, 'pod-attachments')} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#166534', textDecoration: 'underline' }}
                            >
                              <ExternalLink size={14} /> {doc.name || `Document ${idx + 1}`}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="confirmation-checkboxes">
                      <div className="checkbox-item">
                        <input type="checkbox" id="confirm1" required />
                        <label htmlFor="confirm1">I confirm the accuracy of all information</label>
                      </div>
                      <div className="checkbox-item">
                        <input type="checkbox" id="confirm2" required />
                        <label htmlFor="confirm2">I agree to the terms and conditions</label>
                      </div>
                      <div className="checkbox-item">
                        <input type="checkbox" id="confirm3" required />
                        <label htmlFor="confirm3">I authorize this shipment</label>
                      </div>
                    </div>

                    <div className="confirmation-prompt">
                      <p>Are you sure you want to {editingShipment ? 'update' : 'create'} the shipment?</p>
                      <div className="confirmation-buttons">
                        <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
                        <button className="confirm-btn" onClick={handleConfirmShipment}>
                          {editingShipment ? 'Update' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="navigation-buttons" style={{ borderTop: '1px solid var(--border)' }}>
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
                    <button className="confirm-button" onClick={handleConfirmShipment}>
                      {editingShipment ? 'Update Shipment' : 'Confirm & Create Shipment'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

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
                      <div className="org-form-group">
                        <label>Name</label>
                        <input 
                          type="text" 
                          name="name"
                          value={orgFormData.name}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Record Status</label>
                        <select 
                          name="recordStatus"
                          value={orgFormData.recordStatus}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      
                      <div className="org-form-group">
                        <label>Sales person</label>
                        <input 
                          type="text" 
                          name="salesPerson"
                          value={orgFormData.salesPerson}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Category List</label>
                        <select 
                          name="category"
                          value={orgFormData.category}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        >
                          {CATEGORIES.map((category, index) => (
                            <option key={index} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="org-form-group">
                        <label>Branch</label>
                        <input 
                          type="text" 
                          name="branch"
                          value={orgFormData.branch}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Contact Person</label>
                        <input 
                          type="text" 
                          name="contactPerson"
                          value={orgFormData.contactPerson}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Door No</label>
                        <input 
                          type="text" 
                          name="doorNo"
                          value={orgFormData.doorNo}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Building Name</label>
                        <input 
                          type="text" 
                          name="buildingName"
                          value={orgFormData.buildingName}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Street</label>
                        <input 
                          type="text" 
                          name="street"
                          value={orgFormData.street}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Area</label>
                        <input 
                          type="text" 
                          name="area"
                          value={orgFormData.area}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>City</label>
                        <input 
                          type="text" 
                          name="city"
                          value={orgFormData.city}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>State</label>
                        <input 
                          type="text" 
                          name="state"
                          value={orgFormData.state}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
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
              <p>Are you sure you want to delete shipment #{shipmentToDelete?.shipmentNo}?</p>
              <p>This action cannot be undone.</p>
              {shipmentToDelete && (shipmentToDelete.created_by || shipmentToDelete.updated_by) && (
                <div className="delete-author-info" style={{marginTop: '15px', padding: '10px', background: 'var(--bg-surface-2)', borderRadius: '6px', fontSize: '0.85rem'}}>
                  <strong>Author Information:</strong>
                  <div style={{marginTop: '5px'}}>
                    {shipmentToDelete.created_by && <div>Created by: {shipmentToDelete.created_by}</div>}
                    {shipmentToDelete.updated_by && <div>Last edited by: {shipmentToDelete.updated_by}</div>}
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
                onClick={handleDeleteShipment}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};



const GlobalShipmentForm = () => {
  const [forms, setForms] = useState(() => {
    const saved = sessionStorage.getItem('shipment_forms_v1');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('shipment_forms_v1', JSON.stringify(forms));
  }, [forms]);

  useEffect(() => {
    const handleOpenGlobalForm = (e) => {
      const shipmentToEdit = e.detail;

      const newFormId = shipmentToEdit ? `edit-${shipmentToEdit.id}` : `new-${Date.now()}`;

      setForms(prev => {
        const existingForm = prev.find(f => f.id === newFormId);
        if (existingForm) {
          return prev.map(f => f.id === newFormId ? { ...f, isMinimized: false } : { ...f, isMinimized: true });
        }

        const newForm = {
          id: newFormId,
          isMinimized: false,
          initialState: shipmentToEdit ? {
            editingShipment: shipmentToEdit,
            shipmentType: shipmentToEdit.shipment_type || '',
            formData: shipmentToEdit._formData || { ...INITIAL_FORM_DATA, ...shipmentToEdit },
            activeStep: 2,
          } : {
            editingShipment: null,
            shipmentType: '',
            formData: { ...INITIAL_FORM_DATA },
            activeStep: 1,
          }
        };

        return [...prev.map(f => ({ ...f, isMinimized: true })), newForm];
      });
    };

    window.addEventListener('open_global_shipment_form', handleOpenGlobalForm);
    return () => window.removeEventListener('open_global_shipment_form', handleOpenGlobalForm);
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
        <ShipmentFormWindow
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
            <ShipmentFormWindow
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
            <ShipmentFormWindow
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

export default GlobalShipmentForm;
