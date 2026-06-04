import re
import os

filepath = 'src/components/GlobalShipmentForm.jsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports:
# We need to import `createPortal` and some icons.
imports_to_add = "import { createPortal } from 'react-dom';\nimport { useNavigate } from 'react-router-dom';\nimport { Maximize2, Minus, ArrowLeft, ArrowRight, X } from 'lucide-react';\n"
content = re.sub(r"(import React.*?;\n|import \{ useState.*?;\n)", lambda m: m.group(1) + imports_to_add, content, count=1)

# 2. Rename `NewShipments` to `ShipmentFormWindow` and update props
content = content.replace('const NewShipments = () => {', 'const ShipmentFormWindow = ({ formConfig, onClose, onMinimize, onRestore }) => {')

# 3. Handle state initialization with formConfig
content = content.replace('const [showShipmentForm, setShowShipmentForm] = useState(false);', '')
content = content.replace('const [activeStep, setActiveStep] = useState(1);', 'const [activeStep, setActiveStep] = useState(formConfig.initialState?.activeStep || 1);')
content = content.replace("const [shipmentType, setShipmentType] = useState('');", "const [shipmentType, setShipmentType] = useState(formConfig.initialState?.shipmentType || '');")
content = content.replace('const [formData, setFormData] = useState(INITIAL_FORM_DATA);', 'const [formData, setFormData] = useState(formConfig.initialState?.formData || INITIAL_FORM_DATA);')
content = content.replace('const [editingShipment, setEditingShipment] = useState(null);', 'const [editingShipment, setEditingShipment] = useState(formConfig.initialState?.editingShipment || null);')

# 4. Remove session storage logic for old form
content = re.sub(r"useEffect\(\(\) => \{\s*const savedEditingState = sessionStorage\.getItem\('editing_shipment'\);.*?\}, \[\]\);", "", content, flags=re.DOTALL)
content = re.sub(r"useEffect\(\(\) => \{\s*if \(showShipmentForm && editingShipment\) \{.*?\}, \[showShipmentForm, editingShipment, formData, shipmentType, activeStep\]\);", "", content, flags=re.DOTALL)
content = re.sub(r"useEffect\(\(\) => \{\s*if \(!showShipmentForm\) return;.*?\}, \[showShipmentForm, formData\.client, formData\.shipper, formData\.consignee\]\);", "", content, flags=re.DOTALL)

# 5. Fix handleCancel to call onClose
content = re.sub(r"const handleCancel = useCallback\(\(\) => \{.*?\}, \[\]\);", "const handleCancel = useCallback((e) => { if (e && e.stopPropagation) e.stopPropagation(); onClose(formConfig.id); }, [formConfig.id, onClose]);", content, flags=re.DOTALL)

# 6. Fix error related to pod_documents missing in DB
# Find: const { data: updatedShipment, error } = await supabase.from('shipments').update(cleanShipmentData).eq('id', editingShipment.id).select();
# Replace with the fallback logic.

fallback_update_logic = """
          let { data: updatedShipment, error } = await supabase
            .from('shipments')
            .update(cleanShipmentData)
            .eq('id', editingShipment.id)
            .select();
            
          if (error && error.code === 'PGRST204' && error.message?.includes('pod_documents')) {
            console.warn('pod_documents column not found, saving without it.');
            const { pod_documents, ...shipmentDataWithoutPod } = cleanShipmentData;
            const retryResult = await supabase
              .from('shipments')
              .update(shipmentDataWithoutPod)
              .eq('id', editingShipment.id)
              .select();
            if (retryResult.error) throw retryResult.error;
            updatedShipment = retryResult.data;
            error = null;
          }
"""
content = re.sub(r"const \{ data: updatedShipment, error \} = await supabase\s*\.from\('shipments'\)\s*\.update\(cleanShipmentData\)\s*\.eq\('id', editingShipment\.id\)\s*\.select\(\);", fallback_update_logic, content)

fallback_insert_logic = """
          let { data: newShipment, error } = await supabase
            .from('shipments')
            .insert([{ ...cleanShipmentData, shipment_no: shipmentNo, created_by: userEmail }])
            .select();
            
          if (error && error.code === 'PGRST204' && error.message?.includes('pod_documents')) {
            console.warn('pod_documents column not found, saving without it.');
            const { pod_documents, ...shipmentDataWithoutPod } = cleanShipmentData;
            const retryResult = await supabase
              .from('shipments')
              .insert([{ ...shipmentDataWithoutPod, shipment_no: shipmentNo, created_by: userEmail }])
              .select();
            if (retryResult.error) throw retryResult.error;
            newShipment = retryResult.data;
            error = null;
          }
"""
content = re.sub(r"const \{ data: newShipment, error \} = await supabase\s*\.from\('shipments'\)\s*\.insert\(\[\{ \.\.\.cleanShipmentData, shipment_no: shipmentNo, created_by: userEmail \}\]\)\s*\.select\(\);", fallback_insert_logic, content)

# Remove the table view and other irrelevant stuff.
# Find `return (` and replace the body with just the form conditionally rendered.
# We will use regex to find `<div className="new-shipment-container">` and replace everything before `{showShipmentForm && (`.

# Replace table container...
table_pattern = r"(<div className=\"new-shipment-container\">.*?)\{showShipmentForm && \("
new_wrapper = """
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
"""
content = re.sub(r"<div className=\"new-shipment-container\">.*?\{showShipmentForm && \(", new_wrapper, content, flags=re.DOTALL)

# Add window controls to the form header
header_replacement = """
              <div className="new-shipment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button className="window-btn" onClick={handleBack} disabled={activeStep === 1} title="Back" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: activeStep === 1 ? 'not-allowed' : 'pointer', opacity: activeStep === 1 ? 0.4 : 1, color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
                    <ArrowLeft size={16} />
                  </button>
                  <button className="window-btn" onClick={handleNext} disabled={activeStep >= STEPS.length} title="Forward" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: activeStep >= STEPS.length ? 'not-allowed' : 'pointer', opacity: activeStep >= STEPS.length ? 0.4 : 1, color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
                    <ArrowRight size={16} />
                  </button>
                  <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{editingShipment ? 'Edit Shipment' : 'Create Shipment'}</h1>
                  {editingShipment && (
                    <div className="modal-author-info" style={{ display: 'flex', gap: '10px' }}>
                      {editingShipment.created_by && <span className="audit-badge"><UserPlus size={12} /> {editingShipment.created_by.split('@')[0]}</span>}
                      {editingShipment.updated_by && <span className="audit-badge edit"><PenLine size={12} /> {editingShipment.updated_by.split('@')[0]}</span>}
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
"""
content = re.sub(r"<div className=\"new-shipment-header\">.*?</div>\s*</div>", header_replacement, content, flags=re.DOTALL)

# Add closing tags
content = content.replace('</div>\n      )}\n    </div>\n  );\n};', '</div>\n      )}\n    </>\n  );\n};')

# Add the GlobalShipmentForm wrapper component
wrapper_component = """

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

  const handleMinimize = useCallback((id) => {
    setForms(prev => prev.map(f => f.id === id ? { ...f, isMinimized: true } : f));
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
"""

content = content.replace('export default NewShipments;', wrapper_component)
content = content.replace('const navigate = useNavigate();', 'const navigate = useNavigate();\n  const onMinimize = onMinimize || (() => {});\n  const onRestore = onRestore || (() => {});')

# In handleConfirmShipment, onClose needs to be called
content = content.replace('sessionStorage.removeItem(\'creating_shipment\');', "sessionStorage.removeItem('creating_shipment');\n        onClose(formConfig.id);\n        window.dispatchEvent(new Event('shipment_data_updated'));")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done generating GlobalShipmentForm.jsx!")
