import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { MapPin, Camera, RefreshCw, CheckCircle, AlertTriangle, ArrowLeft, MoveLeft, MoveRight, MoveUp, MoveDown, Clock } from 'lucide-react';
import './MarkAttendance.css';

export default function MarkAttendance({ onBack }) {
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [geofenceStatus, setGeofenceStatus] = useState(null); // 'checking', 'success', 'blocked'
  const [geofenceError, setGeofenceError] = useState('');
  const [officeStartTime, setOfficeStartTime] = useState(null);
  const [timeUntilStart, setTimeUntilStart] = useState(-1);
  
  // Camera & Face Mesh States
  const [cameraActive, setCameraActive] = useState(false);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [faceLock, setFaceLock] = useState('searching'); // 'searching', 'locked', 'success', 'failed'
  const [currentDirection, setCurrentDirection] = useState('');
  const [livenessProgress, setLivenessProgress] = useState(0); // 0 to 100
  const [livenessTimer, setLivenessTimer] = useState(15);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // 'success', 'failed'
  const [verifyMessage, setVerifyMessage] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Refs for camera & drawing canvas - critical: use refs for mutable state 
  // so the MediaPipe onResults callback always sees the latest values
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const baselineRef = useRef(null);
  const activeStreamRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const faceMeshInstanceRef = useRef(null);
  const mediapipeCameraRef = useRef(null);

  // Use refs for face state so onResults callback always gets latest
  const faceLockRef = useRef('searching');
  const directionRef = useRef('');
  const isVerifyingRef = useRef(false);
  const cameraActiveRef = useRef(false);

  const DIRECTIONS = ['LEFT', 'UP', 'RIGHT', 'DOWN'];

  // Sync refs with state
  useEffect(() => { faceLockRef.current = faceLock; }, [faceLock]);
  useEffect(() => { directionRef.current = currentDirection; }, [currentDirection]);
  useEffect(() => { isVerifyingRef.current = isVerifying; }, [isVerifying]);
  useEffect(() => { cameraActiveRef.current = cameraActive; }, [cameraActive]);

  // Countdown Timer
  useEffect(() => {
    if (!officeStartTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      const [h, m, s] = officeStartTime.split(':').map(Number);
      const target = new Date();
      target.setHours(h, m, s || 0, 0);
      
      const diffMs = target.getTime() - now.getTime();
      if (diffMs > 0) {
        setTimeUntilStart(Math.ceil(diffMs / 1000));
      } else {
        setTimeUntilStart(0);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [officeStartTime]);

  // Load current user profile from Supabase
  useEffect(() => {
    const fetchProfile = async () => {
      setProfileLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const email = session.user.email || '';
        setUserEmail(email);
        console.log('[Attendance] Logged-in email:', email);

        // Case-insensitive employee lookup
        const { data, error: empErr } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', email)
          .maybeSingle();

        console.log('[Attendance] Employee lookup result:', data, empErr);
        setUserProfile(data);
        
        if (data && data.id) {
          let empStart = null;
          const { data: empConf } = await supabase
            .from('employee_office_config')
            .select('start_time')
            .eq('employee_id', data.id)
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
          if (empStart) {
            setOfficeStartTime(empStart);
            const now = new Date();
            const [h, m, s] = empStart.split(':').map(Number);
            const target = new Date();
            target.setHours(h, m, s || 0, 0);
            const diffMs = target.getTime() - now.getTime();
            if (diffMs > 0) {
              setTimeUntilStart(Math.ceil(diffMs / 1000));
            } else {
              setTimeUntilStart(0);
            }
          } else {
            setTimeUntilStart(0);
          }
        }

        // Prevent double face scanning by checking if already marked today
        if (data && data.id) {
          const todayStr = new Date().toLocaleDateString('en-CA');
          const { data: attData } = await supabase
            .from('attendance')
            .select('id, marked_at')
            .eq('employee_id', data.id)
            .eq('date', todayStr)
            .maybeSingle();
            
          if (attData) {
             const timeStr = new Date(attData.marked_at).toLocaleTimeString();
             setVerifyResult('success');
             setVerifyMessage(`You have already marked your attendance for today at ${timeStr}.`);
             // Bypass geofence check loading completely since they already did it earlier
             setGeofenceStatus('success');
             setProfileLoading(false);
             return;
          }
        }
      }
      setProfileLoading(false);
    };
    fetchProfile();
  }, []);

  // Haversine distance calculation (meters)
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Capture GPS coordinates and verify against Supabase office config
  const handleGPSCheck = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);
    setGeofenceStatus('checking');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setGpsData({ lat, lng });
        setGpsLoading(false);

        console.log('[Geofence] User GPS:', { lat, lng });
        console.log('[Geofence] userProfile:', userProfile?.id, userProfile?.name, userProfile?.email);

        try {
          let office = null;
          let configSource = 'none';

          // Check for employee-specific geofence config
          if (userProfile?.id) {
            const { data: empConf, error: empErr } = await supabase
              .from('employee_office_config')
              .select('*')
              .eq('employee_id', userProfile.id)
              .maybeSingle();
            console.log('[Geofence] employee_office_config lookup (id=' + userProfile.id + '):', empConf, empErr);
            if (empConf) {
              office = empConf;
              configSource = 'employee_office_config';
            }
          }

          // Fall back to global config
          if (!office) {
            const { data: globalConf, error: globalErr } = await supabase
              .from('office_config')
              .select('*')
              .eq('id', 1)
              .maybeSingle();
            console.log('[Geofence] office_config (global) lookup:', globalConf, globalErr);
            if (globalConf) {
              office = globalConf;
              configSource = 'office_config (global)';
            }
          }

          if (!office) {
            console.warn('[Geofence] No office config found, allowing attendance.');
            setGeofenceStatus('success');
            return;
          }

          console.log('[Geofence] Using config from:', configSource);
          console.log('[Geofence] Office coords:', { lat: office.lat, lng: office.lng, radius: office.radius_meters });

          const distance = haversineDistance(lat, lng, office.lat, office.lng);
          const radius = office.radius_meters || 100;

          console.log('[Geofence] Distance:', distance.toFixed(1), 'm | Radius:', radius, 'm | Pass:', distance <= radius);

          if (distance <= radius) {
            setGeofenceStatus('success');
          } else {
            setGeofenceStatus('blocked');
            setGeofenceError(
              `Out of Office Bounds (Distance: ${distance.toFixed(1)}m from office). Must be within ${radius}m.\n` +
              `Your GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n` +
              `Office GPS (${configSource}): ${office.lat.toFixed(6)}, ${office.lng.toFixed(6)}`
            );
          }
        } catch (err) {
          console.error('Geofence check error:', err);
          setGeofenceStatus('blocked');
          setGeofenceError(err.message || 'Error checking geofence.');
        }
      },
      (err) => {
        setGpsLoading(false);
        setGeofenceStatus('blocked');
        setGpsError('Location permission denied. Please enable GPS permissions.');
        console.error(err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [userProfile]);

  // Start geofence capture automatically for Office Staff
  useEffect(() => {
    if (userProfile) {
      if (userProfile.role === 'office') {
        handleGPSCheck();
      } else {
        setGeofenceStatus('success');
      }
    }
  }, [userProfile, handleGPSCheck]);

  // Load MediaPipe scripts dynamically
  useEffect(() => {
    if (geofenceStatus !== 'success' || verifyResult === 'success') return;

    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    Promise.all([
      loadScript('https://unpkg.com/@mediapipe/camera_utils/camera_utils.js'),
      loadScript('https://unpkg.com/@mediapipe/face_mesh/face_mesh.js')
    ])
      .then(() => {
        setScriptsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load MediaPipe libraries:', err);
      });
  }, [geofenceStatus]);

  // Stop camera stream - stable function
  const stopCamera = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    setCameraActive(false);
    cameraActiveRef.current = false;
    clearInterval(timerIntervalRef.current);
    if (mediapipeCameraRef.current) {
      try { mediapipeCameraRef.current.stop(); } catch(e) {}
      mediapipeCameraRef.current = null;
    }
    if (faceMeshInstanceRef.current) {
      try { faceMeshInstanceRef.current.close(); } catch(e) {}
      faceMeshInstanceRef.current = null;
    }
  }, []);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    // Clean up any existing instance first
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        activeStreamRef.current = stream;
        setCameraActive(true);
        cameraActiveRef.current = true;
        setFaceLock('searching');
        faceLockRef.current = 'searching';
        setVerifyResult(null);
        setIsVerifying(false);
        isVerifyingRef.current = false;
        baselineRef.current = null;
        
        // Pick a random challenge direction
        const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        setCurrentDirection(dir);
        directionRef.current = dir;
        setLivenessProgress(0);
        setLivenessTimer(15);
      }
    } catch (err) {
      console.error('Camera stream access failed:', err);
    }
  }, [stopCamera]);

  // Trigger camera start when scripts load
  useEffect(() => {
    if (scriptsLoaded && geofenceStatus === 'success' && verifyResult !== 'success' && timeUntilStart === 0) {
      startCamera();
    }
    return () => {
      // Cleanup on unmount, but ensure it doesn't break React strict mode fast-refresh
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [scriptsLoaded, geofenceStatus, verifyResult, startCamera, timeUntilStart]);

  // Start the 15-second countdown once face is locked
  useEffect(() => {
    if (faceLock === 'locked') {
      setLivenessTimer(15);
      timerIntervalRef.current = setInterval(() => {
        setLivenessTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setFaceLock('failed');
            faceLockRef.current = 'failed';
            setVerifyMessage('Liveness verification timed out. Please try again.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [faceLock]);

  // Capture frame & verify with FastAPI Python Backend
  const handleFaceMatchVerification = useCallback(async () => {
    if (isVerifyingRef.current) return;
    setIsVerifying(true);
    isVerifyingRef.current = true;
    setVerifyMessage('Analyzing face signature...');

    // Draw current camera frame to a hidden canvas
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    }

    // Convert Canvas frame to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsVerifying(false);
        isVerifyingRef.current = false;
        setFaceLock('failed');
        faceLockRef.current = 'failed';
        setVerifyMessage('Failed to capture camera frame. Please reload.');
        return;
      }

      try {
        // Refresh session to ensure a fresh, valid token before biometric call
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        
        if (sessionErr || !session?.access_token) {
          // Try refreshing the session explicitly
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (refreshErr || !refreshData?.session?.access_token) {
            setVerifyResult('failed');
            setVerifyMessage('Session expired. Please go back and sign in again.');
            setFaceLock('failed');
            faceLockRef.current = 'failed';
            setIsVerifying(false);
            isVerifyingRef.current = false;
            return;
          }
          // Use the refreshed session
          var activeToken = refreshData.session.access_token;
        } else {
          var activeToken = session.access_token;
        }

        const formData = new FormData();
        formData.append('image', blob, 'face_capture.jpg');
        formData.append('direction_used', directionRef.current);
        if (gpsData) {
          formData.append('latitude', gpsData.lat);
          formData.append('longitude', gpsData.lng);
        }

        const response = await fetch(`${import.meta.env.VITE_BIOMETRIC_API_URL}/api/face-match`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeToken}`
          },
          body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
          setVerifyResult('success');
          setVerifyMessage(result.message || 'Attendance logged successfully.');
          stopCamera();
        } else if (response.status === 401) {
          // Auth-specific failure — try one more time with a force-refreshed token
          console.warn('[FaceMatch] 401 received, attempting token refresh...');
          const { data: retryRefresh } = await supabase.auth.refreshSession();
          if (retryRefresh?.session?.access_token) {
            const retryResponse = await fetch(`${import.meta.env.VITE_BIOMETRIC_API_URL}/api/face-match`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${retryRefresh.session.access_token}` },
              body: formData
            });
            const retryResult = await retryResponse.json();
            if (retryResponse.ok && retryResult.success) {
              setVerifyResult('success');
              setVerifyMessage(retryResult.message || 'Attendance logged successfully.');
              stopCamera();
            } else {
              setVerifyResult('failed');
              setVerifyMessage(retryResult.detail || 'Verification failed after token refresh. Please sign out and try again.');
              setFaceLock('failed');
              faceLockRef.current = 'failed';
            }
          } else {
            setVerifyResult('failed');
            setVerifyMessage('Authentication expired. Please sign out and sign in again.');
            setFaceLock('failed');
            faceLockRef.current = 'failed';
          }
        } else {
          setVerifyResult('failed');
          setVerifyMessage(result.detail || 'Biometric verification failed.');
          setFaceLock('failed');
          faceLockRef.current = 'failed';
        }
      } catch (err) {
        console.error('[FaceMatch] Network error:', err);
        setVerifyResult('failed');
        setVerifyMessage('Server communication error. Please check your connection and try again.');
        setFaceLock('failed');
        faceLockRef.current = 'failed';
      } finally {
        setIsVerifying(false);
        isVerifyingRef.current = false;
      }
    }, 'image/jpeg', 0.95);
  }, [gpsData, stopCamera]);

  // MediaPipe Face Mesh processing — CRITICAL: No faceLock/direction in deps!
  // We use refs so the onResults callback always reads fresh state without
  // causing the entire FaceMesh pipeline to be destroyed and re-built.
  useEffect(() => {
    if (!cameraActive || !scriptsLoaded || !window.FaceMesh || !videoRef.current) return;

    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://unpkg.com/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMeshInstanceRef.current = faceMesh;

    const onResults = (results) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;

      // Clear overlay
      canvasCtx.clearRect(0, 0, width, height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Landmark 1: Nose tip
        const nose = landmarks[1];
        
        // Draw face mesh outline (draw key points for visual feedback)
        const keyPoints = [1, 33, 263, 61, 291, 199, 10, 152]; // nose, eyes, mouth corners, forehead, chin
        keyPoints.forEach((idx) => {
          const pt = landmarks[idx];
          canvasCtx.beginPath();
          canvasCtx.arc(pt.x * width, pt.y * height, 3, 0, 2 * Math.PI);
          canvasCtx.fillStyle = 'rgba(99, 102, 241, 0.7)';
          canvasCtx.fill();
        });

        // Draw the main tracking dot on nose
        canvasCtx.beginPath();
        canvasCtx.arc(nose.x * width, nose.y * height, 7, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#10B981';
        canvasCtx.fill();
        canvasCtx.strokeStyle = '#FFFFFF';
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();

        // Draw face bounding outline
        const faceOutline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 
                            397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 
                            172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
        canvasCtx.beginPath();
        faceOutline.forEach((idx, i) => {
          const pt = landmarks[idx];
          if (i === 0) canvasCtx.moveTo(pt.x * width, pt.y * height);
          else canvasCtx.lineTo(pt.x * width, pt.y * height);
        });
        canvasCtx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
        canvasCtx.lineWidth = 1.5;
        canvasCtx.stroke();

        const currentFaceLock = faceLockRef.current;

        // Lock baseline when first stable face detected
        if (currentFaceLock === 'searching') {
          baselineRef.current = { x: nose.x, y: nose.y };
          setFaceLock('locked');
          faceLockRef.current = 'locked';
        }

        // Liveness Direction Tracker
        if (currentFaceLock === 'locked' && baselineRef.current) {
          const deltaX = nose.x - baselineRef.current.x;
          const deltaY = nose.y - baselineRef.current.y;
          
          let progress = 0;
          let triggered = false;
          const threshold = 0.045; // faster detection threshold

          const dir = directionRef.current;

          // Note: In raw webcam coordinates (unmirrored), moving your head to YOUR left 
          // means moving to the RIGHT side of the sensor, so x INCREASES (val = deltaX).
          if (dir === 'LEFT') {
            const val = deltaX; 
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          } else if (dir === 'RIGHT') {
            const val = -deltaX;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          } else if (dir === 'UP') {
            const val = -deltaY;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          } else if (dir === 'DOWN') {
            const val = deltaY;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          }

          setLivenessProgress(Math.round(progress));

          if (triggered && !isVerifyingRef.current) {
            setFaceLock('success');
            faceLockRef.current = 'success';
            clearInterval(timerIntervalRef.current);
            handleFaceMatchVerification();
          }
        }
      } else {
        // Face lost — only reset if we haven't succeeded or started verifying
        const currentFaceLock = faceLockRef.current;
        if (currentFaceLock === 'locked') {
          setFaceLock('searching');
          faceLockRef.current = 'searching';
          baselineRef.current = null;
          setLivenessProgress(0);
        }
      }
    };

    faceMesh.onResults(onResults);

    // Frame loop using MediaPipe Camera utility
    const mpCamera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && cameraActiveRef.current && faceMeshInstanceRef.current) {
          try {
            await faceMeshInstanceRef.current.send({ image: videoRef.current });
          } catch(e) {
            // Silently handle if mesh was closed during frame send
          }
        }
      },
      width: 640,
      height: 480
    });

    mediapipeCameraRef.current = mpCamera;
    mpCamera.start();

    return () => {
      try { mpCamera.stop(); } catch(e) {}
      try { faceMesh.close(); } catch(e) {}
      mediapipeCameraRef.current = null;
      faceMeshInstanceRef.current = null;
    };
  }, [cameraActive, scriptsLoaded, handleFaceMatchVerification]);
  // NOTE: faceLock and currentDirection are NOT in deps — we use refs instead
  // to avoid destroying and re-creating the pipeline on every state change.

  const getDirectionArrow = () => {
    switch (currentDirection) {
      case 'LEFT': return <MoveLeft className="direction-arrow-icon animate-ping" />;
      case 'RIGHT': return <MoveRight className="direction-arrow-icon animate-ping" />;
      case 'UP': return <MoveUp className="direction-arrow-icon animate-ping" />;
      case 'DOWN': return <MoveDown className="direction-arrow-icon animate-ping" />;
      default: return null;
    }
  };

  const getDirectionHint = () => {
    switch (currentDirection) {
      case 'LEFT': return 'Slowly turn your head to your LEFT';
      case 'RIGHT': return 'Slowly turn your head to your RIGHT';
      case 'UP': return 'Slowly look UP / tilt head upward';
      case 'DOWN': return 'Slowly look DOWN / tilt head downward';
      default: return '';
    }
  };

  return (
    <div className="attendance-container">
      {/* Background glowing decorations */}
      <div className="attendance-decor-1" />
      <div className="attendance-decor-2" />

      <div className="attendance-content">
        {/* Top bar header */}
        <div className="attendance-header">
          <button 
            onClick={() => { stopCamera(); onBack(); }}
            className="btn-back"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <div className="header-brand-info">
            <h1 className="header-title">Biometric Attendance</h1>
            <p className="header-subtitle">{userProfile ? `${userProfile.name} • ${userProfile.role.toUpperCase()}` : 'Validating Profile...'}</p>
          </div>
        </div>

        {/* --- STEP 0.1: Profile Loading --- */}
        {profileLoading && (
          <div className="attendance-card gps-loader-card">
            <div className="icon-wrapper animate-pulse">
              <RefreshCw className="gps-icon animate-spin" />
            </div>
            <h2 className="card-title">Verifying Employee Profile</h2>
            <p className="card-description">
              Looking up your email in the corporate directory...
            </p>
            <div className="spinner-loader" />
          </div>
        )}

        {/* --- STEP 0.2: Profile Not Found (Self-Enrollment Option) --- */}
        {!profileLoading && !userProfile && (
          <div className="attendance-card registration-card">
            <div className="icon-wrapper">
              <Camera className="gps-icon" />
            </div>
            <h2 className="card-title">Initial Enrollment</h2>
            <p className="card-description">
              Welcome! Please complete your one-time biometric registration to start marking attendance.
            </p>
            
            <div className="registration-form">
              <div className="form-group">
                <label className="input-label">Full Name</label>
                <input 
                  type="text" 
                  id="enroll-name"
                  placeholder="Enter your full name"
                  className="form-input"
                  defaultValue={userEmail ? userEmail.split('@')[0] : ''}
                />
              </div>

              <div className="form-group">
                <label className="input-label">Workplace Role</label>
                <select id="enroll-role" className="form-input">
                  <option value="office">Office Staff (Requires Geofencing)</option>
                  <option value="field">Field Staff (GPS Bypassed)</option>
                </select>
              </div>

              <button
                onClick={async () => {
                  const name = document.getElementById('enroll-name').value;
                  const role = document.getElementById('enroll-role').value;
                  if (!name) {
                    alert('Please enter your name.');
                    return;
                  }
                  
                  setProfileLoading(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    
                    const { error } = await supabase.from('employees').insert({
                      name,
                      email: session.user.email,
                      role,
                      is_active: true
                    });
                    
                    if (error) throw error;
                    
                    // Refresh profile
                    const { data } = await supabase
                      .from('employees')
                      .select('*')
                      .eq('email', session.user.email)
                      .maybeSingle();
                    setUserProfile(data);
                  } catch (err) {
                    alert('Registration failed: ' + err.message);
                  } finally {
                    setProfileLoading(false);
                  }
                }}
                className="btn-success-continue"
              >
                Register & Continue
              </button>
            </div>
          </div>
        )}


        {/* --- STEP 1: Geofencing GPS Check Loader --- */}
        {!profileLoading && userProfile && geofenceStatus === 'checking' && (
          <div className="attendance-card gps-loader-card">
            <div className="icon-wrapper animate-pulse">
              <MapPin className="gps-icon animate-bounce" />
            </div>
            <h2 className="card-title">Acquiring Location</h2>
            <p className="card-description">
              Capturing GPS coordinates to verify that you are within office premises...
            </p>
            <div className="spinner-loader" />
          </div>
        )}

        {/* --- STEP 2: Geofencing GPS Check Denied --- */}
        {!profileLoading && userProfile && geofenceStatus === 'blocked' && (
          <div className="attendance-card error-card">
            <div className="icon-wrapper-error">
              <AlertTriangle className="error-icon" />
            </div>
            <h2 className="card-title error-title">Location Rejected</h2>
            <p className="card-description error-desc" style={{ whiteSpace: 'pre-line' }}>
              {geofenceError || gpsError || "Please check your GPS settings and grant access."}
            </p>
            {gpsData && (
              <p className="card-description" style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>
                Debug — Employee: {userProfile?.name} (ID: {userProfile?.id?.slice(0,8)}...) | Your GPS: {gpsData.lat.toFixed(6)}, {gpsData.lng.toFixed(6)}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.75rem' }}>
              <button
                onClick={handleGPSCheck}
                className="btn-retry"
              >
                <RefreshCw className="w-4 h-4" /> Try Location Again
              </button>
              {/* Quick-fix: Update employee_office_config to current location */}
              {gpsData && userProfile?.id && (
                <button
                  onClick={async () => {
                    try {
                      setGeofenceStatus('checking');
                      const { error } = await supabase
                        .from('employee_office_config')
                        .upsert({
                          employee_id: userProfile.id,
                          lat: gpsData.lat,
                          lng: gpsData.lng,
                          radius_meters: 200,
                          start_time: '09:00:00',
                          end_time: '18:00:00',
                          grace_period_minutes: 15,
                          address: `Auto-updated (${gpsData.lat.toFixed(4)}, ${gpsData.lng.toFixed(4)})`,
                          updated_at: new Date().toISOString()
                        }, { onConflict: 'employee_id' });
                      if (error) throw error;
                      // Re-run geofence check
                      handleGPSCheck();
                    } catch (err) {
                      console.error('Config update error:', err);
                      setGeofenceStatus('blocked');
                      setGeofenceError('Failed to update config: ' + (err.message || 'Unknown error'));
                    }
                  }}
                  className="btn-retry"
                  style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10B981' }}
                >
                  <MapPin className="w-4 h-4" /> Update Config to My Location
                </button>
              )}
              {/* Quick-fix: Delete employee-specific config to fall back to global */}
              {userProfile?.id && (
                <button
                  onClick={async () => {
                    try {
                      setGeofenceStatus('checking');
                      await supabase
                        .from('employee_office_config')
                        .delete()
                        .eq('employee_id', userProfile.id);
                      // Re-run geofence check (will now use global config)
                      handleGPSCheck();
                    } catch (err) {
                      console.error('Config reset error:', err);
                      setGeofenceStatus('blocked');
                      setGeofenceError('Failed to reset config: ' + (err.message || 'Unknown error'));
                    }
                  }}
                  className="btn-retry"
                  style={{ background: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.3)', color: '#FBBF24' }}
                >
                  <RefreshCw className="w-4 h-4" /> Reset to Global Config
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- INTERMEDIATE STEP: Timer Before Office Start --- */}
        {!profileLoading && userProfile && geofenceStatus === 'success' && verifyResult !== 'success' && timeUntilStart > 0 && (
          <div className="attendance-card success-screen-card" style={{marginTop: '2rem'}}>
            <div className="icon-wrapper animate-pulse" style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#FBBF24', margin: '0 auto 1.5rem auto' }}>
              <Clock className="w-8 h-8" />
            </div>
            <h2 className="card-title text-2xl mb-4 text-center">Office Starts At {officeStartTime?.slice(0, 5)}</h2>
            <div className="text-4xl font-mono font-bold mb-4 text-center" style={{ color: 'var(--brand-primary)', margin: '1.5rem 0' }}>
              {Math.floor(timeUntilStart / 3600).toString().padStart(2, '0')}:
              {Math.floor((timeUntilStart % 3600) / 60).toString().padStart(2, '0')}:
              {(timeUntilStart % 60).toString().padStart(2, '0')}
            </div>
            <p className="card-description text-center mt-4">
              You are early! The biometric camera will automatically activate once the shift time begins. You do not need to refresh.
            </p>
          </div>
        )}

        {/* --- STEP 3: Camera, Face Mesh and Liveness Challenge --- */}
        {!profileLoading && userProfile && geofenceStatus === 'success' && verifyResult !== 'success' && timeUntilStart === 0 && (
          <div className="camera-verification-flow">
            {/* Holographic Video Screen */}
            <div className="camera-viewport">
              {/* Webcam Video */}
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="camera-video"
              />

              {/* Dynamic canvas face tracker overlays */}
              <canvas 
                ref={canvasRef}
                width={640}
                height={480}
                className="camera-canvas"
              />

              {/* Holographic scan circular guide lines */}
              <div className="scanner-overlay-container">
                <div className={`scanner-circle-outer ${faceLock === 'success' ? 'success' : ''}`} />
                <div className={`scanner-circle-inner ${faceLock === 'success' ? 'success' : ''}`} />
                
                {/* scanning laser sweep line */}
                {faceLock === 'searching' && (
                  <div className="scanner-laser" />
                )}
              </div>

              {/* Glowing Concentric Biometric Match Rings (WOW Effect) */}
              {faceLock === 'success' && (
                <div className="biometric-match-rings">
                  <div className="pulse-ring-1" />
                  <div className="pulse-ring-2" />
                  <div className="pulse-ring-fill" />
                </div>
              )}

              {/* Quick loading placeholder */}
              {!cameraActive && (
                <div className="camera-loading-placeholder">
                  <div className="spinner-loader" />
                  <p className="loading-placeholder-text">Initiating biometric modules...</p>
                </div>
              )}
            </div>

            {/* Verification Challenge Card */}
            {cameraActive && (
              <div className="attendance-card challenge-card">
                {faceLock === 'searching' && (
                  <div className="challenge-searching-state">
                    <Camera className="challenge-camera-icon animate-pulse" />
                    <h3 className="challenge-title">Align Your Face</h3>
                    <p className="challenge-desc">Position your face inside the circle tracker to begin biometric liveness validation.</p>
                  </div>
                )}

                {faceLock === 'locked' && (
                  <div className="challenge-active-state">
                    <div className="challenge-direction-indicator">
                      {getDirectionArrow()}
                      <span className="challenge-active-title">
                        Liveness Test: Turn Face {currentDirection}
                      </span>
                    </div>

                    <p className="challenge-hint">{getDirectionHint()}</p>

                    {/* Progress slider bar */}
                    <div className="challenge-progress-track">
                      <div 
                        className="challenge-progress-fill"
                        style={{ width: `${livenessProgress}%` }}
                      />
                    </div>

                    <div className="challenge-footer-info">
                      <span className="coordinate-active-label">
                        <span className="tracking-dot" />
                        Nose tip tracking active
                      </span>
                      <span className={`timer-label ${livenessTimer < 5 ? 'timer-low animate-pulse' : ''}`}>
                        {livenessTimer}s remaining
                      </span>
                    </div>
                  </div>
                )}

                {faceLock === 'success' && (
                  <div className="challenge-success-state">
                    <div className="icon-wrapper-success">
                      <CheckCircle className="success-icon animate-bounce" />
                    </div>
                    <h3 className="challenge-success-title">Liveness Confirmed</h3>
                    <p className="challenge-success-desc">{verifyMessage}</p>
                  </div>
                )}

                {faceLock === 'failed' && (
                  <div className="challenge-failed-state">
                    <AlertTriangle className="failed-icon animate-pulse" />
                    <h3 className="challenge-failed-title">Verification Failure</h3>
                    <p className="challenge-failed-desc">{verifyMessage || 'Verification expired.'}</p>
                    <button 
                      onClick={startCamera}
                      className="btn-retry-scanning"
                    >
                      Retry Scanning
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- STEP 4: Absolute Success Screen --- */}
        {!profileLoading && userProfile && verifyResult === 'success' && (
          <div className="attendance-card success-screen-card">
            <div className="success-screen-icon-wrapper">
              <CheckCircle className="success-screen-icon" />
            </div>
            <h2 className="success-screen-title">Attendance Confirmed</h2>
            <p className="success-screen-desc">
              {verifyMessage || 'Your face matched and coordinates verified successfully. Go ahead and start your workday!'}
            </p>
            <button
              onClick={() => { stopCamera(); onBack(); }}
              className="btn-success-continue"
            >
              Continue to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
