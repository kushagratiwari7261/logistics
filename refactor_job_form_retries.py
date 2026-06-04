import re
import os

filepath = 'src/components/GlobalJobForm.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to replace the insert and update logic.
# The update logic is around:
# if (editingJob) {
#   ...
# } else {
#   ...
# }

# Let's find the `if (editingJob) {` block inside `handleSaveJob`
# It starts around line 865

old_logic = """      if (editingJob) {
        jobData.updated_at = new Date().toISOString();

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
      }"""

new_logic = """      // Helper function to dynamically strip missing columns and retry
      const saveWithRetry = async (payload, isUpdate = false, retries = 5) => {
        let currentPayload = { ...payload };
        let currentError = null;
        let data = null;

        for (let i = 0; i < retries; i++) {
          let response;
          if (isUpdate) {
            response = await supabase
              .from('jobs')
              .update(currentPayload)
              .eq('id', editingJob.id)
              .select('*');
          } else {
            response = await supabase
              .from('jobs')
              .insert([currentPayload])
              .select('*');
          }

          if (response.error) {
            currentError = response.error;
            // Handle missing column error (PGRST204)
            if (currentError.code === 'PGRST204') {
              const match = currentError.message.match(/'([^']+)' column/);
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
        throw new Error("Failed to save job after multiple retries due to schema mismatch.");
      };

      if (editingJob) {
        jobData.updated_at = new Date().toISOString();
        result = await saveWithRetry(jobData, true);
      } else {
        jobData.created_by = userEmail;
        result = await saveWithRetry(jobData, false);

        // Broadcast notification to all users
        supabase.rpc('notify_all_users', {
          p_title: 'New Job Order',
          p_message: `Job Order ${jobData.job_no} created by ${userEmail}.`,
          p_type: 'info'
        }).catch(err => console.error('Notification error', err));
      }"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully replaced logic in GlobalJobForm.jsx")
else:
    print("Could not find old logic in GlobalJobForm.jsx")
