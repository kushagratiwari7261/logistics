
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

async function testInsert() {
  console.log("🧪 Attempting test notification insert...");
  
  // 1. Get a valid user ID first
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  if (!profiles || profiles.length === 0) {
    console.error("❌ No profiles found to test with.");
    return;
  }
  const testUserId = profiles[0].id;
  console.log(`👤 Using test user ID: ${testUserId}`);

  // 2. Try simple insert
  const { data, error } = await supabase.from('notifications').insert([{
    user_id: testUserId,
    title: "Debug Test",
    message: "This is a test notification from debug script",
    type: 'test'
  }]).select();

  if (error) {
    console.error("❌ Test insert FAILED:", error);
    
    if (error.code === '42P01') {
      console.log("💡 Hint: The 'notifications' table does not exist!");
    } else if (error.code === '42703') {
      console.log("💡 Hint: Some columns in the insert do not exist in the table!");
    }
  } else {
    console.log("✅ Test insert SUCCESSFUL:", data);
    
    // Now check if it exists
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true });
    console.log(`📊 New total count: ${count}`);
  }
}

testInsert();
