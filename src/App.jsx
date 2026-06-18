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
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom'
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
import { Bell, CheckCircle2, X, AlertTriangle, Briefcase, Ship } from 'lucide-react'
import { socket } from './hooks/useMessageSubscription'
import { supabase } from './lib/supabaseClient'
import { useNetworkState } from './hooks/useNetworkState'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import TrackShipment from './components/TrackShipment'
import Register from './components/Register'
import { applyColorMode, applyAccent } from './utils/themeUtils'
import MarkAttendance from './components/MarkAttendance'
import AdminDashboard from './components/AdminDashboard'
import AttendanceStats from './components/AttendanceStats'
import GlobalJobForm from './components/GlobalJobForm'
import GlobalShipmentForm from './components/GlobalShipmentForm'
import GlobalCustomerForm from './components/GlobalCustomerForm'
import GlobalEnquiryForm from './components/JobEnquiryForm'
import JobEnquiryPage from './components/JobEnquiryPage'
import GlobalNotificationBell from './components/GlobalNotificationBell'
import Dashboard from './components/Dashboard'


function App() {
  const location = useLocation()
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

  // --- Attendance Reminder System ---
  const [showAttendanceAlert, setShowAttendanceAlert] = useState(false)
  const [attendanceAlertMessage, setAttendanceAlertMessage] = useState('')


  // --- Notification System State ---
  const [inAppNotifications, setInAppNotifications] = useState([])
  const notificationAudio = useRef(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // --- Network & Data Safety ---
  const isOffline = useNetworkState();

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Check if there are active forms in session storage
      try {
        const jobsRaw = sessionStorage.getItem('job_forms_v1');
        const enqRaw = sessionStorage.getItem('enquiry_forms_v1');
        const jobs = jobsRaw ? JSON.parse(jobsRaw) : [];
        const enqs = enqRaw ? JSON.parse(enqRaw) : [];

        if (jobs.length > 0 || enqs.length > 0) {
          e.preventDefault();
          e.returnValue = 'You have unsaved forms open. Are you sure you want to leave?';
          return e.returnValue;
        }
      } catch (err) {
        // Ignored
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Initialize and Unlock Audio (Browsers require a user gesture to play sound)
  useEffect(() => {
    // Current notification sound from mixkit (might be blocked by some ISPs)
    const soundUrl = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'
    notificationAudio.current = new Audio(soundUrl)
    notificationAudio.current.volume = 0.5

    const unlockAudio = () => {
      if (notificationAudio.current && !audioUnlocked) {
        // 'Prime' the audio element for later use
        notificationAudio.current.play()
          .then(() => {
            notificationAudio.current.pause()
            notificationAudio.current.currentTime = 0
            setAudioUnlocked(true)
            console.log('🔊 Audio system unlocked by user gesture')
            window.removeEventListener('click', unlockAudio)
          })
          .catch(err => console.warn('🔇 Audio unlock failed:', err))
      }
    }

    window.addEventListener('click', unlockAudio)
    return () => window.removeEventListener('click', unlockAudio)
  }, [audioUnlocked])

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
        if (serverUrl) await fetch(`${serverUrl}/api/health`);
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
  const fetchDashboardDataRef = useRef(null);

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

  const triggerGlobalToast = useCallback((data) => {
    console.log('🔔 New global alert:', data);

    // Play notification sound
    if (notificationAudio.current) {
      notificationAudio.current.play().catch(e => console.warn('Audio play blocked', e));
    }

    // Add to toast queue
    const id = Date.now();
    setInAppNotifications(prev => [...prev, { ...data, id, timestamp: new Date().toISOString() }]);

    // Auto-remove after 6 seconds
    setTimeout(() => {
      setInAppNotifications(prev => prev.filter(n => n.id !== id));
    }, 6000);
  }, []);

  // Handle Real-time Job Notifications + Global Message Banner via WebSocket
  useEffect(() => {
    if (!user?.id) return

    socket.emit('join', user.id)

    // Show banner when a message arrives via WebSocket (works even if Supabase Realtime is off)
    const handleReceiveMessage = (msg) => {
      // Only show banner if the message is for this user and not from this user
      if (msg.receiver_id === user.id && msg.sender_id !== user.id) {
        console.log('📩 WebSocket message received, showing banner:', msg)
        triggerGlobalToast({
          title: '💬 New Message',
          message: msg.content || 'You have a new message',
          type: 'success'
        })
        // Also refresh dashboard stats to update message count
        if (fetchDashboardDataRef.current) fetchDashboardDataRef.current()
      }
    }

    socket.on('receive_message', handleReceiveMessage)

    return () => {
      socket.off('receive_message', handleReceiveMessage)
    }
  }, [user?.id, triggerGlobalToast])

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


  // --- Real-time Notifications Listener ---
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      console.log('🔌 Setting up real-time notification listener for user:', user.id);

      // Listen to backend socket (if available)
      socket.on('new_notification', triggerGlobalToast);

      // Listen to Supabase notifications table directly for cross-device floating popups
      const notifChannel = supabase
        .channel(`global-app-notifications-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          // Trigger the floating toast
          triggerGlobalToast({
            title: payload.new.title || 'Notification',
            message: payload.new.message || '',
            type: payload.new.type || 'info'
          });
          // Notify the Header bell icon (if it's mounted)
          window.dispatchEvent(new CustomEvent('new_app_notification', { detail: payload.new }));
        })
        .subscribe();

      return () => {
        socket.off('new_notification', triggerGlobalToast);
        supabase.removeChannel(notifChannel);
      };
    }
  }, [isAuthenticated, user?.id, triggerGlobalToast]);

  // --- Attendance Reminder System ---
  useEffect(() => {
    if (!isAuthenticated || !user?.email) return;

    let intervalId = null;
    let employeeId = null;
    let officeStart = null;

    const checkAttendance = async () => {
      try {
        if (!employeeId) {
          const { data: emp } = await supabase
            .from('employees')
            .select('id')
            .ilike('email', user.email)
            .maybeSingle();

          if (!emp) return;
          employeeId = emp.id;

          let empStart = null;
          const { data: empConf } = await supabase
            .from('employee_office_config')
            .select('start_time')
            .eq('employee_id', employeeId)
            .maybeSingle();

          if (empConf?.start_time) {
            empStart = empConf.start_time;
          } else {
            const { data: globConf } = await supabase
              .from('office_config')
              .select('start_time')
              .eq('id', 1)
              .maybeSingle();
            if (globConf?.start_time) {
              empStart = globConf.start_time;
            }
          }
          officeStart = empStart;
        }

        if (!employeeId || !officeStart) return;

        const todayStr = new Date().toLocaleDateString('en-CA');
        const { data: attData } = await supabase
          .from('attendance')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('date', todayStr)
          .maybeSingle();

        if (attData) {
          // Already marked today
          setShowAttendanceAlert(false);
          if (intervalId) clearInterval(intervalId);
          return;
        }

        const now = new Date();
        const [hStart, mStart, sStart] = officeStart.split(':').map(Number);
        const startTarget = new Date();
        startTarget.setHours(hStart, mStart, sStart || 0, 0);

        const endTarget = new Date();
        endTarget.setHours(12, 0, 0, 0);

        if (now >= startTarget && now <= endTarget) {
          setShowAttendanceAlert(true);
          setAttendanceAlertMessage('Reminder: Please mark your attendance for today!');
          if (notificationAudio.current) {
            notificationAudio.current.play().catch(e => console.warn('Audio play blocked', e));
          }
        } else {
          setShowAttendanceAlert(false);
        }
      } catch (err) {
        console.error('Attendance check error:', err);
      }
    };

    checkAttendance();
    intervalId = setInterval(checkAttendance, 5 * 60 * 1000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAuthenticated, user?.email]);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('User authenticated, fetching dashboard data...');
      if (fetchDashboardDataRef.current) fetchDashboardDataRef.current();

      // Listen for local form saves to update dashboard instantly
      const handleLocalRefresh = () => { if (fetchDashboardDataRef.current) fetchDashboardDataRef.current() };
      window.addEventListener('job_data_updated', handleLocalRefresh);
      window.addEventListener('shipment_data_updated', handleLocalRefresh);
      window.addEventListener('refresh_customer_list', handleLocalRefresh);

      // --- REAL-TIME DASHBOARD SYNC ---
      // Listen to ANY changes in job enquiries or jobs to keep the dashboard counts/lists fresh
      console.log('📡 Setting up global dashboard sync...');
      const dashChannel = supabase
        .channel('dashboard-global-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'job_enquiries' }, (payload) => {
          console.log('🔄 Job Enquiry change detected, refreshing dashboard...', payload.eventType);
          if (payload.eventType === 'INSERT') {
            triggerGlobalToast({
              title: 'New Job Enquiry',
              message: `Enquiry ${payload.new.enquiry_no || ''} was created.`,
              type: 'info'
            });
          } else if (payload.eventType === 'UPDATE') {
            triggerGlobalToast({
              title: 'Job Enquiry Updated',
              message: `Enquiry ${payload.new.enquiry_no || ''} was updated.`,
              type: 'info'
            });
          }
          if (fetchDashboardDataRef.current) fetchDashboardDataRef.current();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, (payload) => {
          console.log('🔄 Job change detected, refreshing dashboard...', payload.eventType);
          if (payload.eventType === 'INSERT') {
            triggerGlobalToast({
              title: 'New Job Created',
              message: `Job ${payload.new.job_no || ''} was created.`,
              type: 'success'
            });
          } else if (payload.eventType === 'UPDATE') {
            triggerGlobalToast({
              title: 'Job Updated',
              message: `Job ${payload.new.job_no || ''} updated to ${payload.new.status || 'new status'}.`,
              type: 'info'
            });
          }
          if (fetchDashboardDataRef.current) fetchDashboardDataRef.current();
        })
        .subscribe((status) => {
          console.log('📡 Dashboard sync channel status:', status);
        });

      // --- REAL-TIME MESSAGES SYNC ---
      const messagesChannel = supabase
        .channel('global-messages-sync')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        }, (payload) => {
          console.log('🔄 New global message detected!');
          triggerGlobalToast({
            title: 'New Message Received',
            message: payload.new.content || 'You have a new message',
            type: 'success'
          });
          if (fetchDashboardDataRef.current) fetchDashboardDataRef.current(); // Update message count on dashboard
        })
        .subscribe((status) => {
          console.log('📡 Messages sync channel status:', status);
        });

      return () => {
        supabase.removeChannel(dashChannel);
        supabase.removeChannel(messagesChannel);
        window.removeEventListener('job_data_updated', handleLocalRefresh);
        window.removeEventListener('shipment_data_updated', handleLocalRefresh);
        window.removeEventListener('refresh_customer_list', handleLocalRefresh);
      };
    }
  }, [isAuthenticated, triggerGlobalToast, user?.id]);

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

  useEffect(() => {
    fetchDashboardDataRef.current = fetchDashboardData;
  });

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
      // Job Enquiries count
      const { count: totalEnquiries, error: enquiriesError } = await supabase
        .from('job_enquiries')
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

      if (enquiriesError || jobsError || invoicesError || messagesError) {
        console.error('Error fetching stats:', { enquiriesError, jobsError, invoicesError, messagesError });
        const cached = localStorage.getItem('cache_dashboard_stats');
        if (cached) {
          setStatsData(JSON.parse(cached));
        } else {
          // Fallback to default values
          setStatsData([
            { label: 'Job Enquiries', value: '0', icon: 'blue', id: 'total-enquiries', path: '/job-enquiry' },
            { label: 'Jobs', value: '0', icon: 'teal', id: 'Jobs', path: '/job-orders' },
            { label: 'Invoices', value: '0', icon: 'yellow', id: 'Invoices', path: '/invoices' },
            { label: 'Messages', value: '0', icon: 'red', id: 'Messages', path: '/messages' }
          ]);
        }
        return;
      }

      const formatNumber = (num) => num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";

      const newStats = [
        { label: 'Job Enquiries', value: formatNumber(totalEnquiries), icon: 'blue', id: 'total-enquiries', path: '/job-enquiry', trend: '+18.2%' },
        { label: 'Jobs', value: formatNumber(jobsCount), icon: 'teal', id: 'Jobs', path: '/job-orders', trend: '+12.5%' },
        { label: 'Invoices', value: formatNumber(invoicesCount || 0), icon: 'yellow', id: 'Invoices', path: '/invoices', trend: '-3.1%' },
        { label: 'Messages', value: formatNumber(messagesCount), icon: 'red', id: 'Messages', path: '/messages', trend: '+8.7%' }
      ];
      localStorage.setItem('cache_dashboard_stats', JSON.stringify(newStats));
      setStatsData(newStats);
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
        const cached = localStorage.getItem('cache_dashboard_jobs');
        if (cached) {
          setDashboardJobsData(JSON.parse(cached));
        } else {
          setDashboardJobsData([]);
        }
        return;
      }

      console.log('Jobs data from Supabase:', data);

      const fetchJobs = data.map(job => ({
        id: job.job_no || 'N/A',
        customer: job.client || 'Unknown Customer',
        status: job.status || 'Unknown',
        date: job.job_date ? new Date(job.job_date).toLocaleDateString() : 'Unknown date'
      }));

      localStorage.setItem('cache_dashboard_jobs', JSON.stringify(fetchJobs));
      setDashboardJobsData(fetchJobs);
    } catch (error) {
      console.error('Error in fetchJobsData:', error);
      setError('Failed to load jobs data.');
    } finally {
      setIsJobsLoading(false);
    }
  };

  // Fetch job enquiries data from Supabase for dashboard
  const fetchShipmentsData = async () => {
    setIsShipmentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_enquiries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching job enquiries:', error);
        const cached = localStorage.getItem('cache_dashboard_enquiries');
        if (cached) {
          setDashboardShipmentsData(JSON.parse(cached));
        } else {
          setDashboardShipmentsData([]);
        }
        return;
      }

      console.log('Job Enquiries data from Supabase:', data);

      const formattedData = data.map(enquiry => ({
        id: enquiry.enquiry_no || enquiry.id || 'N/A',
        destination: enquiry.customer_name || 'Unknown Customer',
        status: enquiry.status || 'Unknown',
        date: enquiry.enquiry_date ? new Date(enquiry.enquiry_date).toLocaleDateString() : 'Unknown date'
      }));

      localStorage.setItem('cache_dashboard_enquiries', JSON.stringify(formattedData));
      setDashboardShipmentsData(formattedData);
    } catch (error) {
      console.error('Error in fetchShipmentsData:', error);
      setError('Failed to load job enquiries data.');
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

  // Dashboard component moved to src/components/Dashboard.jsx


  // FIXED: Memoized ProtectedRoute to prevent unnecessary re-renders
  const ProtectedRoute = useCallback(({ children }) => {
    if (isLoading) {
      return (
        <div className="loading-container">
          <div className="loading-logo-wrapper">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={sealLogo} alt='Seal Logistics Logo' style={{ height: '40px', marginRight: '15px' }} /><span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5', marginBottom: '20px' }}>Seal Logistics</span></div>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={sealLogo} alt='Seal Logistics Logo' style={{ height: '40px', marginRight: '15px' }} /><span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5', marginBottom: '20px' }}>Seal Logistics</span></div>
          <div className="loading-spinner" />
          <span className="loading-text">Loading Application…</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {isOffline && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#ef4444', color: 'white', padding: '10px 24px',
          borderRadius: 30, zIndex: 999999, display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 10px 25px rgba(239, 68, 68, 0.4)', fontWeight: 600, fontSize: 14,
          animation: 'pageIn 0.3s ease-out'
        }}>
          <AlertTriangle size={18} />
          You are currently offline. Working in offline mode.
        </div>
      )}
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

                {showAttendanceAlert && (
                  <div style={{
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#ef4444', color: 'white', padding: '1rem 2rem',
                    borderRadius: '12px', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', gap: '12px',
                    fontWeight: '600'
                  }}>
                    <AlertTriangle size={24} className="animate-pulse" />
                    <span>{attendanceAlertMessage}</span>
                    <button
                      onClick={() => {
                        setShowAttendanceAlert(false);
                        navigate('/attendance');
                      }}
                      style={{
                        marginLeft: '1rem', padding: '0.5rem 1rem', background: 'white',
                        color: '#ef4444', border: 'none', borderRadius: '6px',
                        cursor: 'pointer', fontWeight: 'bold'
                      }}
                    >
                      Mark Now
                    </button>
                    <button
                      onClick={() => setShowAttendanceAlert(false)}
                      style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '0.5rem' }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}

                <Routes>
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard 
                    error={error} setError={setError} 
                    toggleMobileMenu={toggleMobileMenu} 
                    createNewShipment={createNewShipment} 
                    creatActiveJob={creatActiveJob} 
                    handleLogout={handleLogout} 
                    user={user} 
                    isStatsLoading={isStatsLoading} 
                    statsData={statsData} 
                    navigate={navigate} 
                    dashboardJobsData={dashboardJobsData} 
                    dashboardShipmentsData={dashboardShipmentsData} 
                    isJobsLoading={isJobsLoading} 
                    isShipmentsLoading={isShipmentsLoading} 
                  /></ProtectedRoute>} />
                  <Route path="/vendors" element={<ProtectedRoute><CustomerPage partnerType="vendor" /></ProtectedRoute>} />
                  <Route path="/customers" element={<ProtectedRoute><CustomerPage partnerType="customer" /></ProtectedRoute>} />
                  <Route path="/new-shipment" element={<ProtectedRoute><NewShipments /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings user={user} /></ProtectedRoute>} />
                  <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
                  <Route path="/tracking" element={<ProtectedRoute><ShipmentTracking /></ProtectedRoute>} />
                  <Route path="/payments" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
                  <Route path="/dsr" element={<ProtectedRoute><DSRPage /></ProtectedRoute>} />
                  <Route path="/job-enquiry" element={<ProtectedRoute><JobEnquiryPage /></ProtectedRoute>} />
                  <Route path="/job-orders" element={<ProtectedRoute><ActiveJob /></ProtectedRoute>} />
                  <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
                  <Route path="/job-allocation" element={<ProtectedRoute><JobAllocation user={user} /></ProtectedRoute>} />
                  <Route path="/messages" element={<ProtectedRoute><MessagesMain user={user} key={user?.id} /></ProtectedRoute>} />
                  <Route path="/attendance" element={<ProtectedRoute><MarkAttendance onBack={() => navigate('/dashboard')} /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute><AdminDashboard onBack={() => navigate('/dashboard')} /></ProtectedRoute>} />
                  <Route path="/admin/stats" element={<ProtectedRoute><AttendanceStats onBack={() => navigate('/admin')} /></ProtectedRoute>} />
                  <Route path="*" element={
                    <div className="page-container">
                      <h1>404 - Page Not Found</h1>
                      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
                      <button onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
                    </div>
                  } />
                </Routes>
              </main>
              {isAuthenticated && <GlobalJobForm />}
              {isAuthenticated && <GlobalShipmentForm />}
              {isAuthenticated && <GlobalCustomerForm />}
              {isAuthenticated && <GlobalEnquiryForm />}
              {isAuthenticated && location.pathname !== '/dashboard' && <GlobalNotificationBell user={user} />}
            </div>
          }
        />
      </Routes>

      {/* Global Floating Notifications (WhatsApp-style toast at top-right) */}
      {inAppNotifications.length > 0 && (
        <div className="gnb-toast-container">
          {inAppNotifications.map(notification => (
            <div key={notification.id} className="gnb-toast">
              <div className="gnb-toast-icon">
                <CheckCircle2 size={18} color="#10b981" />
              </div>
              <div className="gnb-toast-body">
                <h4>{notification.title}</h4>
                <p>{notification.message}</p>
              </div>
              <button className="gnb-toast-close" onClick={() => setInAppNotifications(prev => prev.filter(n => n.id !== notification.id))}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default App;
