// ============= DEBUG CODE - AT VERY TOP, BEFORE IMPORTS =============
window.refreshDebug = {
  logs: [],
  addLog: function (msg) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    const logEntry = `[${timestamp}] ${msg}`;
    console.log(logEntry);
    this.logs.push(logEntry);
  }
};

const perfData = window.performance.getEntriesByType("navigation")[0];
if (perfData) {
  if (perfData.type === 'navigate') {
    window.refreshDebug.addLog('❌ HARD REFRESH DETECTED (type: navigate)');
  } else if (perfData.type === 'reload') {
    window.refreshDebug.addLog('❌ HARD REFRESH DETECTED (type: reload)');
  } else if (perfData.type === 'back_forward') {
    window.refreshDebug.addLog('⏮️ Browser back/forward navigation');
  }
}

window.addEventListener('beforeunload', () => {
  window.refreshDebug.addLog('🔴 BEFOREUNLOAD triggered - Page is reloading!');
});

window.addEventListener('unload', () => {
  window.refreshDebug.addLog('🔴 UNLOAD triggered - Page refresh in progress');
});

window.addEventListener('error', (event) => {
  window.refreshDebug.addLog(`❌ JS ERROR: ${event.message} at ${event.filename}:${event.lineno}`);
});

window.addEventListener('unhandledrejection', (event) => {
  window.refreshDebug.addLog(`❌ UNHANDLED PROMISE REJECTION: ${event.reason}`);
});

const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

window.history.pushState = function (...args) {
  window.refreshDebug.addLog(`📍 pushState: ${args[2]}`);
  return originalPushState.apply(this, args);
};

window.history.replaceState = function (...args) {
  window.refreshDebug.addLog(`📍 replaceState: ${args[2]}`);
  return originalReplaceState.apply(this, args);
};

document.addEventListener('visibilitychange', () => {
  window.refreshDebug.addLog(`👁️ Visibility: ${document.visibilityState}`);
});

window.addEventListener('focus', () => {
  window.refreshDebug.addLog('👁️ Window focused');
});

window.addEventListener('blur', () => {
  window.refreshDebug.addLog('👁️ Window blurred');
});

// =============
import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCard from './components/StatCard'
import ActiveJob from './components/ActiveJob'
import CustomerPage from './components/CustomerPage'
import Login from './components/Login'
import './App.css'
import NewShipments from './components/NewShipments'
import DSRPage from './components/DSRPage'
import MessagesMain from './components/messages/MessagesMain'
import InvoicesPage from './components/InvoicesPage'
import Settings from './components/Settings'
import ChangePassword from './components/ChangePassword'
import Reports from './components/Reports'
import ShipmentTracking from './components/ShipmentTracking'
import PaymentPage from './components/Payment'
import sealLogo from './seal.png'
import JobAllocation from './components/JobAllocation'
import { Bell, CheckCircle2, X } from 'lucide-react'
import { socket } from './hooks/useMessageSubscription'
import { supabase } from './lib/supabaseClient'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import TrackShipment from './components/TrackShipment'
import Register from './components/Register'
import { applyColorMode, applyAccent } from './utils/themeUtils'


function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [statsData, setStatsData] = useState([])
  const [dashboardJobsData, setDashboardJobsData] = useState([])
  const [dashboardShipmentsData, setDashboardShipmentsData] = useState([])
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [isJobsLoading, setIsJobsLoading] = useState(false)
  const [isShipmentsLoading, setIsShipmentsLoading] = useState(false)

  // --- Notification System State ---
  const [inAppNotifications, setInAppNotifications] = useState([])
  const notificationAudio = useRef(null)

  // Initialize Audio
  useEffect(() => {
    notificationAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')
    notificationAudio.current.volume = 0.5
  }, [])

  // Wake up the backend server (on free tiers like Render/Railway it might be sleeping)
  useEffect(() => {
    const warmupServer = async () => {
      // Don't attempt to connect to localhost when running in production (Vercel)
      const serverUrl = import.meta.env.VITE_WEBSOCKET_URL || '';
      
      if (!serverUrl || serverUrl.includes('localhost')) {
        if (import.meta.env.PROD) {
          console.log('ℹ️ Messaging server URL not configured for production; skipping warmup.');
          return;
        }
      }

      try {
        console.log(`🔥 Warming up messaging server at: ${serverUrl}`);
        if (serverUrl) await fetch(`${serverUrl}/health`);
      } catch (err) {
        console.warn('⚠️ Server warmup ping failed (it might still be starting up)');
      }
    };
    warmupServer();
  }, []);

  // Refs for tracking authentication state
  const authListenerActiveRef = useRef(false);
  const authInitializedRef = useRef(false);
  const lastRedirectRef = useRef(0);

  const navigate = useNavigate()

  // Helper function to prevent rapid redirects
  const shouldRedirect = useCallback((targetPath) => {
    const now = Date.now();
    if (lastRedirectRef.current && now - lastRedirectRef.current < 500) {
      console.log('Redirect blocked - too soon after last redirect');
      return false;
    }
    lastRedirectRef.current = now;
    console.log('Redirect allowed to:', targetPath);
    return true;
  }, []);

  // Handle Real-time Job Notifications
  useEffect(() => {
    if (!user?.id) return

    const handleNewNotification = (data) => {
      console.log('🔔 New real-time notification:', data)
      
      // Play sound
      if (notificationAudio.current) {
        notificationAudio.current.play().catch(e => console.warn('Audio play blocked', e))
      }

      // Add to toast queue
      const id = Date.now()
      setInAppNotifications(prev => [...prev, { ...data, id }])

      // Auto-remove after 6 seconds
      setTimeout(() => {
        setInAppNotifications(prev => prev.filter(n => n.id !== id))
      }, 6000)
    }

    socket.emit('join', user.id)
    socket.on('new_notification', handleNewNotification)

    return () => {
      socket.off('new_notification', handleNewNotification)
    }
  }, [user?.id])

  // Enhanced local cleanup function
  const performLocalCleanup = useCallback(async () => {
    try {
      // Clear all Supabase-related storage
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });

      // Also clear sessionStorage
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          sessionStorage.removeItem(key);
        }
      });

      console.log('Local storage cleanup completed');
    } catch (cleanupError) {
      console.warn('Local cleanup error:', cleanupError);
    }
  }, []);

  // Fetch and apply user settings from Supabase
  const syncUserSettings = useCallback(async (currentUserId) => {
    if (!currentUserId) return;
    try {
      console.log('🔄 Syncing user settings from Supabase...');
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (error) {
        console.error('Error syncing user settings:', error);
        return;
      }

      if (data) {
        console.log('✅ Settings fetched:', data.theme, data.accent_color);
        if (data.theme) applyColorMode(data.theme);
        if (data.accent_color) applyAccent(data.accent_color);
        
        // Update local storage for immediate load on next visit
        localStorage.setItem('sf_color_mode', data.theme);
        localStorage.setItem('sf_accent_color', data.accent_color);
      } else {
        // Fallback to local storage if no settings in Supabase yet
        const localTheme = localStorage.getItem('sf_color_mode') || 'light';
        const localAccent = localStorage.getItem('sf_accent_color') || 'indigo';
        applyColorMode(localTheme);
        applyAccent(localAccent);
      }
    } catch (err) {
      console.error('syncUserSettings catch:', err);
    }
  }, []);

  // Ensure a profiles row exists for the authenticated user
  const ensureProfile = async (authUser) => {
    if (!authUser?.id) return;
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!existing) {
        console.log('Creating profile for user:', authUser.email);
        const { error } = await supabase.from('profiles').upsert({
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
          username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || '',
          avatar_url: authUser.user_metadata?.avatar_url || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) console.error('Error creating profile:', error);
        else console.log('Profile created successfully for', authUser.email);
      }
    } catch (err) {
      console.error('ensureProfile error:', err);
    }
  };

  // FIXED: Simplified authentication state management
  useEffect(() => {
    let mounted = true;
    let authSubscription = null;

    const getInitialSession = async () => {
      // Safety timeout: if getSession hangs, clear the loading screen after 5 seconds
      const timeoutId = setTimeout(() => {
        if (mounted && isLoading) {
          console.log('⏳ Session check timeout reached, clearing loading screen');
          setIsLoading(false);
        }
      }, 5000);

      try {
        setIsLoading(true);

        console.log('🔍 Checking initial session...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          console.error('Session error:', sessionError);
          setIsAuthenticated(false);
          setUser(null);
        } else if (session?.user) {
          console.log('✅ Valid session found for user:', session.user.email);
          setIsAuthenticated(true);
          setUser(session.user);
          authInitializedRef.current = true;
          localStorage.setItem('sf_token', session.access_token);
          localStorage.setItem('sf_user_email', session.user.email);
          // Ensure profile and sync settings in background
          ensureProfile(session.user).catch(console.error);
          syncUserSettings(session.user.id).catch(console.error);
        } else {
          console.log('ℹ️ No valid session found');
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        clearTimeout(timeoutId);
        if (mounted) setIsLoading(false);
      }
    };

    getInitialSession();

    // Auth state change listener — set up only once
    if (!authListenerActiveRef.current) {
      authListenerActiveRef.current = true;

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return;
          console.log('Auth state change:', event, 'Session exists:', !!session);

          switch (event) {
            case 'SIGNED_IN':
              if (session?.user) {
                console.log('🚀 User signed in:', session.user.email);
                setIsAuthenticated(true);
                setUser(session.user);
                setIsLoading(false);
                authInitializedRef.current = true;
                localStorage.setItem('sf_token', session.access_token);
                localStorage.setItem('sf_user_email', session.user.email);
                ensureProfile(session.user).catch(console.error);
                syncUserSettings(session.user.id).catch(console.error);

                const currentPath = window.location.pathname;
                if (['/login', '/forgot-password', '/register', '/'].includes(currentPath) &&
                    shouldRedirect('/dashboard')) {
                  navigate('/dashboard', { replace: true });
                }
              }
              break;

            case 'SIGNED_OUT':
              console.log('User signed out');
              await performLocalCleanup();
              setIsAuthenticated(false);
              setUser(null);
              setIsLoading(false);
              authInitializedRef.current = false;

              const signOutPath = window.location.pathname;
              if (!signOutPath.includes('/login') &&
                  !signOutPath.includes('/forgot-password') &&
                  !signOutPath.includes('/reset-password') &&
                  !signOutPath.startsWith('/track') &&
                  shouldRedirect('/login')) {
                navigate('/login', { replace: true });
              }
              break;

            case 'TOKEN_REFRESHED':
            case 'USER_UPDATED':
              if (session?.user) setUser(session.user);
              break;

            case 'PASSWORD_RECOVERY':
              console.log('Password recovery flow initiated');
              break;

            default:
              break;
          }
        }
      );

      authSubscription = subscription;
    }

    return () => {
      mounted = false;
      authListenerActiveRef.current = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);  // Empty deps — run only once on mount

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('User authenticated, fetching dashboard data...');
      fetchDashboardData();
    }
  }, [isAuthenticated]);

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      setError(null);
      await Promise.all([
        fetchStatsData(),
        fetchJobsData(),
        fetchShipmentsData()
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please try refreshing the page.');
    }
  };

  // Forgot Password function
  const handleForgotPassword = async (email) => {
    try {
      console.log('Sending password reset email to:', email);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Password reset error:', error);
        return { success: false, error: error.message };
      }

      console.log('Password reset email sent successfully');
      return { success: true };
    } catch (error) {
      console.error('Unexpected error in password reset:', error);
      return { success: false, error: 'Failed to send reset email. Please try again.' };
    }
  };

  // Reset Password function
  const handleResetPassword = async (password) => {
    try {
      console.log('Updating user password...');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('No valid session for password reset:', sessionError);
        return {
          success: false,
          error: 'Your reset session has expired. Please request a new reset link.'
        };
      }

      const { data, error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        console.error('Password update error:', error);
        return { success: false, error: error.message };
      }

      console.log('Password updated successfully:', data);
      await supabase.auth.signOut();

      return { success: true };
    } catch (error) {
      console.error('Unexpected error in password update:', error);
      return { success: false, error: 'Failed to update password. Please try again.' };
    }
  };

  // FIXED: Enhanced Supabase Login function with better session handling


  const handleLogin = async (email, password) => {
    try {
      setIsLoggingIn(true);
      setError(null);

      console.log('Attempting login with:', email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        console.error('Supabase login error:', error);
        return {
          success: false,
          error: error.message || 'Invalid email or password. Please try again.'
        };
      }

      if (data.session) {
        console.log('Login successful:', data.user.email);

        // Force session refresh and wait for auth state to update
        await supabase.auth.getSession();

        return { success: true };
      } else {
        return {
          success: false,
          error: 'Login failed. Please try again.'
        };
      }

    } catch (error) {
      console.error('Unexpected login error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred. Please try again.'
      };
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Enhanced Logout function
  const handleLogout = useCallback(async () => {
    try {
      console.log('Starting logout process...');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.log('Session check error:', sessionError);
      }

      if (!session) {
        console.log('No active session found, performing local cleanup');
      } else {
        console.log('Active session found, attempting Supabase logout');
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('Supabase logout failed:', error);
        } else {
          console.log('Supabase logout successful');
        }
      }

      await performLocalCleanup();
      setIsAuthenticated(false);
      setUser(null);
      authInitializedRef.current = false;

      if (shouldRedirect('/login')) {
        navigate('/login', { replace: true });
      }

      console.log('Logout process completed');

    } catch (error) {
      console.error('Unexpected error during logout:', error);
      await performLocalCleanup();
      setIsAuthenticated(false);
      setUser(null);
      authInitializedRef.current = false;
      if (shouldRedirect('/login')) {
        navigate('/login', { replace: true });
      }
    }
  }, [navigate, performLocalCleanup, shouldRedirect]);

  // Fetch stats data from Supabase
  const fetchStatsData = async () => {
    setIsStatsLoading(true);
    try {
      // Total shipments count
      const { count: totalShipments, error: shipmentsError } = await supabase
        .from('shipments')
        .select('*', { count: 'exact', head: true });

      // Jobs count
      const { count: jobsCount, error: jobsError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true });

      // Messages count — filtered by current user
      const currentUserId = user?.id;
      const { count: messagesCount, error: messagesError } = currentUserId
        ? await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
            .is('deleted_at', null)
        : { count: 0, error: null };

      // If you want to count only shipments with certain status as invoices
      // For example, count shipments with status 'Completed', 'Delivered', or 'Invoiced'
      const { count: invoicesCount, error: invoicesError } = await supabase
        .from('shipments')
        .select('*', { count: 'exact', head: true });

      // OR simpler: Just use the same as total shipments
      // const invoicesCount = totalShipments;

      if (shipmentsError || jobsError || invoicesError || messagesError) {
        console.error('Error fetching stats:', { shipmentsError, jobsError, invoicesError, messagesError });
        // Fallback to default values
        setStatsData([
          { label: 'Total Shipments', value: '0', icon: 'blue', id: 'total-shipments', path: '/new-shipment' },
          { label: 'Jobs', value: '0', icon: 'teal', id: 'Jobs', path: '/job-orders' },
          { label: 'Invoices', value: '0', icon: 'yellow', id: 'Invoices', path: '/invoices' },
          { label: 'Messages', value: '0', icon: 'red', id: 'Messages', path: '/messages' }
        ]);
        return;
      }

      const formatNumber = (num) => num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";

      setStatsData([
        { label: 'Total Shipments', value: formatNumber(totalShipments), icon: 'blue', id: 'total-shipments', path: '/new-shipment' },
        { label: 'Jobs', value: formatNumber(jobsCount), icon: 'teal', id: 'Jobs', path: '/job-orders' },
        { label: 'Invoices', value: formatNumber(invoicesCount || totalShipments), icon: 'yellow', id: 'Invoices', path: '/invoices' },
        { label: 'Messages', value: formatNumber(messagesCount), icon: 'red', id: 'Messages', path: '/messages' }
      ]);
    } catch (error) {
      console.error('Error in fetchStatsData:', error);
      setError('Failed to load statistics data.');
    } finally {
      setIsStatsLoading(false);
    }
  };
  // Fetch jobs data from Supabase
  const fetchJobsData = async () => {
    setIsJobsLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching jobs:', error);
        setDashboardJobsData([
          { id: 'JOB-001', customer: 'Acme Corp', status: 'In Progress', date: '2024-07-26' },
          { id: 'JOB-002', customer: 'Global Imports', status: 'Completed', date: '2024-07-25' },
          { id: 'JOB-003', customer: 'Tech Solutions', status: 'Pending', date: '2024-07-24' }
        ]);
        return;
      }

      console.log('Jobs data from Supabase:', data);

      const fetchJobs = data.map(job => ({
        id: job.job_no || 'N/A',
        customer: job.client || 'Unknown Customer',
        status: job.status || 'Unknown',
        date: job.job_date ? new Date(job.job_date).toLocaleDateString() : 'Unknown date'
      }));

      setDashboardJobsData(fetchJobs);
    } catch (error) {
      console.error('Error in fetchJobsData:', error);
      setError('Failed to load jobs data.');
    } finally {
      setIsJobsLoading(false);
    }
  };

  // Fetch shipments data from Supabase
  const fetchShipmentsData = async () => {
    setIsShipmentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching shipments:', error);
        setDashboardShipmentsData([
          { id: 'SHIP-12345', destination: 'New York', status: 'In Transit', date: '2024-07-26' },
          { id: 'SHIP-67890', destination: 'Los Angeles', status: 'Delivered', date: '2024-07-25' },
          { id: 'SHIP-11223', destination: 'Chicago', status: 'Processing', date: '2024-07-24' }
        ]);
        return;
      }

      console.log('Shipments data from Supabase:', data);

      const formattedData = data.map(shipment => ({
        id: shipment.id || shipment.shipment_id || shipment.tracking_number || 'N/A',
        destination: shipment.destination || shipment.to_address || shipment.delivery_address || 'Unknown Destination',
        status: shipment.status || 'Unknown',
        date: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : 'Unknown date'
      }));

      setDashboardShipmentsData(formattedData);
    } catch (error) {
      console.error('Error in fetchShipmentsData:', error);
      setError('Failed to load shipments data.');
    } finally {
      setIsShipmentsLoading(false);
    }
  };

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  const createNewShipment = useCallback(() => {
    navigate('/new-shipment');
  }, [navigate]);

  const creatActiveJob = useCallback(() => {
    navigate('/job-orders');
  }, [navigate]);

  // Dashboard Job Summary Component
  const DashboardJobsSummary = ({ jobs, onViewAll, isLoading }) => (
    <div className="card card-jobs">
      <div className="card-header">
        <h2>Recent Jobs</h2>
        <button className="view-all-btn" onClick={onViewAll}>View All</button>
      </div>
      <div className="summary-content">
        {isLoading ? (
          <div className="loading-message">Loading jobs...</div>
        ) : jobs && jobs.length > 0 ? (
          jobs.slice(0, 3).map(job => (
            <div key={job.id} className="summary-item">
              <div className="summary-info">
                <span className="summary-id">{job.id}</span>
                <span className="summary-customer">{job.customer}</span>
              </div>
              <div className="summary-status">
                <span className={`status-badge ${job.status.toLowerCase().replace(' ', '-')}`}>
                  {job.status}
                </span>
                <span className="summary-date">{job.date}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="no-data-message">No jobs found</div>
        )}
      </div>
    </div>
  );

  // Dashboard Shipments Summary Component
  const DashboardShipmentsSummary = ({ shipments, onViewAll, isLoading }) => (
    <div className="card card-shipments">
      <div className="card-header">
        <h2>Recent Shipments</h2>
        <button className="view-all-btn" onClick={onViewAll}>View All</button>
      </div>
      <div className="summary-content">
        {isLoading ? (
          <div className="loading-message">Loading shipments...</div>
        ) : shipments && shipments.length > 0 ? (
          shipments.slice(0, 3).map(shipment => (
            <div key={shipment.id} className="summary-item">
              <div className="summary-info">
                <span className="summary-id">{shipment.id}</span>
                <span className="summary-destination">{shipment.destination}</span>
              </div>
              <div className="summary-status">
                <span className={`status-badge ${shipment.status.toLowerCase().replace(' ', '-')}`}>
                  {shipment.status}
                </span>
                <span className="summary-date">{shipment.date}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="no-data-message">No shipments found</div>
        )}
      </div>
    </div>
  );

  // Dashboard component
  const Dashboard = () => (
    <>
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      <div className="page-container">
        <Header
          toggleMobileMenu={toggleMobileMenu}
          createNewShipment={createNewShipment}
          creatActiveJob={creatActiveJob}
          onLogout={handleLogout}
          user={user}
        />

        <div className="stats-grid">
          {isStatsLoading ? (
            <div className="loading-stats">Loading statistics...</div>
          ) : (
            statsData.map(stat => (
              <StatCard
                key={stat.id}
                label={stat.label}
                value={stat.value}
                iconType={stat.icon}
                id={stat.id}
                onClick={() => navigate(stat.path)}
              />
            ))
          )}
        </div>

        <div className="dashboard-summary-grid">
          <DashboardJobsSummary
            jobs={dashboardJobsData}
            onViewAll={() => navigate('/job-orders')}
            isLoading={isJobsLoading}
          />
          <DashboardShipmentsSummary
            shipments={dashboardShipmentsData}
            onViewAll={() => navigate('/new-shipment')}
            isLoading={isShipmentsLoading}
          />
        </div>
      </div>
    </>
  );


  // FIXED: Memoized ProtectedRoute to prevent unnecessary re-renders
  const ProtectedRoute = useCallback(({ children }) => {
    if (isLoading) {
      return (
        <div className="loading-container">
          <div className="loading-logo-wrapper">
            <img src={sealLogo} alt="Seal Freight" className="loading-logo-img" />
            <div className="loading-spinner" />
            <span className="loading-text">Loading…</span>
          </div>
        </div>
      );
    }

    const authPages = ['/login', '/forgot-password', '/reset-password'];
    const currentPath = window.location.pathname;

    if (currentPath === '/reset-password') {
      return children;
    }

    if (!isAuthenticated && !authPages.includes(currentPath) && !currentPath.startsWith('/track')) {
      return <Navigate to="/login" replace />;
    }

    return children;
  }, [isLoading, isAuthenticated]);

  // Placeholder components for other routes
  const ShipmentsPage = () => (
    <div className="page-container">
      <h1>Shipments Management</h1>
      <p>Track and manage all your shipments here.</p>
    </div>
  );

  const SettingsPage = () => (
    <div className="page-container">
      <h1>Settings</h1>
      <p>Configure your application settings and preferences.</p>
    </div>
  );

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-logo-wrapper">
          <img src={sealLogo} alt="Seal Freight" className="loading-logo-img" />
          <div className="loading-spinner" />
          <span className="loading-text">Loading Application…</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* ── Auth routes — full screen, no sidebar ── */}
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to="/dashboard" replace />
            : <Login onLogin={handleLogin} />
        }
      />
      <Route
        path="/forgot-password"
        element={
          isAuthenticated
            ? <Navigate to="/dashboard" replace />
            : <ForgotPassword onResetPassword={handleForgotPassword} />
        }
      />
      <Route
        path="/reset-password"
        element={<ResetPassword onUpdatePassword={handleResetPassword} />}
      />
      <Route
        path="/register"
        element={
          isAuthenticated
            ? <Navigate to="/dashboard" replace />
            : <Register onLogin={handleLogin} />
        }
      />
      <Route
        path="/track/:id"
        element={<TrackShipment />}
      />
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
      />

      {/* ── Authenticated routes — with sidebar ── */}
      <Route
        path="/*"
        element={
          <div className="dashboard-container">
            {isAuthenticated && (
              <Sidebar
                mobileMenuOpen={mobileMenuOpen}
                toggleMobileMenu={toggleMobileMenu}
                onLogout={handleLogout}
                user={user}
              />
            )}
            <main className="main-content">
              {error && (
                <div className="error-banner">
                  <span>{error}</span>
                  <button onClick={() => setError(null)}>×</button>
                </div>
              )}
              <Routes>
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/vendors" element={<ProtectedRoute><CustomerPage partnerType="vendor" /></ProtectedRoute>} />
                <Route path="/customers" element={<ProtectedRoute><CustomerPage partnerType="customer" /></ProtectedRoute>} />
                <Route path="/new-shipment" element={<ProtectedRoute><NewShipments /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings user={user} /></ProtectedRoute>} />
                <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
                <Route path="/tracking" element={<ProtectedRoute><ShipmentTracking /></ProtectedRoute>} />
                <Route path="/payments" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
                <Route path="/dsr" element={<ProtectedRoute><DSRPage /></ProtectedRoute>} />
                <Route path="/job-orders" element={<ProtectedRoute><ActiveJob /></ProtectedRoute>} />
                <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
                <Route path="/job-allocation" element={<ProtectedRoute><JobAllocation user={user} /></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute><MessagesMain user={user} key={user?.id} /></ProtectedRoute>} />
                <Route path="*" element={
                  <div className="page-container">
                    <h1>404 - Page Not Found</h1>
                    <p>The page you&apos;re looking for doesn&apos;t exist.</p>
                    <button onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
                  </div>
                } />
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
