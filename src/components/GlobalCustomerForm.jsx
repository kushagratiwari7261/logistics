import React, { useState, useEffect, useCallback } from "react";
import { Minus, X, Maximize2 } from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from '../lib/supabaseClient';
import './CustomerManagement.css';

const INITIAL_FORM_DATA = {
  vendorName: "", country: "", address1: "", address2: "", city: "", state: "", postalCode: "",
  contactPerson: "", telephone: "", mobile: "", email: "", bankAccountNumber: "", beneficiaryAccountName: "",
  bankName: "", bankAddress: "", bankBranchState: "", bankBranchName: "", bankMicrCode: "", bankRtgsIfscCode: "",
  accountType: "", currency: "", panNumber: "", tanNumber: "", gstNumber: "", gstinDivision: "",
  hsnCode: "", vendorType: "", gstNotApplicableReason: "", msmeVendor: "", msmeCertificationDate: "",
  msmeRegNo: "", vendor_no: "", declaration: false
};

const CustomerFormWindow = ({ formConfig, onClose, onMinimize, onRestore }) => {
  const { id, partnerType, editingCustomer, isMinimized } = formConfig;
  const displayType = partnerType.charAt(0).toUpperCase() + partnerType.slice(1);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);

  const [files, setFiles] = useState({
    excelFile: null, pdfFile: null, panScan: null, cancelledCheque: null, gstRegistration: null, msmeCertificate: null
  });

  const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA });

  useEffect(() => {
    if (editingCustomer) {
      setFormData(editingCustomer);
      fetchCustomerFiles(editingCustomer.id);
    }
    fetchCountries();
  }, [editingCustomer]);

  useEffect(() => {
    if (formData.country) {
      fetchStates(formData.country);
    }
  }, [formData.country]);

  const fetchCountries = async () => {
    try {
      const response = await fetch("https://restcountries.com/v3.1/all?fields=name");
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid response format');
      const sortedCountries = data
        .map(country => country.name?.common)
        .filter(Boolean)
        .sort();
      setCountries(sortedCountries);
    } catch (error) {
      console.error("Error fetching countries, using fallback list:", error);
      // Fallback list of common countries
      setCountries([
        "Afghanistan", "Argentina", "Australia", "Bangladesh", "Belgium", "Brazil",
        "Canada", "China", "Denmark", "Egypt", "Finland", "France", "Germany",
        "Greece", "Hong Kong", "India", "Indonesia", "Iran", "Iraq", "Ireland",
        "Israel", "Italy", "Japan", "Kenya", "Kuwait", "Malaysia", "Mexico",
        "Nepal", "Netherlands", "New Zealand", "Nigeria", "Norway", "Oman",
        "Pakistan", "Philippines", "Poland", "Portugal", "Qatar", "Russia",
        "Saudi Arabia", "Singapore", "South Africa", "South Korea", "Spain",
        "Sri Lanka", "Sweden", "Switzerland", "Taiwan", "Thailand", "Turkey",
        "United Arab Emirates", "United Kingdom", "United States", "Vietnam"
      ]);
    }
  };
  const fetchStates = async (country) => {
    try {
      const sampleStates = [
        "State 1", "State 2", "State 3", "State 4", "State 5"
      ];
      setStates(sampleStates);
    } catch (error) {
      console.error("Error fetching states:", error);
    }
  };
  const fetchCustomerFiles = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_files')
        .select('*')
        .eq('vendor_id', customerId);

      if (error) throw error;

      if (data && data.length > 0) {
        const fileData = data[0];
        setFiles({
          excelFile: fileData.excel_file ? { name: 'Excel File', url: fileData.excel_file } : null,
          pdfFile: fileData.pdf_file ? { name: 'PDF File', url: fileData.pdf_file } : null,
          panScan: fileData.pan_scan ? { name: 'PAN Scan', url: fileData.pan_scan } : null,
          cancelledCheque: fileData.cancelled_cheque ? { name: 'Cancelled Cheque', url: fileData.cancelled_cheque } : null,
          gstRegistration: fileData.gst_registration ? { name: 'GST Registration', url: fileData.gst_registration } : null,
          msmeCertificate: fileData.msme_certificate ? { name: 'MSME Certificate', url: fileData.msme_certificate } : null
        });
      }
    } catch (error) {
      console.error("Error fetching customer files:", error);
    }
  };
  const handleFileUpload = async (file, fileType, customerId) => {
    try {
      setUploading(true);
      setUploadProgress(prev => ({ ...prev, [fileType]: 0 }));


      // Generate a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${fileType}_${customerId || 'new'}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `vendor-documents/${fileName}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('vendor-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('vendor-files')
        .getPublicUrl(filePath);

      // Update files state
      setFiles(prev => ({ ...prev, [fileType]: { name: file.name, url: publicUrl, path: filePath } }));

      // If we're editing an existing customer, update the database
      if (customerId) {
        await updateFileRecord(fileType, publicUrl, filePath, customerId);
      }

    } catch (error) {
      console.error(`Error uploading ${fileType}:`, error);
      alert(`Error uploading file: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(prev => ({ ...prev, [fileType]: null }));
    }
  };
  const updateFileRecord = async (fileType, url, path, customerId) => {
    try {
      // Map fileType to correct column names
      const columnMap = {
        excelFile: { url: 'excel_file', path: 'excel_path' },
        pdfFile: { url: 'pdf_file', path: 'pdf_path' },
        panScan: { url: 'pan_scan', path: 'pan_path' },
        cancelledCheque: { url: 'cancelled_cheque', path: 'cheque_path' },
        gstRegistration: { url: 'gst_registration', path: 'gst_path' },
        msmeCertificate: { url: 'msme_certificate', path: 'msme_path' }
      };

      const columnNames = columnMap[fileType];

      if (!columnNames) {
        throw new Error(`Unknown file type: ${fileType}`);
      }

      // Check if record exists
      const { data: existingRecord } = await supabase
        .from('vendor_files')
        .select('id')
        .eq('vendor_id', customerId)
        .single();

      const updateData = {
        [columnNames.url]: url,
        [columnNames.path]: path
      };

      if (existingRecord) {
        // Update existing record
        const { error } = await supabase
          .from('vendor_files')
          .update(updateData)
          .eq('vendor_id', customerId);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from('vendor_files')
          .insert([{
            vendor_id: customerId,
            ...updateData
          }]);

        if (error) throw error;
      }
    } catch (error) {
      console.error("Error updating file record:", error);
    }
  };
  const handleFileRemove = async (fileType, customerId) => {
    try {
      // First check if we have a file to remove
      if (files[fileType]?.path) {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('vendor-files')
          .remove([files[fileType].path]);

        if (storageError) throw storageError;

        // Update database if customer exists
        if (customerId) {
          // Map fileType to correct column names
          const columnMap = {
            excelFile: { url: 'excel_file', path: 'excel_path' },
            pdfFile: { url: 'pdf_file', path: 'pdf_path' },
            panScan: { url: 'pan_scan', path: 'pan_path' },
            cancelledCheque: { url: 'cancelled_cheque', path: 'cheque_path' },
            gstRegistration: { url: 'gst_registration', path: 'gst_path' },
            msmeCertificate: { url: 'msme_certificate', path: 'msme_path' }
          };

          const columnNames = columnMap[fileType];

          if (columnNames) {
            const { error: dbError } = await supabase
              .from('vendor_files')
              .update({
                [columnNames.url]: null,
                [columnNames.path]: null
              })
              .eq('vendor_id', customerId);

            if (dbError) throw dbError;
          }
        }

        // Update local state
        setFiles(prev => ({
          ...prev,
          [fileType]: null
        }));

        // Show success message
        alert(`${fileType} removed successfully`);
      } else {
        // If no file path, just remove from local state
        setFiles(prev => ({
          ...prev,
          [fileType]: null
        }));
      }
    } catch (error) {
      console.error(`Error removing ${fileType}:`, error);
      alert(`Error removing file: ${error.message}`);
    }
  };
  const generatePartnerCode = async (cityName) => {
    try {
      const cleanCity = cityName.trim().replace(/[^a-zA-Z]/g, '');
      if (cleanCity.length < 3) return;

      const prefix = cleanCity.substring(0, 3).toUpperCase();

      // Fetch existing counts for this prefix
      const { data, error } = await supabase
        .from('vendors')
        .select('vendor_no')
        .ilike('vendor_no', `${prefix}%`)
        .order('vendor_no', { ascending: false });

      if (error) throw error;

      let nextSerial = 1;
      if (data && data.length > 0) {
        // Find the highest serial number for this prefix
        const serials = data
          .map(v => {
            const match = v.vendor_no ? v.vendor_no.match(/\d+$/) : null;
            return match ? parseInt(match[0]) : 0;
          })
          .filter(n => !isNaN(n));

        if (serials.length > 0) {
          nextSerial = Math.max(...serials) + 1;
        }
      }

      setFormData(prev => ({
        ...prev,
        vendor_no: `${prefix}${nextSerial}`
      }));
    } catch (err) {
      console.error("Error generating partner code:", err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));

    if (name === "city" && value && value.trim().length >= 3 && !editingCustomer) {
      generatePartnerCode(value);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // Convert empty strings to null for date fields
    const processedData = {
      ...formData,
      msmeCertificationDate: formData.msmeCertificationDate || null
    };

    try {
      let customerId;
      let userEmail = 'Unknown';
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userEmail = user.email;
        }
      } catch (err) {
        console.warn('Could not fetch user for audit trail', err);
      }

      // Add created_by to the payload
      processedData.created_by = userEmail;

      if (editingCustomer) {
        // Update existing partner
        const { data, error } = await supabase
          .from('vendors')
          .update({ ...processedData, partner_type: partnerType })
          .eq('id', editingCustomer.id)
          .select();

        if (error) throw error;
        customerId = editingCustomer.id;
      } else {
        // Insert new partner
        const { data, error } = await supabase
          .from('vendors')
          .insert([{ ...processedData, partner_type: partnerType }])
          .select();

        if (error) throw error;
        customerId = data[0].id;
      }

      // Process file records for the customer
      if (customerId) {
        // Create or update file record with vendor ID
        const fileRecord = {
          vendor_id: customerId,
          excel_file: files.excelFile?.url || null,
          excel_path: files.excelFile?.path || null,
          pdf_file: files.pdfFile?.url || null,
          pdf_path: files.pdfFile?.path || null,
          pan_scan: files.panScan?.url || null,
          pan_path: files.panScan?.path || null,
          cancelled_cheque: files.cancelledCheque?.url || null,
          cheque_path: files.cancelledCheque?.path || null,
          gst_registration: files.gstRegistration?.url || null,
          gst_path: files.gstRegistration?.path || null,
          msme_certificate: files.msmeCertificate?.url || null,
          msme_path: files.msmeCertificate?.path || null
        };

        // Check if record exists
        const { data: existingRecord } = await supabase
          .from('vendor_files')
          .select('id')
          .eq('vendor_id', customerId)
          .single();

        if (existingRecord) {
          // Update existing record
          const { error } = await supabase
            .from('vendor_files')
            .update(fileRecord)
            .eq('vendor_id', customerId);

          if (error) throw error;
        } else {
          // Create new record
          const { error } = await supabase
            .from('vendor_files')
            .insert([fileRecord]);

          if (error) throw error;
        }
      }

      // Reset form and close modal
      setFormData({
        vendorName: "",
        country: "",
        address1: "",
        address2: "",
        city: "",
        state: "",
        postalCode: "",
        contactPerson: "",
        telephone: "",
        mobile: "",
        email: "",
        bankAccountNumber: "",
        beneficiaryAccountName: "",
        bankName: "",
        bankAddress: "",
        bankBranchState: "",
        bankBranchName: "",
        bankMicrCode: "",
        bankRtgsIfscCode: "",
        accountType: "",
        currency: "",
        panNumber: "",
        tanNumber: "",
        gstNumber: "",
        gstinDivision: "",
        hsnCode: "",
        vendorType: "",
        gstNotApplicableReason: "",
        msmeVendor: "",
        msmeCertificationDate: "",
        msmeRegNo: "",
        declaration: false
      });

      setFiles({
        excelFile: null,
        pdfFile: null,
        panScan: null,
        cancelledCheque: null,
        gstRegistration: null,
        msmeCertificate: null
      });




      // Refresh the list
      window.dispatchEvent(new Event('refresh_customer_list')); onClose(id);
    } catch (error) {
      console.error(`Error saving ${partnerType}:`, error);
      setError(error.message);
    }
  };

  const FileUploadField = ({ label, fileType, required = false }) => (
    <div className="form-group">
      <label>{label} {required && '*'}</label>
      <div className="file-upload-container">
        {files[fileType] ? (
          <div className="file-preview">
            <span className="file-name">{files[fileType].name}</span>
            <div className="file-actions">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => window.open(files[fileType].url, '_blank')}
              >
                View
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => handleFileRemove(fileType, editingCustomer?.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="file-input-wrapper">
            <input
              type="file"
              id={fileType}
              onChange={(e) => {
                if (e.target.files.length > 0) {
                  handleFileUpload(
                    e.target.files[0],
                    fileType,
                    editingCustomer?.id
                  );
                }
              }}
              disabled={uploading}
            />
            <label htmlFor={fileType} className="file-input-label">
              Choose File
            </label>
          </div>
        )}
        {uploadProgress[fileType] !== undefined && uploadProgress[fileType] !== null && (
          <div className="upload-progress">
            <div
              className="progress-bar"
              style={{ width: `${uploadProgress[fileType]}%` }}
            ></div>
            <span className="progress-text">{uploadProgress[fileType]}%</span>
          </div>
        )}
      </div>
    </div>
  );

  if (isMinimized) {
                    return (
                      <div className="minimized-job-bar" onClick={() => onRestore(id)}>
                        <div className="minimized-job-content">
                          <span className="minimized-job-title">
                            {editingCustomer ? `Editing ${displayType}` : `Creating ${displayType}`} - {formData.vendorName || 'Draft'}
                          </span>
                          <div className="minimized-actions">
                            <button type="button" className="window-btn" title="Restore"><Maximize2 size={14} /></button>
                            <button
                              type="button"
                              className="window-btn close-btn"
                              onClick={(e) => { e.stopPropagation(); onClose(id); }}
                              title="Close"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
<div className="modal-overlay">
                      <div className="modal large-modal" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                          <h2 style={{ margin: 0 }}>{editingCustomer ? `Edit ${displayType}` : `Add New ${displayType}`}</h2>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => onMinimize(id)}
                              title="Minimize"
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
                            >
                              <Minus size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onClose(id)}
                              title="Close"
                              style={{ background: '#e74c3c', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center' }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
<form onSubmit={handleSave} className="vendor-form">
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>{displayType} Name *</label>
                    <input
                      name="vendorName"
                      value={formData.vendorName}
                      onChange={handleInputChange}
                      placeholder={`${displayType} Name`}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>{displayType} Number</label>
                    <input
                      name="vendor_no"
                      value={formData.vendor_no}
                      onChange={handleInputChange}
                      placeholder="Auto-generated from city"
                      readOnly={!!editingCustomer}
                    />
                  </div>
                  <div className="form-group">
                    <label>Country *</label>
                    <input
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      placeholder="country"
                    >

                    </input>
                  </div>
                </div>

                <div className="form-group">
                  <label>Address Line 1 *</label>
                  <input
                    name="address1"
                    value={formData.address1}
                    onChange={handleInputChange}
                    placeholder="Address Line 1"

                  />
                </div>

                <div className="form-group">
                  <label>Address Line 2</label>
                  <input
                    name="address2"
                    value={formData.address2}
                    onChange={handleInputChange}
                    placeholder="Address Line 2"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>City *</label>
                    <input
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="City"

                    />
                  </div>
                  <div className="form-group">
                    <label>State *</label>
                    <input
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="state"
                    >

                    </input>
                  </div>
                  <div className="form-group">
                    <label>Postal Code *</label>
                    <input
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      placeholder="Postal Code"

                    />
                  </div>
                </div>
              </div>


              <div className="form-section">
                <h3>Contact Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Contact Person *</label>
                    <input
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleInputChange}
                      placeholder="Contact Person"

                    />
                  </div>
                  <div className="form-group">
                    <label>Telephone (with STD Code)</label>
                    <input
                      name="telephone"
                      value={formData.telephone}
                      onChange={handleInputChange}
                      placeholder="Telephone"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="Mobile Number"

                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address *</label>
                    <input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="Email Address"

                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Bank Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Account Number *</label>
                    <input
                      name="bankAccountNumber"
                      value={formData.bankAccountNumber}
                      onChange={handleInputChange}
                      placeholder="Bank Account Number"

                    />
                  </div>
                  <div className="form-group">
                    <label>Beneficiary Account Name *</label>
                    <input
                      name="beneficiaryAccountName"
                      value={formData.beneficiaryAccountName}
                      onChange={handleInputChange}
                      placeholder="Beneficiary Account Name"

                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Name *</label>
                    <input
                      name="bankName"
                      value={formData.bankName}
                      onChange={handleInputChange}
                      placeholder="Bank Name"

                    />
                  </div>
                  <div className="form-group">
                    <label>Bank Branch Name *</label>
                    <input
                      name="bankBranchName"
                      value={formData.bankBranchName}
                      onChange={handleInputChange}
                      placeholder="Bank Branch Name"

                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Bank Address *</label>
                  <input
                    name="bankAddress"
                    value={formData.bankAddress}
                    onChange={handleInputChange}
                    placeholder="Bank Address"

                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Bank Branch State *</label>
                    <input
                      name="bankBranchState"
                      value={formData.bankBranchState}
                      onChange={handleInputChange}
                      placeholder="Bank Branch State"

                    />
                  </div>
                  <div className="form-group">
                    <label>Bank MICR Code</label>
                    <input
                      name="bankMicrCode"
                      value={formData.bankMicrCode}
                      onChange={handleInputChange}
                      placeholder="Bank MICR Code"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Bank RTGS/IFSC Code *</label>
                    <input
                      name="bankRtgsIfscCode"
                      value={formData.bankRtgsIfscCode}
                      onChange={handleInputChange}
                      placeholder="Bank RTGS/IFSC Code"

                    />
                  </div>
                  <div className="form-group">
                    <label>Account Type *</label>
                    <select
                      name="accountType"
                      value={formData.accountType}
                      onChange={handleInputChange}

                    >
                      <option value="">Select Account Type</option>
                      <option value="savings">Savings</option>
                      <option value="current">Current</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Currency *</label>
                    <select
                      name="currency"
                      value={formData.currency}
                      onChange={handleInputChange}

                    >
                      <option value="">Select Currency</option>
                      <option value="INR">Indian Rupee (INR)</option>
                      <option value="USD">US Dollar (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                      <option value="GBP">British Pound (GBP)</option>
                      <option value="AED">United Arab Emirates Dirham(AED)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Tax Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>PAN Number *</label>
                    <input
                      name="panNumber"
                      value={formData.panNumber}
                      onChange={handleInputChange}
                      placeholder="PAN Number"

                    />
                  </div>
                  <div className="form-group">
                    <label>TAN Number</label>
                    <input
                      name="tanNumber"
                      value={formData.tanNumber}
                      onChange={handleInputChange}
                      placeholder="TAN Number"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>GST Number</label>
                    <input
                      name="gstNumber"
                      value={formData.gstNumber}
                      onChange={handleInputChange}
                      placeholder="GST Number"
                    />
                  </div>
                  <div className="form-group">
                    <label>GSTIN Division/Ward/Circle/Sector Number</label>
                    <input
                      name="gstinDivision"
                      value={formData.gstinDivision}
                      onChange={handleInputChange}
                      placeholder="GSTIN Division/Ward/Circle/Sector Number"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>HSN Code *</label>
                  <input
                    name="hsnCode"
                    value={formData.hsnCode}
                    onChange={handleInputChange}
                    placeholder="HSN Code"

                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Vendor Type *</label>
                    <select
                      name="vendorType"
                      value={formData.vendorType}
                      onChange={handleInputChange}

                    >
                      <option value="">Select Vendor Type</option>
                      <option value="manufacturer">Manufacturer</option>
                      <option value="trader">Trader</option>
                      <option value="consultant">Consultant</option>
                      <option value="serviceProvider">Service Provider</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>If GSTIN not applicable, reason for the same</label>
                    <input
                      name="gstNotApplicableReason"
                      value={formData.gstNotApplicableReason}
                      onChange={handleInputChange}
                      placeholder="Reason for GSTIN not applicable"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>MSME Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>MSME Vendor (small/micro, excluding trader)</label>
                    <select
                      name="msmeVendor"
                      value={formData.msmeVendor}
                      onChange={handleInputChange}
                    >
                      <option value="">Select MSME Status</option>
                      <option value="small">Small</option>
                      <option value="micro">Micro</option>
                      <option value="notApplicable">Not Applicable</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>MSME Certification Date</label>
                    <input
                      name="msmeCertificationDate"
                      type="date"
                      value={formData.msmeCertificationDate}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>MSME Registration Number</label>
                  <input
                    name="msmeRegNo"
                    value={formData.msmeRegNo}
                    onChange={handleInputChange}
                    placeholder="MSME Registration Number"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Declaration</h3>
                <div className="form-group declaration-checkbox">
                  <label>
                    <input
                      name="declaration"
                      type="checkbox"
                      checked={formData.declaration}
                      onChange={handleInputChange}

                    />
                    We hereby certify that above mentioned details are correct. We further confirm that the said details can be used by SUNEX International Forwarders Pvt. Ltd. for online remittance of funds. The responsibility of any delay in payment and additional processing charges due to incorrect details vest with us.
                  </label>
                </div>

                <div className="notes">
                  <p><strong>Note:</strong></p>
                  <ol>
                    <li>Please provide Soft Copy (Excel & PDF (With Sign and seal) Both format).</li>
                    <li>Please provide PAN Scan PDF Copy.</li>
                    <li>Cancelled Cheque PDF Copy.</li>
                    <li>GST Registration PDF Copy.</li>
                    <li>SSI/ MSMED Certificate PDF Copy if applicable.</li>
                  </ol>
                </div>
              </div>


              <div className="form-section">
                <h3>Required Documents</h3>

                <FileUploadField
                  label="Soft Copy (Excel Format)"
                  fileType="excelFile"
                />

                <FileUploadField
                  label="Soft Copy (PDF Format with Sign and Seal)"
                  fileType="pdfFile"
                />

                <FileUploadField
                  label="PAN Scan PDF Copy"
                  fileType="panScan"
                />

                <FileUploadField
                  label="Cancelled Cheque PDF Copy"
                  fileType="cancelledCheque"
                />

                <FileUploadField
                  label="GST Registration PDF Copy"
                  fileType="gstRegistration"
                />

                <FileUploadField
                  label="SSI/MSMED Certificate PDF Copy (if applicable)"
                  fileType="msmeCertificate"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => onClose(id)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={uploading}
                >
                  {editingCustomer ? "Update Vendor" : "Save Vendor"}
                </button>
              </div>
            </form>
                        </div>
                      </div>
                    </div>
  );
};

const GlobalCustomerForm = () => {
  const [forms, setForms] = useState([]);

  useEffect(() => {
    const handleOpenGlobalForm = (event) => {
      const {partnerType = 'customer', editingCustomer = null} = event.detail || { };
      
      setForms(prev => {
        if (editingCustomer) {
          const existingForm = prev.find(f => f.editingCustomer?.id === editingCustomer.id);
                        if (existingForm) {
            return prev.map(f => f.id === existingForm.id ? {...f, isMinimized: false } : {...f, isMinimized: true });
          }
        }

                        const newForm = {
                          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        partnerType,
                        editingCustomer,
                        isMinimized: false
        };

        return [...prev.map(f => ({...f, isMinimized: true })), newForm];
      });
    };

                        window.addEventListener('open_global_customer_form', handleOpenGlobalForm);
    return () => window.removeEventListener('open_global_customer_form', handleOpenGlobalForm);
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
                            <CustomerFormWindow
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
                                <CustomerFormWindow
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
                                <CustomerFormWindow
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

                        export default GlobalCustomerForm;
