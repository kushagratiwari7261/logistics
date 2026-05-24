import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { MapPin, Camera, RefreshCw, CheckCircle, AlertTriangle, ArrowLeft, MoveLeft, MoveRight, MoveUp, MoveDown } from 'lucide-react';
import './MarkAttendance.css';

export default function MarkAttendance({ onBack }) {
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [geofenceStatus, setGeofenceStatus] = useState(null); // 'checking', 'success', 'blocked'
  const [geofenceError, setGeofenceError] = useState('');
  
  // Camera & Face Mesh States
  const [cameraActive, setCameraActive] = useState(false);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [faceLock, setFaceLock] = useState('searching'); // 'searching', 'locked', 'success', 'failed'
  const [randomDirection, setRandomDirection] = useState('');
  const [livenessProgress, setLivenessProgress] = useState(0); // 0 to 100
  const [livenessTimer, setLivenessTimer] = useState(10);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // 'success', 'failed'
  const [verifyMessage, setVerifyMessage] = useState('');

  // Refs for camera & drawing canvas
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const baselineRef = useRef(null);
  const activeStreamRef = useRef(null);
  const livenessIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const faceMeshInstanceRef = useRef(null);

  const DIRECTIONS = ['LEFT', 'RIGHT', 'UP', 'DOWN'];

  // Load current user profile from Supabase
  useEffect(() => {
    const fetchProfile = async () => {
      setProfileLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('email', session.user.email)
          .maybeSingle();
        setUserProfile(data);
      }
      setProfileLoading(false);
    };
    fetchProfile();
  }, []);

  // Capture GPS coordinates and verify on Backend
  const handleGPSCheck = () => {
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

        // Fetch verification from FastAPI geofence-check
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const formData = new FormData();
          formData.append('latitude', lat);
          formData.append('longitude', lng);

          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/geofence-check`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: formData
          });

          if (!response.ok) {
            throw new Error('Geofence verification service failed.');
          }

          const result = await response.json();
          if (result.inside_geofence) {
            setGeofenceStatus('success');
          } else {
            setGeofenceStatus('blocked');
            setGeofenceError(`Out of Office Bounds (Distance: ${result.distance_m.toFixed(1)}m from office). Must be within ${result.office_radius_meters}m.`);
          }
        } catch (err) {
          setGeofenceStatus('blocked');
          setGeofenceError(err.message || 'Error communicating with geofence service.');
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
  };

  // Start geofence capture automatically for Office Staff
  useEffect(() => {
    if (userProfile) {
      if (userProfile.role === 'office') {
        handleGPSCheck();
      } else {
        // Field staff directly bypasses geofencing
        setGeofenceStatus('success');
      }
    }
  }, [userProfile]);

  // Load MediaPipe scripts dynamically
  useEffect(() => {
    if (geofenceStatus !== 'success') return;

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
      loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
      loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')
    ])
      .then(() => {
        setScriptsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load MediaPipe libraries:', err);
      });
  }, [geofenceStatus]);

  // Start Camera Stream
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        activeStreamRef.current = stream;
        setCameraActive(true);
        setFaceLock('searching');
        setVerifyResult(null);
        setIsVerifying(false);
        baselineRef.current = null;
        
        // Pick a random challenge direction
        const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        setRandomDirection(dir);
        setLivenessProgress(0);
        setLivenessTimer(10);
      }
    } catch (err) {
      console.error('Camera stream access failed:', err);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    setCameraActive(false);
    clearInterval(livenessIntervalRef.current);
    clearInterval(timerIntervalRef.current);
    if (faceMeshInstanceRef.current) {
      faceMeshInstanceRef.current.close();
    }
  };

  // Trigger camera start when scripts load
  useEffect(() => {
    if (scriptsLoaded && geofenceStatus === 'success') {
      startCamera();
    }
    return () => stopCamera();
  }, [scriptsLoaded, geofenceStatus]);

  // Start the 10-second countdown once face is locked
  useEffect(() => {
    if (faceLock === 'locked') {
      timerIntervalRef.current = setInterval(() => {
        setLivenessTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setFaceLock('failed');
            setVerifyMessage('Liveness verification timed out. Please try again.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [faceLock]);

  // MediaPipe Face Mesh processing
  useEffect(() => {
    if (!cameraActive || !scriptsLoaded || !window.FaceMesh) return;

    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
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
        
        // Draw the tracking dot on canvas
        canvasCtx.beginPath();
        canvasCtx.arc(nose.x * width, nose.y * height, 6, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#10B981'; // Emerald Green
        canvasCtx.fill();
        canvasCtx.strokeStyle = '#FFFFFF';
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();

        // Lock baseline when first stable face detected
        if (faceLock === 'searching') {
          baselineRef.current = { x: nose.x, y: nose.y };
          setFaceLock('locked');
        }

        // Liveness Direction Tracker
        if (faceLock === 'locked' && baselineRef.current) {
          const deltaX = nose.x - baselineRef.current.x;
          const deltaY = nose.y - baselineRef.current.y;
          
          let progress = 0;
          let triggered = false;

          // LEFT: x decreases (nose shifts left, coordinates shrink from right view)
          // RIGHT: x increases
          // UP: y decreases
          // DOWN: y increases
          const threshold = 0.07;

          if (randomDirection === 'LEFT') {
            const val = -deltaX;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          } else if (randomDirection === 'RIGHT') {
            const val = deltaX;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          } else if (randomDirection === 'UP') {
            const val = -deltaY;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          } else if (randomDirection === 'DOWN') {
            const val = deltaY;
            progress = Math.min(100, Math.max(0, (val / threshold) * 100));
            triggered = val >= threshold;
          }

          setLivenessProgress(Math.round(progress));

          if (triggered) {
            setFaceLock('success');
            clearInterval(timerIntervalRef.current);
            handleFaceMatchVerification();
          }
        }
      } else {
        // Face lost
        if (faceLock === 'locked') {
          setFaceLock('searching');
          baselineRef.current = null;
          setLivenessProgress(0);
        }
      }
    };

    faceMesh.onResults(onResults);

    // Frame loops
    const activeCamera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && cameraActive) {
          await faceMesh.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480
    });

    activeCamera.start();

    return () => {
      activeCamera.stop();
      faceMesh.close();
    };
  }, [cameraActive, scriptsLoaded, faceLock, randomDirection]);

  // Capture frame & verify with FastAPI Python Backend
  const handleFaceMatchVerification = async () => {
    if (isVerifying) return;
    setIsVerifying(true);
    setVerifyMessage('Analyzing face signature...');

    // 1. Draw current camera frame to a hidden canvas
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    }

    // 2. Convert Canvas frame to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsVerifying(false);
        setFaceLock('failed');
        setVerifyMessage('Failed to capture camera frame. Please reload.');
        return;
      }

      // 3. Dispatch to FastAPI Server
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const formData = new FormData();
        formData.append('image', blob, 'face_capture.jpg');
        formData.append('direction_used', randomDirection);
        if (gpsData) {
          formData.append('latitude', gpsData.lat);
          formData.append('longitude', gpsData.lng);
        }

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/face-match`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
          setVerifyResult('success');
          setVerifyMessage(result.message || 'Attendance logged successfully.');
          stopCamera();
        } else {
          setVerifyResult('failed');
          setVerifyMessage(result.detail || 'Biometric verification failed.');
          setFaceLock('failed');
        }
      } catch (err) {
        setVerifyResult('failed');
        setVerifyMessage('Server communication error. Please check connection.');
        setFaceLock('failed');
      } finally {
        setIsVerifying(false);
      }
    }, 'image/jpeg', 0.95);
  };

  const getDirectionArrow = () => {
    switch (randomDirection) {
      case 'LEFT': return <MoveLeft className="w-10 h-10 animate-ping text-indigo-400" />;
      case 'RIGHT': return <MoveRight className="w-10 h-10 animate-ping text-indigo-400" />;
      case 'UP': return <MoveUp className="w-10 h-10 animate-ping text-indigo-400" />;
      case 'DOWN': return <MoveDown className="w-10 h-10 animate-ping text-indigo-400" />;
      default: return null;
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

        {/* --- STEP 0.2: Profile Not Found (Not Enrolled) --- */}
        {!profileLoading && !userProfile && (
          <div className="attendance-card error-card">
            <div className="icon-wrapper-error">
              <AlertTriangle className="error-icon" />
            </div>
            <h2 className="card-title error-title">Profile Not Enrolled</h2>
            <p className="card-description error-desc">
              Your account is not registered in the corporate employee database. Please contact a Super Admin (Vikas, Sushil, or Kushagra) to register your face signatures and activate your account.
            </p>
            <button
              onClick={() => onBack()}
              className="btn-retry"
            >
              Return to Dashboard
            </button>
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
            <p className="card-description error-desc">
              {geofenceError || gpsError || "Please check your GPS settings and grant access."}
            </p>
            <button
              onClick={handleGPSCheck}
              className="btn-retry"
            >
              <RefreshCw className="w-4 h-4 animate-spin-slow" /> Try Location Again
            </button>
          </div>
        )}

        {/* --- STEP 3: Camera, Face Mesh and Liveness Challenge --- */}
        {!profileLoading && userProfile && geofenceStatus === 'success' && verifyResult !== 'success' && (
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

              {/* Glowing Concentric Biometric Match Concentric Rings (WOW Effect) */}
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
                        Liveness Test: Turn Face {randomDirection}
                      </span>
                    </div>

                    {/* Progress slider bar */}
                    <div className="challenge-progress-track">
                      <div 
                        className="challenge-progress-fill"
                        style={{ width: `${livenessProgress}%` }}
                      />
                    </div>

                    <div className="challenge-footer-info">
                      <span className="coordinate-active-label">Nose tip coordinates tracking active</span>
                      <span className={`timer-label ${livenessTimer < 4 ? 'timer-low animate-pulse' : ''}`}>
                        Time remaining: {livenessTimer}s
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
              <CheckCircle className="success-screen-icon animate-[bounce_1.5s_infinite]" />
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
