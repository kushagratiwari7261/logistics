import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const { data: employees } = await supabase.from('employees').select('*');
  console.log('All Employees:', employees);
  
  if (employees && employees.length > 0) {
    for (const emp of employees) {
      if (emp.name.toLowerCase().includes('kushagra') || emp.email.toLowerCase().includes('kushagra')) {
        const { data: config } = await supabase.from('employee_office_config').select('*').eq('employee_id', emp.id);
        console.log('Config for', emp.email, ':', config);
      }
    }
  }
  
  const { data: office } = await supabase.from('office_config').select('*');
  console.log('Global office:', office);
}
run();
