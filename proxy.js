/**
 * Unified Gateway Proxy (Cloudflare Worker)
 * Bypasses ISP restrictions by routing traffic through Cloudflare.
 * Target: Railway Backend and Supabase
 */

const BACKEND_URL = "https://logistics-production-5141.up.railway.app";
const SUPABASE_BASE_URL = "https://xgihvwtiaqkpusrdvclk.supabase.co";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Check if it's a Supabase request (starts with /supabase)
    const isSupabase = url.pathname.startsWith("/supabase");
    
    let targetUrl;
    if (isSupabase) {
      // Clean path: /supabase/rest/v1/... -> /rest/v1/...
      const cleanedPath = url.pathname.replace(/^\/supabase/, "");
      targetUrl = SUPABASE_BASE_URL + cleanedPath + url.search;
    } else {
      // Default: Route to Railway Backend
      targetUrl = BACKEND_URL + url.pathname + url.search;
    }

    // --- 1. Handle CORS Preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, accept-profile, prefer, range",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // --- 2. Handle WebSocket Upgrades (Socket.io / Supabase Realtime) ---
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader === "websocket") {
      return fetch(targetUrl, { 
        headers: request.headers, 
        method: "GET" 
      });
    }

    // --- 3. Proxy Request ---
    const newHeaders = new Headers(request.headers);
    
    // Remove Cloudflare-specific or conflicting headers
    const headersToRemove = [
      "host", "cf-connecting-ip", "cf-ray", "cf-visitor", 
      "cf-ipcountry", "x-forwarded-for", "x-forwarded-proto"
    ];
    for (const h of headersToRemove) {
      newHeaders.delete(h);
    }

    try {
      // Prepare request body
      let body;
      if (request.method !== "GET" && request.method !== "HEAD") {
        const contentType = request.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          body = await request.text();
        } else {
          try {
            body = await request.arrayBuffer();
          } catch (e) {
            // Body might be empty
          }
        }
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: body,
        redirect: "follow"
      });

      // --- 4. Prepare Response with CORS headers ---
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });

    } catch (err) {
      return new Response(JSON.stringify({ 
        error: "Gateway Proxy Error", 
        message: err.message,
        target: targetUrl 
      }), { 
        status: 502, 
        headers: { 
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        } 
      });
    }
  }
}
