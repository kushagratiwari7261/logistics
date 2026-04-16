// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// The proxy URL (Cloudflare Worker) — handles REST/HTTP but NOT WebSockets
const proxyUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The real Supabase URL — needed for WebSocket (realtime) connections
// Extracted from the JWT ref claim: xgihvwtiaqkpusrdvclk
const REAL_SUPABASE_URL = 'https://xgihvwtiaqkpusrdvclk.supabase.co'

// Create client with the REAL Supabase URL so realtime WebSocket works.
// Route all HTTP/REST calls through the Cloudflare Workers proxy via custom fetch.
export const supabase = createClient(REAL_SUPABASE_URL, supabaseAnonKey, {
  global: {
    fetch: (url, options) => {
      // Redirect all HTTP requests through the Cloudflare Workers proxy
      const proxiedUrl = url.toString().replace(REAL_SUPABASE_URL, proxyUrl)
      return fetch(proxiedUrl, options)
    },
    headers: { 'x-client-info': 'seal-freight' },
  },
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
})