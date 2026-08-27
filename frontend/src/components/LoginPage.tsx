'use client';

import React, { useState } from 'react';
import { apiFetch, apiErrorMessage, saveSession, UserProfile } from '@/lib/api';

interface LoginPageProps {
  onLogin: (user: UserProfile) => void;
  onGoSignup: () => void;
  onGoHome: () => void;
}

export default function LoginPage({ onLogin, onGoSignup, onGoHome }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPass, setNewPass] = useState('');
  const [otpStep, setOtpStep] = useState<1 | 2>(1);
  const [forgotNotice, setForgotNotice] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotErr, setForgotErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res, 'Login failed. Please check your credentials.'));
        return;
      }
      const data = await res.json();
      saveSession({ token: data.token, user: data.user });
      onLogin(data.user as UserProfile);
    } catch {
      setError('Could not reach the TaxEaseBD server.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = () => {
    onLogin({ email: 'guest@taxeasebd.app', name: 'Guest', entity_type: 'individual' });
  };

  const handleSendResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotErr('');
    setForgotMsg('');
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotErr('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim(), purpose: 'forgot_password' }),
      });
      if (res.ok) {
        setForgotMsg('6-Digit OTP code sent to your email.');
        setOtpStep(2);
      } else {
        setForgotErr(await apiErrorMessage(res, 'Could not send reset code.'));
      }
    } catch {
      setForgotErr('Failed to reach server.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendForgotCode = async () => {
    setLoading(true);
    setForgotErr('');
    setForgotMsg('');
    try {
      const res = await apiFetch('/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim(), purpose: 'forgot_password' }),
      });
      if (res.ok) {
        setForgotMsg('✓ Fresh 6-digit code sent to your email!');
      } else {
        setForgotErr('Failed to resend code.');
      }
    } catch {
      setForgotErr('Failed to reach server.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotErr('');
    if (!forgotOtp || forgotOtp.length < 6) {
      setForgotErr('Please enter the 6-digit verification code.');
      return;
    }
    if (!newPass || newPass.length < 6) {
      setForgotErr('New password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim(), otp: forgotOtp.trim(), new_password: newPass }),
      });
      if (!res.ok) {
        setForgotErr(await apiErrorMessage(res, 'Password reset failed.'));
        return;
      }
      setShowForgotModal(false);
      setEmail(forgotEmail.trim());
      setPassword(newPass);
      setError('');
      alert('Password reset successfully! You can now log in with your new password.');
    } catch {
      setForgotErr('Failed to reach server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F0F8FF',
    }}>

      {/* ── Left panel — brand ── */}
      <div style={{
        flex: '0 0 42%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #0077B3 0%, #005f8e 60%, #003452 100%)',
        padding: '3rem 3rem',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -80, left: -80, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(26,171,168,0.15)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 340 }}>
          {/* Logo */}
          <button onClick={onGoHome} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-block', marginBottom: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, overflow: 'hidden', border: '3px solid rgba(255,255,255,0.3)', margin: '0 auto 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
              <img src="/logo.jpg" alt="TaxEaseBD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 22, color: '#000000', letterSpacing: '-0.5px' }}>TaxEaseBD</div>
          </button>

          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, marginBottom: 40 }}>
            Bangladesh&apos;s smart platform for tax compliance, VAT, and business registration.
          </p>

          {/* Feature bullets */}
          {[
            '🧮  Accurate NBR Tax Calculator',
            '🤖  AI-Powered Compliance Assistant',
            '📋  Auto-filled RJSC & NBR Forms',
            '📅  Compliance Deadline Alerts',
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10, marginBottom: 8,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500, textAlign: 'left' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 2rem',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Back to home */}
          <button
            onClick={onGoHome}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#5B7D91', fontSize: 13, fontWeight: 500, marginBottom: 32, padding: 0 }}
          >
            ← Back to home
          </button>

          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0D2233', marginBottom: 6, letterSpacing: '-0.5px' }}>Welcome back</h1>
          <p style={{ fontSize: 14, color: '#5B7D91', marginBottom: 32 }}>
            Log in to your TaxEaseBD account to continue.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email address</label>
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="glass-input"
                style={{ marginTop: 6 }}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={labelStyle}>Password</label>
                <button
                  type="button"
                  onClick={() => { setForgotEmail(email); setShowForgotModal(true); setOtpStep(1); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#0077B3', fontWeight: 600 }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="glass-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5B7D91', fontSize: 12 }}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(224,92,46,0.1)', border: '1px solid rgba(224,92,46,0.3)', color: '#E05C2E', fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#6ba8c4' : '#0077B3',
                color: '#fff', border: 'none',
                borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', marginTop: 4,
                boxShadow: '0 4px 18px rgba(0,119,179,0.3)',
              }}
              onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#005f8e'; }}
              onMouseOut={e => { if (!loading) e.currentTarget.style.background = '#0077B3'; }}
            >
              {loading ? 'Logging in…' : 'Log In →'}
            </button>

            {/* ── Google Sign-In ── */}
            <a
              href="http://localhost:8000/api/auth/google"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: '#ffffff', color: '#3c4043', border: '1.5px solid #dadce0',
                borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', textDecoration: 'none', transition: 'all 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}
              onMouseOver={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.15)'; e.currentTarget.style.borderColor = '#4285f4'; }}
              onMouseOut={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#dadce0'; }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.2 33.6 29.6 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l6-6C34.4 6.5 29.5 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5c11 0 20-8 20-20 0-1.2-.1-2.3-.5-5.5z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.5 19.2 14 24 14c3 0 5.8 1.1 7.9 3l6-6C34.4 6.5 29.5 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z"/>
                <path fill="#FBBC05" d="M24 45.5c5.4 0 10.2-1.8 13.9-4.9l-6.4-5.3C29.6 37 27 38 24 38c-5.6 0-10.3-3.8-12-9l-7 5.4C8.5 41.2 15.7 45.5 24 45.5z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.8 2.3-2.3 4.3-4.3 5.7l6.4 5.3c3.8-3.5 6.1-8.7 6.1-14.5 0-1.2-.1-2.3-.5-5z"/>
              </svg>
              Continue with Google
            </a>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#D1E8E2' }} />
              <span style={{ fontSize: 12, color: '#5B7D91' }}>or continue as</span>
              <div style={{ flex: 1, height: 1, background: '#D1E8E2' }} />
            </div>

            {/* Guest */}
            <button
              type="button"
              onClick={handleGuestAccess}
              style={{
                background: 'transparent', color: '#2E5369',
                border: '1.5px solid #A3D1E0', borderRadius: 12, padding: '13px',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#0077B3'; e.currentTarget.style.color = '#0077B3'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = '#A3D1E0'; e.currentTarget.style.color = '#2E5369'; }}
            >
              Guest Access
            </button>
          </form>

          {/* Switch to signup */}
          <p style={{ textAlign: 'center', fontSize: 14, color: '#5B7D91', marginTop: 28 }}>
            Don&apos;t have an account?{' '}
            <button
              onClick={onGoSignup}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0077B3', fontWeight: 700, fontSize: 14, padding: 0 }}
            >
              Sign Up Free
            </button>
          </p>
        </div>
      </div>

      {/* FORGOT PASSWORD 6-DIGIT OTP MODAL */}
      {showForgotModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(13, 34, 51, 0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid #A3D1E0'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(0,119,179,0.1)', color: '#0077B3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>
                🔑
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0D2233', margin: '0 0 6px' }}>
                Reset Your Password
              </h3>
              <p style={{ fontSize: 13, color: '#5B7D91', margin: 0 }}>
                {otpStep === 1 ? 'Enter your registered email to receive a 6-digit OTP code.' : `Enter the 6-digit code sent to ${forgotEmail}`}
              </p>
            </div>

            {otpStep === 1 ? (
              <form onSubmit={handleSendResetOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2E5369', marginBottom: 6 }}>Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #A3D1E0', fontSize: 14 }}
                  />
                </div>
                {forgotErr && <div style={{ fontSize: 12, color: '#E05C2E', fontWeight: 700 }}>{forgotErr}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button type="button" onClick={() => setShowForgotModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #D1E8E2', background: '#f8fafc', color: '#5B7D91', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: '#0077B3', color: '#ffffff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                    {loading ? 'Sending Code...' : 'Send Reset Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2E5369', marginBottom: 6 }}>6-Digit OTP Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={e => setForgotOtp(e.target.value)}
                    placeholder="e.g. 849201"
                    style={{ width: '100%', padding: '12px', borderRadius: 12, border: '2px solid #0077B3', textAlign: 'center', fontSize: 20, fontFamily: 'monospace', letterSpacing: 4, fontWeight: 900 }}
                  />
                </div>
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={handleResendForgotCode}
                    disabled={loading}
                    style={{ background: 'none', border: 'none', color: '#0077B3', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {loading ? 'Resending code...' : "Didn't get the code? Resend Code"}
                  </button>
                </div>
                {forgotMsg && (
                  <div style={{ fontSize: 12, color: '#0D8C89', fontWeight: 700, textAlign: 'center' }}>
                    {forgotMsg}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2E5369', marginBottom: 6 }}>New Password</label>
                  <input
                    type="password"
                    required
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="Min 6 characters"
                    style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #A3D1E0', fontSize: 14 }}
                  />
                </div>
                {forgotErr && <div style={{ fontSize: 12, color: '#E05C2E', fontWeight: 700 }}>{forgotErr}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button type="button" onClick={() => setShowForgotModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #D1E8E2', background: '#f8fafc', color: '#5B7D91', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: '#0077B3', color: '#ffffff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#0D2233',
};
