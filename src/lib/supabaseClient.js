// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Extract the real Supabase host from the JWT for realtime WebSocket connections,
// since the Cloudflare Workers proxy (VITE_SUPABASE_URL) doesn't support WebSockets.
const REALTIME_SUPABASE_URL = 'https://xgihvwtiaqkpusrdvclk.supabase.co'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
  global: {
    headers: { 'x-client-info': 'seal-freight' },
  },
})

// Override the realtime URL to use the actual Supabase endpoint
supabase.realtime.setAuth(supabaseAnonKey)
supabase.realtime.endPointURL = `${REALTIME_SUPABASE_URL}/realtime/v1/websocket?apikey=${supabaseAnonKey}&vsn=1.0.0`