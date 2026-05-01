import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env file manually since we are in a script environment
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateExistingVendors() {
  console.log('Fetching vendors...');
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, city, vendorName, createdat')
    .order('createdat', { ascending: true });

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`Found ${vendors.length} vendors.`);
  const prefixCounts = {};

  for (const vendor of vendors) {
    if (!vendor.city) {
        console.log(`Skipping vendor ${vendor.vendorName} (No city)`);
        continue;
    }
    
    // Clean city name and get first 3 letters
    const cleanCity = vendor.city.trim().replace(/[^a-zA-Z]/g, '');
    if (cleanCity.length < 3) {
        console.log(`Skipping vendor ${vendor.vendorName} (City name too short: ${vendor.city})`);
        continue;
    }
    
    const prefix = cleanCity.substring(0, 3).toUpperCase();
    if (!prefixCounts[prefix]) prefixCounts[prefix] = 0;
    prefixCounts[prefix]++;
    const vendorNo = `${prefix}${prefixCounts[prefix]}`;

    console.log(`Updating: [${vendor.city}] ${vendor.vendorName} -> ${vendorNo}`);
    const { error: updateError } = await supabase
      .from('vendors')
      .update({ vendor_no: vendorNo })
      .eq('id', vendor.id);

    if (updateError) {
      console.error(`Error updating vendor ${vendor.id}:`, updateError);
    }
  }
  console.log('Update completed successfully.');
}

updateExistingVendors();
