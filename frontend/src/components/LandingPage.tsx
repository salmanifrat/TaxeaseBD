'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';

const FREE_LIMIT = 5;
const STORAGE_KEY = 'taxeasebd_free_questions';

interface LandingPageProps {
  onEnterApp: (view: string) => void;
  onGoLogin?: () => void;
  onGoSignup?: () => void;
  isLoggedIn?: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

const aiResponses: Record<string, string> = {
  vat: "Under the NBR VAT & Supplementary Duty Act 2012, businesses with annual turnover below ৳80 Lakh qualify for a 3% Turnover Tax instead of standard 15% VAT. Registration threshold is ৳80 Lakh.\n\n🔗 [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)",
  tax: "Individual income tax in Bangladesh follows progressive slabs under Income Tax Act 2023: 0% up to ৳3.75 Lakh, 10% for the next ৳3 Lakh, 15% for the next ৳4 Lakh, 20% for next ৳5 Lakh, and 25% above. Minimum tax is ৳5,000.\n\n🔗 [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)",
  license: "A Trade License from your local City Corporation (DSCC/DNCC) or Municipality is mandatory to operate any business in Bangladesh. Proof of Submission of Return (PSR) under NBR Section 184 is required for renewal.\n\n🔗 [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)",
  rjsc: "For Private Limited Companies (LLC), RJSC requires an Annual Return (Form 23) and audited financial statements to be filed within 30 days of the AGM, along with statutory NBR compliance proof.\n\n🔗 [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)",
  default: "Based on verified NBR Circulars and Finance Acts: Requirements include valid E-TIN, Trade License, and registered business bank account. For full grounded answers, check the AI Assistant inside the dashboard.\n\n🔗 [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)",
};

function getAIResponse(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('vat') || lower.includes('ভ্যাট') || lower.includes('turnover')) return aiResponses.vat;
  if (lower.includes('income tax') || lower.includes('আয়কর') || lower.includes('slab')) return aiResponses.tax;
  if (lower.includes('trade license') || lower.includes('ট্রেড লাইসেন্স')) return aiResponses.license;
  if (lower.includes('rjsc') || lower.includes('annual return') || lower.includes('company')) return aiResponses.rjsc;
  return aiResponses.default;
}

function renderLandingFormattedText(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)|(https?:\/\/[^\s\)]+)/g;
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(line)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIdx) {
        nodes.push(line.substring(lastIdx, matchIndex));
      }

      const mdLinkText = match[1];
      const mdUrl = match[2];
      const rawUrl = match[3];

      const url = mdUrl || rawUrl;
      const linkLabel = mdLinkText || (rawUrl.includes('nbr.gov.bd') ? 'Official NBR Gazette Source PDF' : rawUrl);

      nodes.push(
        <a
          key={`landing-link-${lineIdx}-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 700,
            color: '#005580',
            backgroundColor: '#E6F3FF',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid #B3D9FF',
            marginTop: '4px',
            marginBottom: '4px',
            textDecoration: 'underline'
          }}
        >
          <span>{linkLabel}</span>
          <ExternalLink style={{ width: 12, height: 12, flexShrink: 0 }} />
        </a>
      );

      lastIdx = matchIndex + match[0].length;
    }

    if (lastIdx < line.length) {
      nodes.push(line.substring(lastIdx));
    }

    return (
      <div key={lineIdx} style={{ minHeight: '1.2em', marginBottom: line.trim() === '' ? 4 : 0 }}>
        {nodes.length > 0 ? nodes : line}
      </div>
    );
  });
}

export default function LandingPage({ onEnterApp, onGoLogin, onGoSignup, isLoggedIn = false }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: '0', role: 'ai',
    text: "👋 Hi! I'm TaxEase AI. Ask me anything about Bangladeshi tax law, VAT, trade licenses, or RJSC filings. You have 5 free questions — no signup needed!",
  }]);
  const [input, setInput] = useState('');
  const [freeCount, setFreeCount] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleLogin = () => {
    if (onGoLogin) {
      onGoLogin();
    } else {
      onEnterApp('dashboard');
    }
  };

  const handleSignup = () => {
    if (onGoSignup) {
      onGoSignup();
    } else {
      onEnterApp('dashboard');
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    setFreeCount(stored);
    if (stored >= FREE_LIMIT) setLimitReached(true);
  }, []);

  useEffect(() => {
    if (chatOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  const handleSend = () => {
    if (!input.trim() || aiTyping) return;
    if (limitReached) return;

    const newCount = freeCount + 1;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAiTyping(true);

    setTimeout(() => {
      const response = getAIResponse(input);
      const aiMsg: ChatMsg = { id: (Date.now() + 1).toString(), role: 'ai', text: response };
      setMessages(prev => [...prev, aiMsg]);
      setAiTyping(false);
      setFreeCount(newCount);
      localStorage.setItem(STORAGE_KEY, String(newCount));
      if (newCount >= FREE_LIMIT) setLimitReached(true);
    }, 900);
  };

  const handleFeatureClick = (view: string) => {
    if (isLoggedIn) {
      onEnterApp(view);
    } else if (onGoLogin) {
      onGoLogin();
    } else {
      onEnterApp(view);
    }
  };

  const features = [
    { icon: '🧮', title: 'Tax Calculator', desc: 'Accurate NBR tax computation for individuals, businesses & companies', view: 'calculator' },
    { icon: '🤖', title: 'AI Assistant', desc: 'Ask anything about Bangladeshi tax law, VAT, and compliance', view: 'assistant' },
    { icon: '🏠', title: 'Home', desc: 'Full overview of your tax obligations and compliance status', view: 'dashboard' },
    { icon: '📋', title: 'RJSC Forms', desc: 'Pre-filled business registration and annual return forms', view: 'forms' },
    { icon: '📅', title: 'Tax Calendar', desc: 'Never miss a deadline with smart compliance alerts', view: 'calendar' },
    { icon: '🧾', title: 'Mushak Ledger', desc: 'Mushak 6.3 & 9.1 VAT ledger generation made easy', view: 'mushak' },
  ];

  const navItems = [
    { label: 'Calculator', view: 'calculator' },
    { label: 'AI Assistant', view: 'assistant' },
    { label: 'Tax Calendar', view: 'calendar' },
    { label: 'Mushak', view: 'mushak' },
    { label: 'RJSC Forms', view: 'forms' },
  ];

  const remaining = Math.max(0, FREE_LIMIT - freeCount);

  return (
    <div style={{ background: '#F0F8FF', color: '#0D2233', fontFamily: "'Inter', system-ui, sans-serif", minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(240,248,255,0.97)' : 'rgba(240,248,255,0.9)',
        backdropFilter: 'blur(18px)',
        borderBottom: scrolled ? '1px solid #A3D1E0' : '1px solid transparent',
        transition: 'all 0.3s ease',
        padding: '0 2rem',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 66 }}>

          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', border: '2px solid #0077B3' }}>
              <img src="/logo.jpg" alt="TaxEaseBD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{ fontWeight: 900, fontSize: 18, color: '#0077B3', letterSpacing: '-0.5px' }}>TaxEaseBD</span>
          </button>

          {/* Nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {navItems.map(item => (
              <button key={item.view} onClick={() => handleFeatureClick(item.view)}
                style={navLinkStyle}
                onMouseOver={e => { e.currentTarget.style.color = '#0077B3'; e.currentTarget.style.background = 'rgba(0,119,179,0.07)'; }}
                onMouseOut={e => { e.currentTarget.style.color = '#2E5369'; e.currentTarget.style.background = 'none'; }}>
                {item.label}
              </button>
            ))}

            {isLoggedIn ? (
              <button onClick={() => onEnterApp('dashboard')}
                style={{ background: '#0077B3', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', marginLeft: 6 }}
                onMouseOver={e => e.currentTarget.style.background = '#005f8e'}
                onMouseOut={e => e.currentTarget.style.background = '#0077B3'}>
                Go to Home →
              </button>
            ) : (
              <>
                <button onClick={handleLogin}
                  style={{ ...navLinkStyle, border: '1.5px solid #A3D1E0', borderRadius: 20, padding: '7px 17px', color: '#0077B3', marginLeft: 6 }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#0077B3'; e.currentTarget.style.background = 'rgba(0,119,179,0.05)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = '#A3D1E0'; e.currentTarget.style.background = 'none'; }}>
                  Log In
                </button>
                <button onClick={handleSignup}
                  style={{ background: '#0077B3', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={e => e.currentTarget.style.background = '#005f8e'}
                  onMouseOut={e => e.currentTarget.style.background = '#0077B3'}>
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F0F8FF', padding: '120px 2rem 80px', textAlign: 'center',
      }}>
        {/* Logo mark */}
        <div style={{ width: 80, height: 80, borderRadius: 20, overflow: 'hidden', border: '2.5px solid #A3D1E0', boxShadow: '0 8px 32px rgba(0,119,179,0.12)', marginBottom: 26 }}>
          <img src="/logo.jpg" alt="TaxEaseBD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Brand name */}
        <h1 style={{ fontSize: 'clamp(2.6rem, 6vw, 4rem)', fontWeight: 900, color: '#0077B3', letterSpacing: '-2px', marginBottom: 0, lineHeight: 1.05 }}>
          TaxEaseBD
        </h1>

        {/* Divider */}
        <div style={{ width: 160, height: 1.5, background: 'linear-gradient(to right, transparent, #A3D1E0, transparent)', margin: '20px auto' }} />

        {/* Tagline */}
        <p style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: '#2E5369', maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.65, fontWeight: 400 }}>
          Bangladesh&apos;s Smart Tax &amp; Compliance Platform
        </p>
        <p style={{ fontSize: 13, color: '#5B7D91', marginBottom: 40 }}>
          NBR-aligned · Bilingual · AI-powered
        </p>

        {/* ── AI CHAT CTA ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button
            id="hero-ai-chat"
            onClick={() => setChatOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #E05C2E 0%, #c44b22 100%)',
              color: '#fff', border: 'none',
              borderRadius: 100, padding: '15px 38px', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.22s',
              boxShadow: '0 6px 24px rgba(224,92,46,0.35)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(224,92,46,0.45)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(224,92,46,0.35)'; }}
          >
            <span style={{ fontSize: 18 }}>🤖</span>
            Ask AI Tax Assistant
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(26,171,168,0.1)', border: '1px solid rgba(26,171,168,0.3)',
              borderRadius: 100, padding: '4px 12px', fontSize: 12, color: '#1AABA8', fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1AABA8', display: 'inline-block' }} />
              {remaining} free question{remaining !== 1 ? 's' : ''} remaining · No signup needed
            </span>
          </div>

          {!isLoggedIn && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={handleLogin}
                style={{ background: 'transparent', color: '#2E5369', border: '1.5px solid #A3D1E0', borderRadius: 100, padding: '10px 26px', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = '#0077B3'; e.currentTarget.style.color = '#0077B3'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#A3D1E0'; e.currentTarget.style.color = '#2E5369'; }}>
                Log In
              </button>
              <button onClick={handleSignup}
                style={{ background: '#0077B3', color: '#fff', border: 'none', borderRadius: 100, padding: '10px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 16px rgba(0,119,179,0.22)' }}
                onMouseOver={e => e.currentTarget.style.background = '#005f8e'}
                onMouseOut={e => e.currentTarget.style.background = '#0077B3'}>
                Sign Up Free
              </button>
            </div>
          )}
        </div>

        {/* Scroll hint */}
        <div style={{ marginTop: 56, opacity: 0.35 }}>
          <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
            <path d="M1 1L11 12L21 1" stroke="#0077B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ── INLINE AI CHATBOT PANEL ── */}
      {chatOpen && (
        <section style={{ padding: '0 2rem 80px', background: '#F0F8FF' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{
              background: '#FFFFFF', borderRadius: 20,
              border: '1.5px solid #A3D1E0',
              boxShadow: '0 12px 48px rgba(0,119,179,0.1)',
              overflow: 'hidden',
            }}>
              {/* Chat header */}
              <div style={{ background: 'linear-gradient(135deg, #0077B3 0%, #005f8e 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>TaxEase AI Assistant</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                      {limitReached ? '⚠ Free limit reached' : `${remaining} free question${remaining !== 1 ? 's' : ''} left`}
                    </div>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              </div>

              {/* Progress bar */}
              <div style={{ height: 3, background: '#D1E8E2' }}>
                <div style={{ height: '100%', width: `${(freeCount / FREE_LIMIT) * 100}%`, background: freeCount >= FREE_LIMIT ? '#E05C2E' : '#1AABA8', transition: 'width 0.4s' }} />
              </div>

              {/* Messages */}
              <div style={{ padding: '20px', height: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                    {msg.role === 'ai' && (
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,119,179,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🤖</div>
                    )}
                    <div style={{
                      maxWidth: '80%', padding: '10px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.55,
                      background: msg.role === 'user' ? '#0077B3' : '#F0F8FF',
                      color: msg.role === 'user' ? '#fff' : '#0D2233',
                      border: msg.role === 'ai' ? '1px solid #D1E8E2' : 'none',
                      borderTopLeftRadius: msg.role === 'ai' ? 4 : 14,
                      borderTopRightRadius: msg.role === 'user' ? 4 : 14,
                    }}>
                      {msg.role === 'user' ? msg.text : renderLandingFormattedText(msg.text)}
                    </div>
                  </div>
                ))}
                {aiTyping && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,119,179,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
                    <div style={{ padding: '10px 16px', borderRadius: 14, background: '#F0F8FF', border: '1px solid #D1E8E2', display: 'flex', gap: 4, alignItems: 'center' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#0077B3', animation: `bounce 1s ${i * 0.15}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Limit reached prompt */}
              {limitReached && (
                <div style={{ margin: '0 20px 12px', padding: '12px 16px', borderRadius: 12, background: 'rgba(224,92,46,0.08)', border: '1px solid rgba(224,92,46,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#E05C2E', fontWeight: 600 }}>🔒 Free limit reached. Sign up to continue.</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleLogin} style={{ background: 'none', border: '1.5px solid #A3D1E0', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#2E5369', cursor: 'pointer' }}>Log In</button>
                    <button onClick={handleSignup} style={{ background: '#E05C2E', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Sign Up Free</button>
                  </div>
                </div>
              )}

              {/* Input */}
              {!limitReached && (
                <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #D1E8E2', display: 'flex', gap: 8 }}>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Ask about VAT, income tax, trade license…"
                    className="glass-input"
                    style={{ flex: 1, padding: '10px 14px' }}
                    disabled={aiTyping}
                  />
                  <button
                    onClick={handleSend}
                    disabled={aiTyping || !input.trim()}
                    style={{
                      background: input.trim() && !aiTyping ? '#0077B3' : '#A3D1E0',
                      color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px',
                      fontWeight: 700, fontSize: 14, cursor: input.trim() && !aiTyping ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s', flexShrink: 0,
                    }}>
                    Send →
                  </button>
                </div>
              )}
            </div>

            {/* Quick prompts */}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {['What is the VAT threshold?', 'Income tax slabs 2026', 'Trade license requirements', 'RJSC annual return'].map(q => (
                <button key={q} onClick={() => { if (!limitReached) { setInput(q); setChatOpen(true); } }}
                  style={{
                    background: '#FFFFFF', border: '1px solid #A3D1E0', borderRadius: 100,
                    padding: '6px 14px', fontSize: 12, color: '#2E5369', fontWeight: 500, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#0077B3'; e.currentTarget.style.color = '#0077B3'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = '#A3D1E0'; e.currentTarget.style.color = '#2E5369'; }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURES ── */}
      <section style={{ padding: '90px 2rem', background: '#F0F8FF' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', background: '#D1E8E2', border: '1px solid #A3D1E0', borderRadius: 100, padding: '5px 16px', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1AABA8', letterSpacing: 1.5, textTransform: 'uppercase' }}>Full Platform</span>
            </div>
            <h2 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', fontWeight: 800, color: '#0077B3', letterSpacing: '-1px', marginBottom: 14 }}>
              Everything for Tax &amp; Compliance
            </h2>
            <p style={{ fontSize: 15, color: '#2E5369', maxWidth: 500, margin: '0 auto' }}>
              {isLoggedIn ? 'Click any card to jump straight in.' : 'Log in or sign up to access all features.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {features.map((f, i) => (
              <div
                key={i}
                id={`feature-${f.view}`}
                onClick={() => handleFeatureClick(f.view)}
                style={{
                  background: '#FFFFFF', border: '1.5px solid #D1E8E2', borderRadius: 16,
                  padding: '30px 26px', cursor: 'pointer', transition: 'all 0.22s',
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = '#0077B3';
                  e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,119,179,0.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#D1E8E2';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {!isLoggedIn && (
                  <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 12, color: '#5B7D91', background: '#F0F8FF', border: '1px solid #D1E8E2', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                    🔒 Login required
                  </div>
                )}
                <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0077B3', marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: '#2E5369', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                <div style={{ position: 'absolute', bottom: 18, right: 18, color: '#A3D1E0', fontSize: 18 }}>→</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA STRIP ── */}
      <section style={{ background: 'linear-gradient(135deg, #0077B3 0%, #005f8e 100%)', padding: '80px 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: 'rgba(26,171,168,0.25)', border: '1px solid rgba(26,171,168,0.5)', borderRadius: 100, padding: '5px 16px', marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#A3FFE6', letterSpacing: 1.5, textTransform: 'uppercase' }}>AI-Powered Compliance</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 800, color: '#FFFFFF', marginBottom: 14, letterSpacing: '-0.5px' }}>
            Ready to simplify your taxes?
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.78)', marginBottom: 36, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 36px' }}>
            {isLoggedIn
              ? 'Jump back into your dashboard and keep your compliance on track.'
              : 'Join thousands of Bangladeshi businesses. Create your free account and get full access.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {isLoggedIn ? (
              <button
                onClick={() => onEnterApp('dashboard')}
                style={{ background: '#FFFFFF', color: '#0077B3', border: 'none', borderRadius: 100, padding: '14px 38px', fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 0.22s', boxShadow: '0 6px 24px rgba(0,0,0,0.15)' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Go to Home →
              </button>
            ) : (
              <>
                <button
                  id="cta-signup"
                  onClick={handleSignup}
                  style={{ background: '#E05C2E', color: '#fff', border: 'none', borderRadius: 100, padding: '14px 38px', fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 0.22s', boxShadow: '0 6px 24px rgba(224,92,46,0.4)' }}
                  onMouseOver={e => { e.currentTarget.style.background = '#c44b22'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={e => { e.currentTarget.style.background = '#E05C2E'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  Sign Up Free →
                </button>
                <button
                  id="cta-login"
                  onClick={handleLogin}
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 100, padding: '14px 38px', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'all 0.22s' }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}>
                  Log In
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#0D2233', padding: '40px 2rem 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(163,209,224,0.3)' }}>
              <img src="/logo.jpg" alt="TaxEaseBD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#A3D1E0' }}>TaxEaseBD</span>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#5B7D91' }}>© 2026 TaxEaseBD. Smart Business Compliance Platform for Bangladesh.</span>
            <span style={{ fontSize: 12, color: '#5B7D91' }}>Aligned with NBR Finance Acts 2024–2026 &amp; Companies Act 1994</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2E5369', fontSize: 13,
  fontWeight: 500, cursor: 'pointer', padding: '8px 12px', borderRadius: 8,
  transition: 'all 0.2s',
};
