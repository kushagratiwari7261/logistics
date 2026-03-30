import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Tracks user online/offline presence by updating the profiles table.
 * Sets is_online = true and updates last_seen on a heartbeat interval.
 * Sets is_online = false when the tab is closed or goes inactive.
 */
export const usePresence = (userId) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    const updatePresence = async (online) => {
      try {
        await supabase
          .from('profiles')
          .update({
            is_online: online,
            last_seen: new Date().toISOString(),
          })
          .eq('id', userId);
      } catch (err) {
        // Silently fail — presence is non-critical
      }
    };

    // Go online immediately
    updatePresence(true);

    // Heartbeat every 30 seconds
    intervalRef.current = setInterval(() => {
      updatePresence(true);
    }, 30000);

    // Handle tab visibility changes
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        updatePresence(false);
      } else {
        updatePresence(true);
      }
    };

    // Handle page close
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability on page close
      const url = `${supabase.supabaseUrl}/rest/v1/profiles?id=eq.${userId}`;
      const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
      navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }));
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      updatePresence(false);
    };
  }, [userId]);
};

export default usePresence;
