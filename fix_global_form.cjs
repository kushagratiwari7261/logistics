const fs = require('fs');
const path = require('path');

const globalFormPath = path.join(__dirname, 'src', 'components', 'GlobalJobForm.jsx');
let code = fs.readFileSync(globalFormPath, 'utf8');

// 1. Fix imports
code = code.replace(
  "import { UserPlus, PenLine, FileUp, ExternalLink, FileText } from 'lucide-react';",
  "import { UserPlus, PenLine, FileUp, ExternalLink, FileText, ArrowLeft, ArrowRight, Minus, X, Maximize2 } from 'lucide-react';"
);

// 2. Add isMinimized and maxStepReached states
code = code.replace(
  "const [showJobForm, setShowJobForm] = useState(false);",
  "const [showJobForm, setShowJobForm] = useState(false);\n  const [isMinimized, setIsMinimized] = useState(sessionStorage.getItem('job_is_minimized') === 'true');\n  const [maxStepReached, setMaxStepReached] = useState(1);"
);

// 3. Update checkStoredState and event listener to use setIsMinimized
const checkStoredRegex = /const isMinimizedState = sessionStorage\.getItem\('job_is_minimized'\) === 'true';/g;
code = code.replace(checkStoredRegex, "const isMinimizedState = sessionStorage.getItem('job_is_minimized') === 'true';\n    setIsMinimized(isMinimizedState);");

// 4. Update the actual rendering of the minimized widget to use the state
const widgetRegex = /\{sessionStorage\.getItem\('job_is_minimized'\) === 'true' && \(/g;
code = code.replace(widgetRegex, "{isMinimized && (");

code = code.replace(
  "onClick={() => { sessionStorage.removeItem('job_is_minimized'); window.dispatchEvent(new Event('job_state_changed')); }}",
  "onClick={() => { sessionStorage.removeItem('job_is_minimized'); setIsMinimized(false); window.dispatchEvent(new Event('job_state_changed')); }}"
);

// 5. Update header and full-screen-modal
const oldHeaderRegex = /<div className="modal-content job-modal">\s*<div className="new-shipment-card">\s*<div className="new-shipment-header">\s*<div style=\{\{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' \}\}>\s*<h1>\{editingJob \? 'Edit Job' : 'Create Job'\}<\/h1>[\s\S]*?<\/div>\s*<\/div>/;

const newHeader = `<div className="modal-content job-modal full-screen-modal">
            <div className="new-shipment-card full-height-card">
              <div className="new-shipment-header window-header">
                <div className="window-controls-left">
                  <button className="window-btn back-btn" onClick={handleBack} disabled={activeStep === 1} title="Back">
                    <ArrowLeft size={18} />
                  </button>
                  <button className="window-btn forward-btn" onClick={handleNext} disabled={activeStep === STEPS.length} title="Forward">
                    <ArrowRight size={18} />
                  </button>
                  <h1>{editingJob ? 'Edit Job' : 'Create Job'}</h1>
                </div>
                <div className="window-controls-right">
                  {editingJob && (
                    <div className="modal-author-info" style={{ display: 'flex', gap: '10px' }}>
                      {editingJob.created_by && <span className="audit-badge"><UserPlus size={12} /> {editingJob.created_by.split('@')[0]}</span>}
                      {editingJob.updated_by && <span className="audit-badge edit"><PenLine size={12} /> {editingJob.updated_by.split('@')[0]}</span>}
                    </div>
                  )}
                  <button className="window-btn minimize-btn" onClick={() => {
                    sessionStorage.setItem('job_is_minimized', 'true');
                    setIsMinimized(true);
                    setShowJobForm(false);
                    window.dispatchEvent(new Event('job_state_changed'));
                  }} title="Minimize">
                    <Minus size={18} />
                  </button>
                  <button className="window-btn close-btn" onClick={handleCancel} title="Close">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="content-scrollable">`;

code = code.replace(oldHeaderRegex, newHeader);

// 6. Close content-scrollable
code = code.replace("{/* Navigation Buttons */}", "</div>\n              {/* Navigation Buttons */}");

// 7. handleNext logic to update maxStepReached
code = code.replace(
  "if (activeStep < STEPS.length) {",
  "if (activeStep < STEPS.length) {\n        setMaxStepReached(Math.max(maxStepReached, activeStep + 1));"
);

// 8. handleCancel to reset maxStepReached
code = code.replace(
  "setActiveStep(1);",
  "setActiveStep(1);\n    setMaxStepReached(1);"
);

fs.writeFileSync(globalFormPath, code);
console.log('GlobalJobForm.jsx fixed with controls.');
