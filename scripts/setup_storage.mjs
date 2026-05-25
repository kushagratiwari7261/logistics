import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY 
// Note: Management usually needs Service Role Key, but let's check if the URL is proxyed
// If it's a proxy, we might have issues. 
// However, the user asked to create it.

// Let's use a standard script first.
const supabase = createClient(supabaseUrl, supabaseKey)

async function setupBucket() {
  console.log('Checking for attendance-photos bucket...')
  
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  
  if (listError) {
    console.error('Error listing buckets:', listError)
    return
  }
  
  const exists = buckets.find(b => b.name === 'attendance-photos')
  
  if (exists) {
    console.log('Bucket "attendance-photos" already exists.')
  } else {
    console.log('Creating "attendance-photos" bucket...')
    const { data, error } = await supabase.storage.createBucket('attendance-photos', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
      fileSizeLimit: 5242880 // 5MB
    })
    
    if (error) {
      console.error('Error creating bucket:', error)
      console.log('Try using service role key if available.')
    } else {
      console.log('Bucket created successfully:', data)
    }
  }
}

setupBucket()
