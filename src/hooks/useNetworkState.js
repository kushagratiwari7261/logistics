import { useState, useEffect } from 'react';

export const useNetworkState = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      // Small delay to ensure true connectivity is established
      setTimeout(() => setIsOffline(false), 1000);
    };
    const handleOffline = () => setIsOffline(true);
    
    // Listen to custom global event triggered when a Supabase fetch fails with Network Error
    const handleForceOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('force_offline', handleForceOffline);

    // Initial check just in case navigator.onLine is inaccurate at startup
    if (navigator.onLine) {
      setIsOffline(false);
    } else {
      setIsOffline(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('force_offline', handleForceOffline);
    };
  }, []);

  return isOffline;
};
