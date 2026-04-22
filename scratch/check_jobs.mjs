import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_no, status, created_at')
  
  if (error) {
    console.error('Error fetching jobs:', error)
    return
  }
  
  console.log('Jobs in database:')
  console.table(data)
}

checkJobs()
