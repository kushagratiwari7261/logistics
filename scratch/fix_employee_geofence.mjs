import { createClient } from '@supabase/supabase-js';

// Try the direct Supabase URL (not the proxy)
const SUPABASE_URL = 'https://xgihvwtiaqkpusrdvclk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Sign in as the user first to get past RLS
  console.log('Attempting to sign in...');
  // Try listing with RPC or direct REST
  
  // Use the REST API directly with apikey header to bypass RLS check
  const response = await fetch(`${SUPABASE_URL}/rest/v1/employee_office_config?select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });
  const data = await response.json();
  console.log('employee_office_config via REST:', JSON.stringify(data, null, 2));

  const response2 = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id,name,email,role&limit=20`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });
  const data2 = await response2.json();
  console.log('\nemployees via REST:', JSON.stringify(data2, null, 2));

  const response3 = await fetch(`${SUPABASE_URL}/rest/v1/office_config?select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });
  const data3 = await response3.json();
  console.log('\noffice_config via REST:', JSON.stringify(data3, null, 2));
}

main().catch(console.error);
