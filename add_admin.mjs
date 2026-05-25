import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://logistics.prudata-tech.workers.dev/supabase';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function addAdmin() {
  const { data, error } = await supabase
    .from('admins')
    .upsert({ email: 'kushagratiwari252@gmail.com', is_super_admin: true }, { onConflict: 'email' })
    .select();

  if (error) {
    console.error('Error adding admin:', error);
  } else {
    console.log('Successfully added admin:', data);
  }
}

addAdmin();
