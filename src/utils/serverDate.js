// src/utils/serverDate.js
// Fetches current date/time from the server (internet time)
// instead of relying on the user's local system clock.
// Uses Supabase database time via a lightweight query.
// Caches the server-local offset so subsequent calls don't need a network request.

import { supabase } from '../lib/supabaseClient';

let _offset = null; // difference in ms: serverTime - localTime
let _fetching = null; // in-flight promise to avoid duplicate requests

/**
 * Fetches the current server time from Supabase by reading the
 * response `date` header from a lightweight query.
 * Calculates and caches the offset between server time and local system time.
 */
async function fetchServerOffset() {
  try {
    const localBefore = Date.now();

    // Use a lightweight Supabase REST call. The Supabase/PostgREST response
    // includes a standard HTTP `Date` header with the server's current time.
    // We use .head() or a minimal .select() with limit(0) to minimize payload.
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/jobs?select=id&limit=0`,
      {
        method: 'GET',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      }
    );

    const localAfter = Date.now();
    const dateHeader = response.headers.get('date');

    if (dateHeader) {
      const serverTime = new Date(dateHeader).getTime();
      const localMid = (localBefore + localAfter) / 2;
      _offset = serverTime - localMid;
      console.log(`[ServerDate] Time synced. Offset: ${_offset}ms (${(_offset / 1000).toFixed(1)}s)`);
      return;
    }

    // Fallback: try WorldTimeAPI (public internet time API)
    console.warn('[ServerDate] No date header from Supabase, trying WorldTimeAPI...');
    await fetchFromWorldTimeAPI(localAfter);
  } catch (err) {
    console.warn('[ServerDate] Primary time sync failed, trying fallback...', err);
    try {
      await fetchFromWorldTimeAPI(Date.now());
    } catch (fallbackErr) {
      console.warn('[ServerDate] All time sync methods failed, using local time:', fallbackErr);
      _offset = 0;
    }
  }
}

/**
 * Fallback: fetch time from WorldTimeAPI
 */
async function fetchFromWorldTimeAPI(localTime) {
  const localBefore = Date.now();
  const resp = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata');
  const localAfter = Date.now();

  if (resp.ok) {
    const data = await resp.json();
    const serverTime = new Date(data.utc_datetime).getTime();
    const localMid = (localBefore + localAfter) / 2;
    _offset = serverTime - localMid;
    console.log(`[ServerDate] Time synced via WorldTimeAPI. Offset: ${_offset}ms`);
  } else {
    console.warn('[ServerDate] WorldTimeAPI request failed');
    _offset = 0;
  }
}

/**
 * Returns the current server date as a Date object.
 * Uses cached offset after first successful fetch.
 * Falls back to local system time if server is unreachable.
 */
export async function getServerDate() {
  if (_offset === null) {
    if (!_fetching) {
      _fetching = fetchServerOffset().finally(() => { _fetching = null; });
    }
    await _fetching;
  }
  return new Date(Date.now() + (_offset || 0));
}

/**
 * Returns the current server date as a YYYY-MM-DD string (for form date fields).
 */
export async function getServerDateString() {
  const date = await getServerDate();
  // Use 'en-CA' locale to get YYYY-MM-DD format
  return date.toLocaleDateString('en-CA');
}

/**
 * Returns the current server date as an ISO string.
 */
export async function getServerISOString() {
  const date = await getServerDate();
  return date.toISOString();
}

/**
 * Returns the server date synchronously using cached offset.
 * If offset hasn't been fetched yet, triggers async fetch and falls back to local time.
 * Use getServerDate() for guaranteed accuracy.
 */
export function getServerDateSync() {
  if (_offset === null) {
    // Trigger async fetch for next call, return local time now
    if (!_fetching) {
      _fetching = fetchServerOffset().finally(() => { _fetching = null; });
    }
    return new Date();
  }
  return new Date(Date.now() + _offset);
}

/**
 * Returns the server date as YYYY-MM-DD string synchronously.
 * Falls back to local time if not yet synced.
 */
export function getServerDateStringSync() {
  return getServerDateSync().toLocaleDateString('en-CA');
}

/**
 * Force re-sync with server (e.g., after long idle period).
 */
export async function resyncServerTime() {
  _offset = null;
  _fetching = null;
  return getServerDate();
}
