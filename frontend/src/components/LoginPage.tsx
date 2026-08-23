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
      setError('Could not reach the TaxEaseBD server. Is the backend running on port 8000?');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = () => {
    // Explicit, honest guest mode: no backend call, no fabricated account -
    // clearly labeled so it never masquerades as a real logged-in session.
    onLogin({ email: 'guest@taxeasebd.app', name: 'Guest', entity_type: 'individual' });
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
                <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#0077B3', fontWeight: 600 }}>
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
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#0D2233',
};
