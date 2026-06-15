import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { UserPlus, Clock, FileSpreadsheet } from 'lucide-react';

// default headers requested by user
const defaultHeaders = [
  "Billing Location", "GST Number", "From", "Qty", "To", "Eway bill DATE",
  "Eway Bill No", "Invoice Date", "Invoice no.", "Taxable Amt", "GST", "Total Amt",
  "Billing", "TOTAL VEHICLE BUYING", "Other Charges/Own Expenses", "Transporter name",
  "LR.NO.", "LR. DATE", "Vehicle.no.", "vehicle type", "DISTANCE IN KM",
  "Driver no.", "Reporting date", "Delivery date", "Delay Remark", "Det.",
  "Author who created this dsr"
];

const generateDefaultSheet = (authorEmail = '') => {
  const celldata = defaultHeaders.map((header, index) => ({
    r: 0,
    c: index,
    v: {
      v: header,
      m: header,
      bl: 1, // bold
      bg: "#FFFF00", // Yellow background
    }
  }));

  if (authorEmail) {
    celldata.push({
      r: 1,
      c: 26, // Index of "Author who created this dsr"
      v: {
        v: authorEmail,
        m: authorEmail
      }
    });
  }

  return [{
    name: "Sheet1",
    id: "sheet_01",
    status: 1, // active sheet
    celldata: celldata,
    calcChain: [],
    order: 1
  }];
};

// Helper function to ensure first row is always yellow with bold
const enforceYellowFirstRow = (celldata) => {
  if (!Array.isArray(celldata)) return celldata;

  return celldata.map(cell => {
    if (cell.r === 0 && cell.v) {
      return {
        ...cell,
        v: {
          ...cell.v,
          bg: "#FFFF00",
          bl: 1
        }
      };
    }
    return cell;
  });
};

export default function DSRPage() {
  const [workbooks, setWorkbooks] = useState([]);
  const [activeWorkbook, setActiveWorkbook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workbookData, setWorkbookData] = useState([]);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [emailDialog, setEmailDialog] = useState(false);
  const [selectedSheetsForEmail, setSelectedSheetsForEmail] = useState([]);
  const [emailConfig, setEmailConfig] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: 'DSR Update from Seal Freight',
    body: 'Please find the attached DSR update sheet.'
  });
  const [sendingEmail, setSendingEmail] = useState(false);
  const workbookDataRef = useRef([]);
  const workbookRef = useRef(null);
  const saveTimerRef = useRef(null);
  const activeWorkbookRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);

  // Sync ref when workbookData changes
  useEffect(() => {
    if (workbookData && workbookData.length > 0) {
      workbookDataRef.current = JSON.parse(JSON.stringify(workbookData));
    }
  }, [workbookData]);

  useEffect(() => {
    activeWorkbookRef.current = activeWorkbook;
  }, [activeWorkbook]);

  useEffect(() => {
    fetchWorkbooks();

    if (activeWorkbook) {
      saveTimerRef.current = setInterval(() => {
        console.log('Auto-saving (interval)...');
        saveActiveWorkbook(true);
      }, 300000); // 5 minutes
    }

    return () => {
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current);
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [activeWorkbook]);

  const fetchWorkbooks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('dsr_workbooks')
        .select('id, name, created_at, updated_at, created_by')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          console.warn("Table dsr_workbooks doesn't exist yet.");
        } else {
          throw error;
        }
      } else {
        setWorkbooks(data || []);
      }
    } catch (err) {
      console.error('Error fetching workbooks:', err);
    } finally {
      setLoading(false);
    }
  };

  const createWorkbook = async () => {
    const newId = uuidv4();
    const newName = `DSR - ${new Date().toLocaleDateString()}`;

    const { data: { user } } = await supabase.auth.getUser();
    const createdBy = user ? user.email : 'Unknown';
    const currentTime = new Date().toISOString();

    const initialData = generateDefaultSheet(createdBy);

    try {
      setSaving(true);
      const { error } = await supabase
        .from('dsr_workbooks')
        .insert({
          id: newId,
          name: newName,
          workbook_data: initialData,
          created_by: createdBy,
          created_at: currentTime,
          updated_at: currentTime
        });

      if (error) {
        if (error.code === '42P01') {
          alert("The dsr_workbooks table does not exist. Please run the SQL migration script in your Supabase dashboard.");
          return;
        }
        throw error;
      }

      await fetchWorkbooks();
      openWorkbook(newId, newName, initialData);
    } catch (err) {
      console.error('Error creating workbook:', err);
      alert('Failed to create workbook: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openWorkbook = async (id, name, data = null) => {
    if (!data) {
      try {
        setLoading(true);
        const { data: fetchResult, error } = await supabase
          .from('dsr_workbooks')
          .select('workbook_data, created_at, updated_at')
          .eq('id', id)
          .single();

        if (error) throw error;
        data = fetchResult.workbook_data;

        setActiveWorkbook({
          id,
          name,
          created_at: fetchResult.created_at,
          updated_at: fetchResult.updated_at
        });
      } catch (err) {
        console.error('Error fetching workbook data:', err);
        alert('Failed to fetch workbook data.');
        setLoading(false);
        return;
      }
    }

    const validatedData = validateAndFixWorkbookData(data);

    console.log('Opening workbook with data:', validatedData);
    setWorkbookData(validatedData);
    setActiveSheetIndex(0);
    setLoading(false);
  };

  // Validate and fix workbook data structure - ALWAYS enforce yellow first row
  const validateAndFixWorkbookData = (data) => {
    if (!Array.isArray(data)) {
      console.warn('Workbook data is not an array, creating default sheet');
      return generateDefaultSheet();
    }

    return data.map((sheet, index) => {
      const validatedSheet = {
        name: sheet.name || `Sheet${index + 1}`,
        id: sheet.id || `sheet_${index + 1}`,
        status: sheet.status || (index === 0 ? 1 : 0),
        order: sheet.order || index + 1,
        celldata: [],
        calcChain: sheet.calcChain || []
      };

      // Prefer sheet.data (which represents latest edits) over celldata
      if (sheet.data && Array.isArray(sheet.data) && sheet.data.length > 0) {
        validatedSheet.celldata = [];
        sheet.data.forEach((row, rIdx) => {
          if (row && Array.isArray(row)) {
            row.forEach((cell, cIdx) => {
              if (cell && (cell.v !== null && cell.v !== undefined || cell.m !== null && cell.m !== undefined)) {
                validatedSheet.celldata.push({
                  r: rIdx,
                  c: cIdx,
                  v: {
                    v: cell.v !== undefined ? cell.v : cell,
                    m: cell.m !== undefined ? cell.m : cell,
                    // FORCE first row (r: 0) always has yellow background and bold (ONLY FOR FIRST SHEET)
                    ...(rIdx === 0 && index === 0 ? { bg: "#FFFF00", bl: 1 } : {})
                  }
                });
              }
            });
          }
        });
      } else if (sheet.celldata && Array.isArray(sheet.celldata)) {
        validatedSheet.celldata = sheet.celldata.map(cell => ({
          r: cell.r,
          c: cell.c,
          v: {
            ...(cell.v || { v: '', m: '' }),
            // FORCE first row (r: 0) always has yellow background and bold (ONLY FOR FIRST SHEET)
            ...(cell.r === 0 && index === 0 ? { bg: "#FFFF00", bl: 1 } : {})
          }
        }));
      }

      // Final safety check - enforce yellow on first row
      validatedSheet.celldata = enforceYellowFirstRow(validatedSheet.celldata);

      return validatedSheet;
    });
  };

  const saveActiveWorkbook = async (silent = false, customDataToSave = null) => {
    const currentActiveWb = activeWorkbookRef.current || activeWorkbook;
    if (!currentActiveWb) return;

    try {
      setSaving(true);

      let dataToSave = customDataToSave;
      
      if (!dataToSave) {
        dataToSave = workbookDataRef.current;
        if (workbookRef.current) {
          try {
            if (typeof workbookRef.current.getAllSheets === 'function') {
              dataToSave = workbookRef.current.getAllSheets();
            }
          } catch (err) {
            console.warn('Could not get sheets from FortuneSheet API:', err);
          }
        }
      }

      dataToSave = JSON.parse(JSON.stringify(dataToSave));

      // Validate and enforce yellow first row before saving
      dataToSave = validateAndFixWorkbookData(dataToSave);

      // Add metadata to sheets
      dataToSave = dataToSave.map((sheet, index) => ({
        ...sheet,
        order: sheet.order || index + 1,
        name: sheet.name || `Sheet${index + 1}`,
        lastModified: new Date().toISOString()
      }));

      const currentTime = new Date().toISOString();
      const { error } = await supabase
        .from('dsr_workbooks')
        .update({
          workbook_data: dataToSave,
          name: currentActiveWb.name,
          updated_at: currentTime
        })
        .eq('id', currentActiveWb.id);

      if (error) throw error;

      setLastSavedTime(new Date(currentTime));

      setActiveWorkbook(prev => ({
        ...prev,
        updated_at: currentTime
      }));

      if (!silent) {
        alert('Saved successfully!');
      }
    } catch (err) {
      console.error('Error saving workbook:', err);
      if (!silent) {
        alert('Failed to save: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const getLatestWorkbookData = () => {
    let latestData = workbookDataRef.current;
    if (workbookRef.current) {
      try {
        if (typeof workbookRef.current.getAllSheets === 'function') {
          latestData = workbookRef.current.getAllSheets();
        }
      } catch (err) {
        console.warn('Could not get sheets from FortuneSheet API:', err);
      }
    }
    return validateAndFixWorkbookData(JSON.parse(JSON.stringify(latestData)));
  };

  const addNewSheet = () => {
    if (!activeWorkbook) return;

    const latestData = getLatestWorkbookData();
    const newSheetIndex = latestData.length + 1;

    const newSheet = {
      name: `Sheet${newSheetIndex}`,
      id: `sheet_${uuidv4().substring(0, 8)}`,
      status: 1, // Set new sheet to active
      celldata: [], // Blank normal sheet without header row
      calcChain: [],
      order: newSheetIndex
    };

    const updatedData = latestData.map(s => ({ ...s, status: 0 }));
    const finalData = [...updatedData, newSheet];

    setWorkbookData(finalData);
    setActiveSheetIndex(finalData.length - 1);
    
    saveActiveWorkbook(true, finalData);
  };

  const switchSheet = (sheetIndex) => {
    const latestData = getLatestWorkbookData();
    const updatedData = latestData.map((sheet, index) => ({
      ...sheet,
      status: index === sheetIndex ? 1 : 0
    }));

    setWorkbookData(updatedData);
    setActiveSheetIndex(sheetIndex);
  };

  const closeWorkbook = () => {
    setActiveWorkbook(null);
    setWorkbookData([]);
    setActiveSheetIndex(0);
    fetchWorkbooks();
  };

  const deleteWorkbook = async (id) => {
    if (!window.confirm("Are you sure you want to delete this DSR?")) return;

    try {
      const { error } = await supabase
        .from('dsr_workbooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchWorkbooks();
    } catch (err) {
      console.error('Error deleting workbook:', err);
    }
  };

  const exportSheet = async (sheetIndex, returnBlob = false) => {
    let sheets = workbookDataRef.current;
    if (workbookRef.current && typeof workbookRef.current.getAllSheets === 'function') {
      try {
        sheets = workbookRef.current.getAllSheets();
      } catch (err) {
        console.warn('Could not get sheets for export:', err);
      }
    }
    const sheet = sheets[sheetIndex] || sheets[0];

    if (!sheet) return;

    const dataArray = [];
    if (sheet.data && Array.isArray(sheet.data) && sheet.data.length > 0) {
      sheet.data.forEach((row, rIdx) => {
        if (!row) return;
        dataArray[rIdx] = [];
        row.forEach((cell, cIdx) => {
          dataArray[rIdx][cIdx] = cell ? (cell.m !== undefined ? cell.m : cell.v) : "";
        });
      });
    } else if (sheet.celldata) {
      const cellMap = {};
      sheet.celldata.forEach(cell => {
        if (!cellMap[cell.r]) cellMap[cell.r] = {};
        cellMap[cell.r][cell.c] = cell.v ? (cell.v.m !== undefined ? cell.v.m : cell.v.v) : "";
      });

      const maxRow = Math.max(...Object.keys(cellMap).map(Number), 0);
      let maxCol = 0;

      Object.values(cellMap).forEach(row => {
        const cols = Object.keys(row).map(Number);
        if (cols.length > 0) {
          maxCol = Math.max(maxCol, ...cols);
        }
      });

      for (let r = 0; r <= maxRow; r++) {
        dataArray[r] = [];
        for (let c = 0; c <= maxCol; c++) {
          dataArray[r][c] = (cellMap[r] && cellMap[r][c] !== undefined) ? cellMap[r][c] : null;
        }
      }
    }

    if (dataArray.length === 0) {
      alert('No data to export');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const safeSheetName = (sheet.name || "Sheet1").substring(0, 31);
    const worksheet = workbook.addWorksheet(safeSheetName);

    // Add data to worksheet
    dataArray.forEach((rowData, rowIndex) => {
      const row = worksheet.addRow(rowData);

      // If it is the first row, apply yellow background and bold text
      if (rowIndex === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' } // yellow
          };
          cell.font = {
            bold: true,
            color: { argb: 'FF000000' } // black
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      } else {
        // Normal data cells
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxColumnLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        maxColumnLength = Math.max(
          maxColumnLength,
          cell.value ? cell.value.toString().length : 0
        );
      });
      column.width = Math.min(Math.max(maxColumnLength + 2, 10), 50); // min 10, max 50 width
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fileName = `${activeWorkbook.name} - ${safeSheetName}.xlsx`;

    if (returnBlob) {
      return { blob, fileName };
    }

    saveAs(blob, fileName);
  };

  const openEmailDialog = (sheetIndex) => {
    const selected = [sheetIndex];
    setSelectedSheetsForEmail(selected);
    const sheetNames = selected.map(i => workbookData[i]?.name || `Sheet${i + 1}`).join(', ');
    setEmailConfig(prev => ({
      ...prev,
      subject: `DSR Update - ${activeWorkbook?.name || 'DSR'} (${sheetNames})`,
      body: `Please find the attached DSR update sheet(s): ${sheetNames}.`
    }));
    setEmailDialog(true);
  };

  const toggleSheetForEmail = (index) => {
    setSelectedSheetsForEmail(prev => {
      const updated = prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].sort((a, b) => a - b);
      // Also update the subject and body with new sheet names
      const sheetNames = updated.map(i => workbookData[i]?.name || `Sheet${i + 1}`).join(', ');
      setEmailConfig(cfg => ({
        ...cfg,
        subject: `DSR Update - ${activeWorkbook?.name || 'DSR'} (${sheetNames || 'none'})`,
        body: `Please find the attached DSR update sheet(s): ${sheetNames || 'none'}.`
      }));
      return updated;
    });
  };

  // Export multiple selected sheets into a single Excel file
  const exportSelectedSheets = async () => {
    let sheets = workbookDataRef.current;
    if (workbookRef.current && typeof workbookRef.current.getAllSheets === 'function') {
      try {
        sheets = workbookRef.current.getAllSheets();
      } catch (err) {
        console.warn('Could not get sheets for export:', err);
      }
    }

    const workbook = new ExcelJS.Workbook();

    for (const idx of selectedSheetsForEmail) {
      const sheet = sheets[idx];
      if (!sheet) continue;

      const dataArray = [];
      if (sheet.data && Array.isArray(sheet.data) && sheet.data.length > 0) {
        sheet.data.forEach((row, rIdx) => {
          if (!row) return;
          dataArray[rIdx] = [];
          row.forEach((cell, cIdx) => {
            dataArray[rIdx][cIdx] = cell ? (cell.m !== undefined ? cell.m : cell.v) : "";
          });
        });
      } else if (sheet.celldata) {
        const cellMap = {};
        sheet.celldata.forEach(cell => {
          if (!cellMap[cell.r]) cellMap[cell.r] = {};
          cellMap[cell.r][cell.c] = cell.v ? (cell.v.m !== undefined ? cell.v.m : cell.v.v) : "";
        });

        const maxRow = Math.max(...Object.keys(cellMap).map(Number), 0);
        let maxCol = 0;
        Object.values(cellMap).forEach(row => {
          const cols = Object.keys(row).map(Number);
          if (cols.length > 0) maxCol = Math.max(maxCol, ...cols);
        });

        for (let r = 0; r <= maxRow; r++) {
          dataArray[r] = [];
          for (let c = 0; c <= maxCol; c++) {
            dataArray[r][c] = (cellMap[r] && cellMap[r][c] !== undefined) ? cellMap[r][c] : null;
          }
        }
      }

      if (dataArray.length === 0) continue;

      const safeSheetName = (sheet.name || `Sheet${idx + 1}`).substring(0, 31);
      const worksheet = workbook.addWorksheet(safeSheetName);

      dataArray.forEach((rowData, rowIndex) => {
        const row = worksheet.addRow(rowData);
        if (rowIndex === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
            cell.font = { bold: true, color: { argb: 'FF000000' } };
            cell.border = {
              top: { style: 'thin' }, left: { style: 'thin' },
              bottom: { style: 'thin' }, right: { style: 'thin' }
            };
          });
        } else {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' }, left: { style: 'thin' },
              bottom: { style: 'thin' }, right: { style: 'thin' }
            };
          });
        }
      });

      worksheet.columns.forEach(column => {
        let maxColumnLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          maxColumnLength = Math.max(maxColumnLength, cell.value ? cell.value.toString().length : 0);
        });
        column.width = Math.min(Math.max(maxColumnLength + 2, 10), 50);
      });
    }

    const sheetNames = selectedSheetsForEmail.map(i => sheets[i]?.name || `Sheet${i + 1}`).join(', ');
    const fileName = `${activeWorkbook.name} - ${sheetNames}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { blob, fileName };
  };

  const sendEmailViaAPI = async () => {
    if (selectedSheetsForEmail.length === 0) {
      alert('Please select at least one sheet to send.');
      return;
    }
    try {
      setSendingEmail(true);
      const { blob, fileName } = await exportSelectedSheets();

      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64data = reader.result.split(',')[1];

          const payload = {
            to: emailConfig.to,
            cc: emailConfig.cc,
            bcc: emailConfig.bcc,
            subject: emailConfig.subject,
            body: emailConfig.body,
            fileName: fileName,
            fileBase64: base64data
          };

          const baseUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3001'
            : '';
          const apiUrl = baseUrl + '/api/send-email';

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to send email via API');
          }

          alert('Email sent successfully!');
          setEmailDialog(false);
          setSelectedSheetsForEmail([]);
        } catch (err) {
          console.error('Error sending email:', err);
          alert(`Failed to send email: ${err.message}`);
        } finally {
          setSendingEmail(false);
        }
      };
    } catch (err) {
      console.error('Error exporting sheet:', err);
      alert(`Failed to send email: ${err.message}`);
      setSendingEmail(false);
    }
  };

  // Handle FortuneSheet changes - enforce yellow first row and auto-save
  const handleSheetChange = (data) => {
    if (data && Array.isArray(data)) {
      const processedData = data.map(sheet => {
        if (sheet.celldata && Array.isArray(sheet.celldata)) {
          sheet.celldata = enforceYellowFirstRow(sheet.celldata);
        }
        return sheet;
      });

      workbookDataRef.current = processedData;

      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        console.log('Auto-saving on cell edit...');
        saveActiveWorkbook(true);
      }, 5000);
    }
  };

  if (loading && !activeWorkbook) return <div style={styles.loading}>Loading DSR Data...</div>;

  const customFonts = [
    { fontName: "Arial", value: "Arial" },
    { fontName: "Helvetica", value: "Helvetica" },
    { fontName: "Times New Roman", value: "Times New Roman" },
    { fontName: "Courier New", value: "Courier New" },
    { fontName: "Verdana", value: "Verdana" },
    { fontName: "Georgia", value: "Georgia" },
    { fontName: "Comic Sans MS", value: "Comic Sans MS" },
    { fontName: "Trebuchet MS", value: "Trebuchet MS" },
    { fontName: "Impact", value: "Impact" },
    { fontName: "Inter", value: "Inter" },
    { fontName: "Roboto", value: "Roboto" },
    { fontName: "Outfit", value: "Outfit" },
    { fontName: "Tahoma", value: "Tahoma" }
  ];

  if (activeWorkbook) {
    return (
      <div style={styles.workspace}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: 'var(--bg-base)' }}>
          <div style={{ ...styles.header, marginBottom: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
            <div style={styles.controls}>
              <button
                onClick={closeWorkbook}
                style={styles.backButton}
              >
                &larr; Back
              </button>
              <input
                type="text"
                value={activeWorkbook.name}
                onChange={(e) => setActiveWorkbook({ ...activeWorkbook, name: e.target.value })}
                style={{ ...styles.searchInput, border: 'none', background: 'transparent', fontSize: '18px', fontWeight: 'bold' }}
                title="Click to rename"
              />

              {/* Sheet Tabs */}
              <div style={styles.sheetTabs}>
                {workbookData.map((sheet, index) => (
                  <button
                    key={sheet.id}
                    onClick={() => switchSheet(index)}
                    style={{
                      ...styles.sheetTab,
                      backgroundColor: index === activeSheetIndex ? 'var(--brand-primary)' : 'var(--bg-surface-2)',
                      color: index === activeSheetIndex ? '#fff' : 'var(--text-primary)'
                    }}
                  >
                    <FileSpreadsheet size={16} />
                    <span style={{ fontSize: '15px' }}>Sheet {index + 1}</span>
                  </button>
                ))}
                <button
                  onClick={addNewSheet}
                  style={styles.addSheetButton}
                  title="Add new sheet"
                >
                  + Add Sheet
                </button>
              </div>
            </div>

            <div style={styles.buttonGroup}>
              {/* Metadata Display */}
              <div style={styles.metadata}>
                <div style={styles.metadataItem}>
                  <Clock size={12} />
                  Created: {new Date(activeWorkbook.created_at).toLocaleString()}
                </div>
                <div style={styles.metadataItem}>
                  Updated: {new Date(activeWorkbook.updated_at).toLocaleString()}
                </div>
                {lastSavedTime && (
                  <div style={styles.metadataItem}>
                    Last saved: {lastSavedTime.toLocaleTimeString()}
                  </div>
                )}
              </div>

              <button
                onClick={() => exportSheet(activeSheetIndex)}
                style={styles.exportAllButton}
              >
                Export Sheet
              </button>
              <button
                onClick={() => openEmailDialog(activeSheetIndex)}
                style={{ ...styles.exportButton, backgroundColor: '#10b981' }}
              >
                Send Sheet
              </button>
              <button
                onClick={() => saveActiveWorkbook(false)}
                disabled={saving}
                style={{ ...styles.quickSendButton, backgroundColor: 'var(--brand-primary)' }}
              >
                {saving ? 'Saving...' : 'Save Workbook'}
              </button>
            </div>
          </div>

          {/* FortuneSheet with key to force re-render on sheet switch */}
          <div style={{ flex: 1, position: 'relative', width: '100%' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              <Workbook
                ref={workbookRef}
                key={`${activeWorkbook.id}-${activeSheetIndex}`}
                data={workbookData}
                onChange={handleSheetChange}
                settings={{ fontList: customFonts }}
              />
            </div>
          </div>

          {emailDialog !== false && (
            <div style={styles.dialogOverlay}>
              <div style={{...styles.dialog, maxWidth: '620px'}}>
                <div style={styles.dialogHeader}>
                  <h2 style={styles.dialogTitle}>Send DSR Sheet(s) via Email</h2>
                  <p style={styles.dialogSubtitle}>Select which sheets to attach and confirm email details.</p>
                </div>

                <div style={styles.emailConfig}>
                  {/* Sheet selection checkboxes */}
                  <div style={styles.formGroup}>
                    <label style={{...styles.formLabel, marginBottom: '8px'}}>Select Sheets to Send:</label>
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '8px',
                      padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      {workbookData.map((sheet, index) => (
                        <label
                          key={sheet.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: '500',
                            backgroundColor: selectedSheetsForEmail.includes(index) ? '#4f46e5' : '#ffffff',
                            color: selectedSheetsForEmail.includes(index) ? '#ffffff' : '#374151',
                            border: selectedSheetsForEmail.includes(index) ? '1px solid #4f46e5' : '1px solid #d1d5db',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSheetsForEmail.includes(index)}
                            onChange={() => toggleSheetForEmail(index)}
                            style={{ display: 'none' }}
                          />
                          <FileSpreadsheet size={14} />
                          {sheet.name || `Sheet ${index + 1}`}
                        </label>
                      ))}
                    </div>
                    {selectedSheetsForEmail.length === 0 && (
                      <span style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Please select at least one sheet.</span>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>To:</label>
                    <input
                      type="email"
                      placeholder="e.g. client@example.com (comma separated)"
                      value={emailConfig.to}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, to: e.target.value }))}
                      style={styles.emailInput}
                    />
                  </div>
                  <div style={styles.formRow}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>CC:</label>
                      <input
                        type="text"
                        placeholder="Optional"
                        value={emailConfig.cc}
                        onChange={(e) => setEmailConfig(prev => ({ ...prev, cc: e.target.value }))}
                        style={styles.emailInput}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>BCC:</label>
                      <input
                        type="text"
                        placeholder="Optional"
                        value={emailConfig.bcc}
                        onChange={(e) => setEmailConfig(prev => ({ ...prev, bcc: e.target.value }))}
                        style={styles.emailInput}
                      />
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Subject:</label>
                    <input
                      type="text"
                      placeholder="Email Subject"
                      value={emailConfig.subject}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, subject: e.target.value }))}
                      style={styles.emailInput}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Message:</label>
                    <textarea
                      placeholder="Body message..."
                      rows={4}
                      value={emailConfig.body}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, body: e.target.value }))}
                      style={styles.emailTextarea}
                    />
                  </div>
                </div>
                <div style={styles.dialogButtons}>
                  <button
                    onClick={() => { setEmailDialog(false); setSelectedSheetsForEmail([]); }}
                    style={styles.cancelDialogButton}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendEmailViaAPI}
                    disabled={sendingEmail || selectedSheetsForEmail.length === 0}
                    style={{
                      ...styles.sendDialogButton,
                      opacity: selectedSheetsForEmail.length === 0 ? 0.5 : 1,
                      cursor: selectedSheetsForEmail.length === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {sendingEmail ? 'Sending...' : `Send ${selectedSheetsForEmail.length} Sheet${selectedSheetsForEmail.length !== 1 ? 's' : ''} Now`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        /* ── DSRPage Responsive (@media screen) ── */
        @media screen and (max-width: 1024px) {
          [data-dsr-table-wrap] {
            overflow-x: auto !important;
          }
        }
        @media screen and (max-width: 768px) {
          [data-dsr-header] {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          [data-dsr-controls] {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          [data-dsr-controls] input,
          [data-dsr-controls] select,
          [data-dsr-controls] button {
            width: 100% !important;
          }
          .metadata-container {
            flex-direction: column !important;
            gap: 4px !important;
          }
        }
        @media screen and (max-width: 480px) {
          [data-dsr-header] h1 {
            font-size: 18px !important;
          }
        }
      `}</style>

      <div style={styles.header} data-dsr-header>
        <h1 style={styles.title}>Daily Sales Reports (DSR)</h1>
        <div style={styles.controls} data-dsr-controls>
          <div style={styles.buttonGroup}>
            <button
              style={styles.exportAllButton}
              onClick={createWorkbook}
              disabled={saving}
            >
              {saving ? 'Creating...' : '+ Create New DSR'}
            </button>
          </div>
        </div>
      </div>

      {saving && (
        <div style={styles.savingIndicator}>
          Creating new DSR workbook...
        </div>
      )}

      <div style={styles.tableContainer} data-dsr-table-wrap>
        {workbooks.length === 0 && !loading ? (
          <div style={styles.noData}>
            No DSR Workbooks found. Create one to get started!
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th style={{ ...styles.cell, width: '250px' }}>Name</th>
                <th style={styles.cell}>Author</th>
                <th style={styles.cell}>Created</th>
                <th style={styles.cell}>Updated</th>
                <th style={{ ...styles.cell, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workbooks.map((wb, index) => (
                <tr
                  key={wb.id}
                  style={index % 2 === 0 ? styles.evenRow : styles.oddRow}
                >
                  <td style={styles.cell}><strong>{wb.name}</strong></td>
                  <td style={styles.cell}>
                    {wb.created_by && (
                      <div style={styles.authorBadge}>
                        <UserPlus size={11} /> {wb.created_by}
                      </div>
                    )}
                  </td>
                  <td style={styles.cell}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{new Date(wb.created_at).toLocaleDateString()}</span>
                      <span style={styles.timeStamp}>
                        {new Date(wb.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </td>
                  <td style={styles.cell}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{new Date(wb.updated_at).toLocaleDateString()}</span>
                      <span style={styles.timeStamp}>
                        {new Date(wb.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...styles.cell, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '10px' }}>
                      <button
                        onClick={() => openWorkbook(wb.id, wb.name)}
                        style={styles.actionButton}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => deleteWorkbook(wb.id)}
                        style={styles.deleteButton}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  workspace: {
    display: 'flex', 
    flexDirection: 'column', 
    height: '100vh', 
    width: '100%', 
    backgroundColor: 'var(--bg-base)'
  },
  container: {
    fontFamily: "'Inter', Arial, sans-serif",
    padding: '20px',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '14px 18px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    flexWrap: 'wrap',
    gap: '10px',
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: '22px',
    fontWeight: '700',
    margin: 0,
    background: 'var(--brand-gradient)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  searchInput: {
    padding: '8px 12px',
    border: '1px solid var(--border-strong)',
    borderRadius: '8px',
    fontSize: '14px',
    minWidth: '200px',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  exportButton: {
    padding: '10px 14px',
    backgroundColor: 'var(--brand-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  },
  exportAllButton: {
    padding: '10px 14px',
    backgroundColor: 'var(--success)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  },
  quickSendButton: {
    padding: '10px 14px',
    backgroundColor: 'var(--brand-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  },
  backButton: {
    padding: '10px 20px',
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '700',
    transition: 'all 0.2s',
  },
  cancelDialogButton: {
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  actionButton: {
    padding: '4px 8px',
    backgroundColor: 'var(--brand-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '12px',
  },
  deleteButton: {
    padding: '4px 8px',
    backgroundColor: 'var(--danger)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    marginTop: '20px',
    position: 'relative',
    backgroundColor: 'var(--bg-surface)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  headerRow: {
    backgroundColor: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  cell: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    textAlign: 'left',
    color: 'var(--text-primary)',
  },
  evenRow: {
    backgroundColor: 'var(--bg-surface)',
  },
  oddRow: {
    backgroundColor: 'var(--bg-surface-2)',
  },
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
    fontSize: '18px',
    color: 'var(--text-secondary)',
  },
  savingIndicator: {
    textAlign: 'center',
    padding: '10px',
    backgroundColor: 'var(--warning-bg)',
    color: 'var(--warning)',
    border: '1px solid var(--warning)',
    borderRadius: '8px',
    marginBottom: '10px',
    fontSize: '14px',
  },
  savingToast: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    padding: '12px 24px',
    borderRadius: '12px',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
    zIndex: 999999,
    fontSize: '16px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  dialogOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(5px)',
    WebkitBackdropFilter: 'blur(5px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999,
  },
  dialog: {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '550px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    border: '1px solid #e5e7eb',
    fontFamily: "'Inter', sans-serif",
  },
  dialogHeader: {
    marginBottom: '24px',
    borderBottom: '1px solid #f3f4f6',
    paddingBottom: '16px',
  },
  dialogTitle: {
    marginTop: 0,
    marginBottom: '8px',
    color: '#111827',
    fontSize: '22px',
    fontWeight: '700',
  },
  dialogSubtitle: {
    margin: 0,
    color: '#6b7280',
    fontSize: '14px',
  },
  emailConfig: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
  },
  emailInput: {
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: '#f9fafb',
    color: '#111827',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  emailTextarea: {
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: '#f9fafb',
    color: '#111827',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  dialogButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    borderTop: '1px solid #f3f4f6',
    paddingTop: '20px',
  },
  sendDialogButton: {
    padding: '10px 24px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
  },
  noData: {
    textAlign: 'center',
    padding: '60px 20px',
    fontSize: '15px',
    color: 'var(--text-muted)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  authorBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(43, 108, 176, 0.1)',
    color: '#2b6cb0',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  },
  timeStamp: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },
  metadata: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginRight: '10px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  metadataItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap',
  },
  sheetTabs: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    marginLeft: '20px',
    flexWrap: 'wrap',
  },
  sheetTab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  addSheetButton: {
    padding: '10px 16px',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px dashed var(--border-strong)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
};