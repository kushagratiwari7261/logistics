import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xgihvwtiaqkpusrdvclk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY1NzcwNiwiZXhwIjoyMDg2MjMzNzA2fQ.AQe3eYb3Co2-Nyw46OSeOu8Vx0f9eCB8ZrrKiFifUu8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function deleteManual() {
  const { data, error } = await supabase.from('attendance')
    .delete()
    .eq('date', '2026-05-26')
    .execute();
  console.log("Deleted today's manual records so user can test face match:", data, error);
}

deleteManual();
