import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReports() {
  console.log('--- Checking v_top_clients ---');
  const { data: clients, error: clientErr } = await supabase.from('v_top_clients').select('*');
  if (clientErr) console.error('v_top_clients Error:', clientErr);
  else console.log('v_top_clients result:', clients);

  console.log('\n--- Checking shipments counts ---');
  const { data: shipments, error: shipErr } = await supabase.from('shipments').select('id, client, freight, payment_status');
  if (shipErr) console.error('shipments Error:', shipErr);
  else console.log('Total shipments:', shipments.length);

  console.log('\n--- Checking jobs (Revenue source) ---');
  const { data: jobs, error: jobErr } = await supabase.from('jobs').select('id, client, invoice_value');
  if (jobErr) console.error('jobs Error:', jobErr);
  else console.log('Total jobs:', jobs.length);
  
  console.log('\n--- Checking payments table ---');
  const { data: payments, error: payErr } = await supabase.from('payments').select('id, amount, status, payment_method');
  if (payErr) console.error('payments Error:', payErr);
  else console.log('Total payments recorded:', payments.length, payments);
}

checkReports();
