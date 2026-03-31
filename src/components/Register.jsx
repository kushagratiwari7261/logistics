import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import sealLogo from '../seal.png';
import './Register.css';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();

  const isValidEmail = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

  const validateForm = () => {
    const newErrors = {};
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!acceptedTerms) {
      newErrors.terms = 'You must accept the terms and conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!validateForm()) return;

    if (!supabase) {
      setMessage('Supabase is not configured properly.');
      return;
    }

    setIsRegistering(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: email.split('@')[0], // Default full name from email
          },
          emailRedirectTo: `${window.location.origin}/login`,
        }
      });

      if (error) throw error;

      if (data.user) {
        setIsSuccess(true);
        setMessage('Registration successful! Please check your email for verification.');
        // Clear form
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setAcceptedTerms(false);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setMessage(err.message || 'An error occurred during registration.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="register-page">
      {/* Animated background orbs */}
      <div className="register-orb register-orb-1" />
      <div className="register-orb register-orb-2" />

      <div className="register-center-wrap">
        {/* Logo above card */}
        <div className="register-top-logo">
          <img src={sealLogo} alt="Seal Freight" className="register-logo-img" />
          <span className="register-logo-brand">Seal Freight</span>
        </div>

        {/* Register card */}
        <div className="register-card">
          <div className="register-card-header">
            <h2>Create Account</h2>
            <p className="register-card-subtitle">Join the Seal Freight platform today</p>
          </div>

          {message && (
            <div className={`register-msg ${isSuccess ? 'success' : 'error'}`}>
              {isSuccess ? '✓' : '⚠'} {message}
            </div>
          )}

          {!isSuccess && (
            <form className="rf-form" onSubmit={handleSubmit}>
              {/* Email */}
              <div className="rf-group">
                <label htmlFor="email" className="rf-label">Email Address</label>
                <div className="rf-input-wrap">
                  <span className="rf-input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    id="email"
                    className="rf-input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isRegistering}
                    autoComplete="email"
                  />
                </div>
                {errors.email && <div className="rf-field-err">{errors.email}</div>}
              </div>

              {/* Password */}
              <div className="rf-group">
                <label htmlFor="password" className="rf-label">Password</label>
                <div className="rf-input-wrap">
                  <span className="rf-input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="rf-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isRegistering}
                    autoComplete="new-password"
                  />
                </div>
                {errors.password && <div className="rf-field-err">{errors.password}</div>}
              </div>

              {/* Confirm Password */}
              <div className="rf-group">
                <label htmlFor="confirmPassword" className="rf-label">Confirm Password</label>
                <div className="rf-input-wrap">
                  <span className="rf-input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    className="rf-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isRegistering}
                    autoComplete="new-password"
                  />
                </div>
                {errors.confirmPassword && <div className="rf-field-err">{errors.confirmPassword}</div>}
              </div>

              {/* Show Password Toggle */}
              <div className="rf-group" style={{ marginBottom: '10px' }}>
                <label className="rf-terms-wrap" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    className="rf-terms-checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                  />
                  <span className="rf-terms-text">Show Password</span>
                </label>
              </div>

              {/* Terms and Conditions */}
              <div className="rf-group" style={{ marginBottom: '24px' }}>
                <label className="rf-terms-wrap">
                  <input
                    type="checkbox"
                    className="rf-terms-checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    disabled={isRegistering}
                  />
                  <span className="rf-terms-text">
                    I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms and Conditions</a> and <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>.
                  </span>
                </label>
                {errors.terms && <div className="rf-field-err">{errors.terms}</div>}
              </div>

              <button type="submit" className="rf-submit" disabled={isRegistering}>
                {isRegistering ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          <div className="register-card-footer">
            <p>
              Already have an account?{' '}
              <a
                href="#"
                className="rf-login-link"
                onClick={(e) => { e.preventDefault(); navigate('/login'); }}
              >
                Sign In
              </a>
            </p>
          </div>
        </div>

        <p className="register-copyright">© 2025 Seal Freight. All rights reserved.</p>
      </div>
    </div>
  );
};

export default Register;
