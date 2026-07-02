// src/hooks/useServerDate.js
// React hook that provides the current server date string (YYYY-MM-DD)
// for form initialization. Fetches from Supabase on mount.

import { useState, useEffect } from 'react';
import { getServerDateString } from '../utils/serverDate';

/**
 * Hook that returns the current server date as YYYY-MM-DD string.
 * Shows local date immediately, then corrects to server date once fetched.
 * @returns {string} Current date in YYYY-MM-DD format
 */
export function useServerDate() {
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    let cancelled = false;
    getServerDateString().then(serverDate => {
      if (!cancelled) setDateStr(serverDate);
    });
    return () => { cancelled = true; };
  }, []);

  return dateStr;
}
