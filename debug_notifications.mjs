
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkNotifications() {
  console.log("🔍 Checking notifications table...");
  const { data, count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error("❌ Error fetching notifications:", error);
    return;
  }

  console.log(`📊 Total notifications count: ${count}`);
  console.log("📅 Latest 5 notifications:", JSON.stringify(data, null, 2));

  console.log("\n🔍 Checking profiles count...");
  const { count: profileCount, error: profileError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  
  if (profileError) console.error("❌ Error fetching profiles:", profileError);
  else console.log(`👥 Total profiles: ${profileCount}`);
}

checkNotifications();
