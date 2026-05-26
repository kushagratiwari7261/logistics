import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://xgihvwtiaqkpusrdvclk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY1NzcwNiwiZXhwIjoyMDg2MjMzNzA2fQ.AQe3eYb3Co2-Nyw46OSeOu8Vx0f9eCB8ZrrKiFifUu8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkData() {
  const { data, error } = await supabase.from('attendance').select('*').order('marked_at', { ascending: false }).limit(20);
  if (error) console.error("Error:", error);
  else {
    fs.writeFileSync('output.json', JSON.stringify(data, null, 2));
    console.log("Wrote to output.json");
  }
}

checkData();
