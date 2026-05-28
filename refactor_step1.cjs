const fs = require('fs');
const path = require('path');

const activeJobPath = path.join(__dirname, 'src', 'components', 'ActiveJob.jsx');
const globalFormPath = path.join(__dirname, 'src', 'components', 'GlobalJobForm.jsx');

let activeJobCode = fs.readFileSync(activeJobPath, 'utf8');
let globalFormCode = activeJobCode;

globalFormCode = globalFormCode.replace('const ActiveJob = () => {', 'const GlobalJobForm = () => {');
globalFormCode = globalFormCode.replace('export default ActiveJob;', 'export default GlobalJobForm;');

// Replace checkStoredState entirely
const checkStoredStateRegex = /const checkStoredState = useCallback\(\(\) => \{[\s\S]*?\}\, \[\]\)\;/;
const newCheckStoredState = `
  const checkStoredState = useCallback(() => {
    const savedEditingState = sessionStorage.getItem('editing_job');
    const savedCreatingState = sessionStorage.getItem('creating_job');
    const isMinimizedState = sessionStorage.getItem('job_is_minimized') === 'true';
    
    if (!savedEditingState && !savedCreatingState) {
      setShowJobForm(false);
      setEditingJob(null);
      return;
    }

    if (savedEditingState) {
      try {
        const state = JSON.parse(savedEditingState);
        setEditingJob(state.job);
        setFormData(state.formData);
        setJobType(state.jobType);
        setTradeDirection(state.tradeDirection);
        setActiveStep(state.activeStep);
        if (!isMinimizedState) setShowJobForm(true);
        else setShowJobForm(false);
      } catch (e) {
        sessionStorage.removeItem('editing_job');
      }
    } else if (savedCreatingState) {
      try {
        const state = JSON.parse(savedCreatingState);
        setFormData(state.formData);
        setJobType(state.jobType);
        setTradeDirection(state.tradeDirection);
        setActiveStep(state.activeStep);
        if (!isMinimizedState) setShowJobForm(true);
        else setShowJobForm(false);
      } catch (e) {
        sessionStorage.removeItem('creating_job');
      }
    }
  }, []);

  const handleOpenGlobalForm = useCallback((e) => {
    const jobToEdit = e.detail;
    if (jobToEdit) {
      setEditingJob(jobToEdit);
      setFormData({
        ...INITIAL_FORM_DATA,
        ...jobToEdit,
        jobNo: jobToEdit.job_no || jobToEdit.jobNo,
        jobDate: jobToEdit.job_date ? jobToEdit.job_date.split('T')[0] : INITIAL_FORM_DATA.jobDate
      });
      setJobType(jobToEdit.job_type || '');
      setTradeDirection(jobToEdit.trade_direction || '');
      setActiveStep(1);
      
      sessionStorage.removeItem('job_is_minimized');
      setShowJobForm(true);
    } else {
      setEditingJob(null);
      setFormData({...INITIAL_FORM_DATA, jobNo: generateJobNumber()});
      setJobType('');
      setTradeDirection('');
      setActiveStep(1);
      
      sessionStorage.removeItem('job_is_minimized');
      setShowJobForm(true);
    }
  }, []);
`;
globalFormCode = globalFormCode.replace(checkStoredStateRegex, newCheckStoredState);

const useEffRegex = /useEffect\(\(\) => \{\s*checkStoredState\(\);\s*window\.addEventListener\('job_state_changed', checkStoredState\);\s*return \(\) => window\.removeEventListener\('job_state_changed', checkStoredState\);\s*\}, \[checkStoredState\]\);/;
globalFormCode = globalFormCode.replace(useEffRegex, `
  useEffect(() => {
    checkStoredState();
    window.addEventListener('job_state_changed', checkStoredState);
    window.addEventListener('open_global_job_form', handleOpenGlobalForm);
    return () => {
      window.removeEventListener('job_state_changed', checkStoredState);
      window.removeEventListener('open_global_job_form', handleOpenGlobalForm);
    }
  }, [checkStoredState, handleOpenGlobalForm]);
`);

const handleCancelStr = `  const handleCancel = useCallback(() => {`;
globalFormCode = globalFormCode.replace(handleCancelStr, `  const handleCancel = useCallback(() => {
    setActiveStep(1);
    setJobType('');
    setTradeDirection('');
    setShowJobForm(false);
    setEditingJob(null);
    setValidationErrors({});
    setFormData({...INITIAL_FORM_DATA, jobNo: generateJobNumber()});
    
    sessionStorage.removeItem('job_is_minimized');
    sessionStorage.removeItem('editing_job');
    sessionStorage.removeItem('creating_job');
    window.dispatchEvent(new Event('job_state_changed'));
  }, []); 
  const handleCancelOrig = useCallback(() => {`);

globalFormCode = globalFormCode.replace(/handleCancel\(\);\s*setSelectedFile\(null\);\s*sessionStorage\.removeItem\('editing_job'\);\s*sessionStorage\.removeItem\('creating_job'\);/g, 
  "handleCancel();\n      setSelectedFile(null);\n      window.dispatchEvent(new Event('job_data_updated'));");

// Correctly cut out the table JSX using Regex
const formMatchRegex = /return\s*\(\s*<>[\s\S]*?\{showJobForm && \(/;
if (formMatchRegex.test(globalFormCode)) {
  const isMinimizedStr = `
      {sessionStorage.getItem('job_is_minimized') === 'true' && (
        <div className="minimized-job-bar" onClick={() => { sessionStorage.removeItem('job_is_minimized'); window.dispatchEvent(new Event('job_state_changed')); }}>
          <div className="minimized-job-content">
            <span className="minimized-job-title">
              {editingJob ? 'Editing Job' : 'Creating Job'} - {jobType || 'Draft'}
            </span>
            <div className="minimized-actions">
              <button className="window-btn" title="Restore"><Maximize2 size={14} /></button>
              <button className="window-btn close-btn" onClick={(e) => { e.stopPropagation(); handleCancel(); }} title="Close"><X size={14} /></button>
            </div>
          </div>
        </div>
      )}
  `;
  globalFormCode = globalFormCode.replace(formMatchRegex, 'return (\n    <>\n' + isMinimizedStr + '{showJobForm && (');
  
  // Cut out delete modal
  const deleteModalRegex = /\{\/\* Delete Confirmation Modal \*\/\}[\s\S]*/;
  globalFormCode = globalFormCode.replace(deleteModalRegex, '    </>\n  );\n}\n\nexport default GlobalJobForm;');
} else {
  console.log("Could not find the return block to replace!");
}

fs.writeFileSync(globalFormPath, globalFormCode);
console.log('GlobalJobForm.jsx created successfully.');
