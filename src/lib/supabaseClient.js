// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// The proxy URL (Cloudflare Worker) — handles REST, Auth, and WebSockets (Realtime)
const proxyUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Initialize the client with the Proxy URL directly.
// The Cloudflare Worker will route all requests to the real Supabase backend.
export const supabase = createClient(proxyUrl, supabaseAnonKey, {
  global: {
    headers: { 'x-client-info': 'seal-freight' },
  },
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
})