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

async function checkShipments() {
  const { data, error } = await supabase
    .from('shipments')
    .select('id, shipment_no, status');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Shipments found:', data.length);
  console.log(JSON.stringify(data, null, 2));
}

checkShipments();
