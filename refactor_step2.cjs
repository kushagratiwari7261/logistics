const fs = require('fs');
const path = require('path');

const activeJobPath = path.join(__dirname, 'src', 'components', 'ActiveJob.jsx');
let activeJobCode = fs.readFileSync(activeJobPath, 'utf8');

// Replace Add Job onClick
activeJobCode = activeJobCode.replace(
  /onClick=\{\(\) => \{\s*setEditingJob\(null\);\s*setFormData\(\{\.\.\.INITIAL_FORM_DATA, jobNo: generateJobNumber\(\)\}\);\s*setJobType\(''\);\s*setTradeDirection\(''\);\s*setActiveStep\(1\);\s*setShowJobForm\(true\);\s*\}\}/g,
  "onClick={() => window.dispatchEvent(new CustomEvent('open_global_job_form', { detail: null }))}"
);

// Replace Edit onClick
const editRegex = /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*setEditingJob\(job\);\s*setFormData\(\{\s*\.\.\.INITIAL_FORM_DATA,\s*\.\.\.job,\s*jobNo: job\.job_no \|\| job\.jobNo,\s*jobDate: job\.job_date \? job\.job_date\.split\('T'\)\[0\] : INITIAL_FORM_DATA\.jobDate\s*\}\);\s*setJobType\(job\.job_type \|\| ''\);\s*setTradeDirection\(job\.trade_direction \|\| ''\);\s*setActiveStep\(1\);\s*setShowJobForm\(true\);\s*\}\}/g;
activeJobCode = activeJobCode.replace(editRegex, 
  "onClick={(e) => {\n                          e.stopPropagation();\n                          window.dispatchEvent(new CustomEvent('open_global_job_form', { detail: job }));\n                        }}"
);

// Listen to job_data_updated to fetchJobs
const useEffectFetchJobsRegex = /useEffect\(\(\) => \{\s*fetchJobs\(\);\s*\/\/ Subscribe to realtime jobs updates/;
activeJobCode = activeJobCode.replace(useEffectFetchJobsRegex, `
  useEffect(() => {
    const handleJobUpdated = () => {
      fetchJobs();
    };
    window.addEventListener('job_data_updated', handleJobUpdated);
    return () => {
      window.removeEventListener('job_data_updated', handleJobUpdated);
    };
  }, [fetchJobs]);

  useEffect(() => {
    fetchJobs();
    
    // Subscribe to realtime jobs updates`);

// Remove job form JSX
const formJSXRegex = /\{\/\* Job Creation\/Edit Form Modal \*\/\}[\s\S]*?(?=\{\/\* Delete Confirmation Modal \*\/\}|\{\/\* Organization Form Modal \*\/\}|  <\/div>\s*\)\;\s*\}\s*export default ActiveJob\;)/;
activeJobCode = activeJobCode.replace(formJSXRegex, '');

// Remove org modal JSX
const orgModalRegex = /\{\/\* Organization Form Modal \*\/\}[\s\S]*?(?=\{\/\* Delete Confirmation Modal \*\/\}|  <\/div>\s*\)\;\s*\}\s*export default ActiveJob\;)/;
activeJobCode = activeJobCode.replace(orgModalRegex, '');

fs.writeFileSync(activeJobPath, activeJobCode);
console.log('ActiveJob.jsx modified');
