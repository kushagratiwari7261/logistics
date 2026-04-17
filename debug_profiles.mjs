import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://logistics.prudata-tech.workers.dev/supabase',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo'
);

// 1. Check all profiles
console.log('=== ALL PROFILES ===');
const { data: profiles, error: pErr } = await supabase
  .from('profiles')
  .select('*')
  .limit(20);

if (pErr) {
  console.error('Error fetching profiles:', pErr);
} else {
  console.log(`Found ${profiles.length} profiles:`);
  profiles.forEach(p => {
    console.log(`  id: ${p.id}, email: ${p.email || 'NO EMAIL'}, username: ${p.username || 'NONE'}, full_name: ${p.full_name || 'NONE'}`);
  });
}

// 2. Check profiles table columns
console.log('\n=== PROFILES COLUMNS (from first row) ===');
if (profiles && profiles.length > 0) {
  console.log('Columns:', Object.keys(profiles[0]).join(', '));
} else {
  console.log('No profiles found - table may be empty');
}

// 3. Try searching for the specific emails
for (const email of ['123@demo.com', '123@example.com']) {
  console.log(`\n=== Search for "${email}" ===`);
  
  // By email
  const { data: d1, error: e1 } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .ilike('email', `%${email}%`);
  console.log(`  email search: ${d1?.length || 0} results`, e1 ? `ERROR: ${e1.message}` : '', d1);

  // By username/full_name  
  const { data: d2, error: e2 } = await supabase
    .from('profiles')
    .select('id, email, username, full_name')
    .or(`username.ilike.%${email}%,full_name.ilike.%${email}%`);
  console.log(`  name search: ${d2?.length || 0} results`, e2 ? `ERROR: ${e2.message}` : '', d2);
}

// 4. Check current auth user
console.log('\n=== CURRENT AUTH SESSION ===');
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  console.log('Logged in as:', session.user.email, 'ID:', session.user.id);
} else {
  console.log('Not logged in');
}
