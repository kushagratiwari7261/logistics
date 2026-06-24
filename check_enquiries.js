import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://logistics.prudata-tech.workers.dev/supabase',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo'
);

async function check() {
  const { data, error } = await supabase
    .from('job_enquiries')
    .select('id, enquiry_no, status')
    .order('created_at', { ascending: false })
    .limit(20);
    
  if (error) {
    console.error('Error fetching:', error);
  } else {
    console.log('All Enquiries (last 20):');
    data.forEach(d => console.log(d.enquiry_no, '->', d.status));
  }
}

check();
