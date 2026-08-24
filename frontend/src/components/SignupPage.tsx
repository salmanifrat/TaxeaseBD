'use client';

import React, { useState } from 'react';
import { apiFetch, apiErrorMessage, saveSession, UserProfile, uploadDocumentFile } from '@/lib/api';

interface SignupPageProps {
  onSignup: (user: UserProfile) => void;
  onGoLogin: () => void;
  onGoHome: () => void;
}

export default function SignupPage({ onSignup, onGoLogin, onGoHome }: SignupPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');
  const [tin, setTin] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ docId: string; filename: string; uploadedAt: string; size: string; status: 'Verified' | 'Pending' }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const validate = () => {
    if (!name.trim()) return 'Please enter your full name.';
    if (!email.trim() || !email.includes('@')) return 'Please enter a valid email address.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    if (accountType === 'company' && !companyName.trim()) return 'Please enter your company name.';
    return '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const res = await uploadDocumentFile(file);
      const newDoc = {
        docId: res.doc_id,
        filename: res.filename,
        uploadedAt: new Date().toISOString().split('T')[0],
        size: res.size,
        status: 'Verified' as const,
      };
      setUploadedDocs(prev => [...prev, newDoc]);
      if (res.extracted_tin) {
        setTin(res.extracted_tin);
      }
    } catch {
      const newDoc = {
        docId: `doc_${Date.now()}`,
        filename: file.name,
        uploadedAt: new Date().toISOString().split('T')[0],
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        status: 'Pending' as const,
      };
      setUploadedDocs(prev => [...prev, newDoc]);
    }
  };

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [demoOtpNotice, setDemoOtpNotice] = useState('');
  const [otpError, setOtpError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const otpRes = await apiFetch('/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), purpose: 'signup' }),
      });
      if (otpRes.ok) {
        const otpData = await otpRes.json();
        setDemoOtpNotice(otpData.otp_demo || '');
        setShowOtpModal(true);
      } else {
        // Direct fallback if OTP service note
        await completeSignup();
      }
    } catch {
      await completeSignup();
    } finally {
      setLoading(false);
    }
  };

  const verifyAndCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) {
      setOtpError('Please enter the full 6-digit code.');
      return;
    }
    setOtpError('');
    setLoading(true);
    try {
      const vRes = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), otp: otpCode.trim() }),
      });
      if (!vRes.ok) {
        setOtpError(await apiErrorMessage(vRes, 'Invalid 6-digit code.'));
        setLoading(false);
        return;
      }
      await completeSignup();
    } catch {
      setOtpError('Verification failed. Please try again.');
      setLoading(false);
    }
  };

  const completeSignup = async () => {
    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          tin: tin.trim() || null,
          entity_type: accountType === 'company' ? 'private_limited_company' : 'individual',
          company_name: accountType === 'company' ? companyName.trim() : null,
          uploaded_documents: uploadedDocs,
        }),
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res, 'Could not create your account.'));
        setShowOtpModal(false);
        return;
      }
      const data = await res.json();
      saveSession({ token: data.token, user: data.user });
      onSignup(data.user as UserProfile);
    } catch {
      setError('Could not reach the TaxEaseBD server.');
    } finally {
      setLoading(false);
    }
  };

  const getStrength = () => {
    if (password.length === 0) return { label: '', color: '#D1E8E2', width: 0 };
    if (password.length < 6) return { label: 'Weak', color: '#E05C2E', width: 30 };
    if (password.length < 10) return { label: 'Fair', color: '#f5a623', width: 60 };
    return { label: 'Strong', color: '#1AABA8', width: 100 };
  };

  const strength = getStrength();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F0F8FF',
    }}>

      {/* ── Left panel — brand ── */}
      <div style={{
        flex: '0 0 42%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #1AABA8 0%, #0D8C89 50%, #005f8e 100%)',
        padding: '3rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -100, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,119,179,0.2)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 340 }}>
          <button onClick={onGoHome} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-block', marginBottom: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, overflow: 'hidden', border: '3px solid rgba(255,255,255,0.3)', margin: '0 auto 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
              <img src="/logo.jpg" alt="TaxEaseBD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 22, color: '#000000', letterSpacing: '-0.5px' }}>TaxEaseBD</div>
          </button>

          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 1.65, marginBottom: 36 }}>
            Join thousands of Bangladeshi businesses managing their taxes smarter.
          </p>

          {/* Benefits */}
          {[
            { icon: '✅', text: 'Free forever for individuals' },
            { icon: '⚡', text: 'Instant tax calculations' },
            { icon: '🔒', text: 'NBR-aligned, always accurate' },
            { icon: '🌐', text: 'English & Bengali interface' },
          ].map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 16px', borderRadius: 10, marginBottom: 8,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              textAlign: 'left',
            }}>
              <span style={{ fontSize: 16 }}>{b.icon}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 2rem', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          <button
            onClick={onGoHome}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#5B7D91', fontSize: 13, fontWeight: 500, marginBottom: 32, padding: 0 }}
          >
            ← Back to home
          </button>

          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0D2233', marginBottom: 6, letterSpacing: '-0.5px' }}>Create your account</h1>
          <p style={{ fontSize: 14, color: '#5B7D91', marginBottom: 28 }}>
            Free to join. No credit card required.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Name */}
            <div>
              <label style={labelStyle}>Full name</label>
              <input
                id="signup-name"
                type="text"
                placeholder="e.g. Rahim Uddin"
                value={name}
                onChange={e => setName(e.target.value)}
                className="glass-input"
                style={{ marginTop: 6 }}
                autoComplete="name"
              />
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email address</label>
              <input
                id="signup-email"
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
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative', marginTop: 6 }}>
                <input
                  id="signup-password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="glass-input"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5B7D91', fontSize: 12 }}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {/* Strength bar */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 4, borderRadius: 4, background: '#D1E8E2', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${strength.width}%`, background: strength.color, borderRadius: 4, transition: 'all 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 11, color: strength.color, fontWeight: 600, marginTop: 4, display: 'block' }}>{strength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label style={labelStyle}>Confirm password</label>
              <input
                id="signup-confirm"
                type={showPass ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="glass-input"
                style={{ marginTop: 6, borderColor: confirm && confirm !== password ? '#E05C2E' : undefined }}
                autoComplete="new-password"
              />
              {confirm && confirm !== password && (
                <span style={{ fontSize: 11, color: '#E05C2E', fontWeight: 600, display: 'block', marginTop: 4 }}>Passwords don&apos;t match</span>
              )}
            </div>

            {/* Account Category Selector */}
            <div>
              <label style={labelStyle}>Account Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setAccountType('individual')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: accountType === 'individual' ? '2px solid #1AABA8' : '1px solid #D1E8E2',
                    background: accountType === 'individual' ? 'rgba(26,171,168,0.08)' : '#fff',
                    color: accountType === 'individual' ? '#0D8C89' : '#5B7D91',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  👤 Personal Account
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>
                    (Manage self & linked companies)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('company')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: accountType === 'company' ? '2px solid #1AABA8' : '1px solid #D1E8E2',
                    background: accountType === 'company' ? 'rgba(26,171,168,0.08)' : '#fff',
                    color: accountType === 'company' ? '#0D8C89' : '#5B7D91',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  🏢 Dedicated Company
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>
                    (Corporate/Business TIN & Tax)
                  </span>
                </button>
              </div>
            </div>

            {/* Company Name (if Dedicated Company) */}
            {accountType === 'company' && (
              <div>
                <label style={labelStyle}>Company / Business Name *</label>
                <input
                  id="signup-company-name"
                  type="text"
                  placeholder="e.g. Apex Technologies Ltd."
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="glass-input"
                  style={{ marginTop: 6 }}
                />
              </div>
            )}

            {/* Optional e-TIN */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={labelStyle}>e-TIN Number</label>
                <span style={{ fontSize: 11, color: '#1AABA8', fontWeight: 600 }}>Optional</span>
              </div>
              <input
                id="signup-tin"
                type="text"
                placeholder="Optional 12-digit e-TIN..."
                value={tin}
                onChange={e => setTin(e.target.value)}
                className="glass-input"
                style={{ marginTop: 6 }}
                maxLength={12}
              />
            </div>

            {/* Optional Initial Document Upload */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={labelStyle}>Upload Initial Documents</label>
                <span style={{ fontSize: 11, color: '#1AABA8', fontWeight: 600 }}>Optional</span>
              </div>
              <div style={{
                border: '1.5px dashed #1AABA8',
                borderRadius: 10,
                padding: '12px 14px',
                background: '#fff',
                textAlign: 'center',
                cursor: 'pointer',
                position: 'relative'
              }}>
                <input
                  type="file"
                  accept=".pdf,.jpg,.png,.jpeg"
                  onChange={handleFileUpload}
                  style={{
                    position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%'
                  }}
                />
                <span style={{ fontSize: 13, color: '#0D8C89', fontWeight: 600 }}>
                  📄 Choose NID, e-TIN, or Trade License PDF/Image
                </span>
              </div>
              {uploadedDocs.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {uploadedDocs.map((doc, idx) => (
                    <div key={idx} style={{ fontSize: 11, background: '#E6F4F1', color: '#0D8C89', padding: '4px 8px', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>📎 {doc.filename}</span>
                      <span>{doc.size}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(224,92,46,0.08)', border: '1px solid rgba(224,92,46,0.3)', color: '#E05C2E', fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="signup-submit"
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#6ba8c4' : 'linear-gradient(135deg, #1AABA8 0%, #0077B3 100%)',
                color: '#fff', border: 'none',
                borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', marginTop: 4,
                boxShadow: '0 4px 18px rgba(0,119,179,0.25)',
              }}
              onMouseOver={e => { if (!loading) e.currentTarget.style.opacity = '0.9'; }}
              onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
            >
              {loading ? 'Creating account…' : 'Create Account →'}
            </button>

            <p style={{ fontSize: 11, color: '#5B7D91', textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>

          {/* Switch to login */}
          <p style={{ textAlign: 'center', fontSize: 14, color: '#5B7D91', marginTop: 24 }}>
            Already have an account?{' '}
            <button
              onClick={onGoLogin}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0077B3', fontWeight: 700, fontSize: 14, padding: 0 }}
            >
              Log In
            </button>
          </p>
        </div>
      </div>

      {/* 6-DIGIT EMAIL VERIFICATION OTP MODAL */}
      {showOtpModal && (
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
                📧
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0D2233', margin: '0 0 6px' }}>
                Email Verification Required
              </h3>
              <p style={{ fontSize: 13, color: '#5B7D91', margin: 0 }}>
                We sent a 6-digit verification code to <strong>{email}</strong>. Please check your inbox.
              </p>
            </div>

            <form onSubmit={verifyAndCompleteSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2E5369', marginBottom: 6 }}>
                  Enter 6-Digit OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                  placeholder="e.g. 849201"
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: '2px solid #0077B3',
                    textAlign: 'center', fontSize: 22, fontFamily: 'monospace', letterSpacing: 6, fontWeight: 900, color: '#0077B3'
                  }}
                  autoFocus
                />
              </div>

              {otpError && (
                <div style={{ fontSize: 12, color: '#E05C2E', fontWeight: 700, textAlign: 'center' }}>
                  {otpError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #D1E8E2', background: '#f8fafc', color: '#5B7D91', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: '#0077B3', color: '#ffffff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                >
                  {loading ? 'Verifying...' : 'Verify & Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#0D2233',
};
