import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://logistics.prudata-tech.workers.dev/supabase';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function addAdmin() {
  const emails = [
    'kushagratiwari252@gmail.com',
    'vikas.singh@seal.co.in',
    'sushil.jaisingh@seal.co.in'
  ];

  for (const email of emails) {
    const { data, error } = await supabase
      .from('admins')
      .upsert({ email: email.toLowerCase(), is_super_admin: true }, { onConflict: 'email' })
      .select();

    if (error) {
      console.error(`Error adding admin ${email}:`, error);
    } else {
      console.log(`Successfully added admin: ${email}`);
    }
  }
}

addAdmin();
