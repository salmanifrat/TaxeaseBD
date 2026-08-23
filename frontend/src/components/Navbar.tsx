'use client';

import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { UserProfile } from '@/lib/api';
import { 
  Calculator, 
  BarChart3, 
  FileCheck2, 
  Receipt, 
  CalendarDays, 
  Bot, 
  Globe, 
  LayoutDashboard,
  User,
  LogOut,
  LogIn
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onGoHome?: () => void;
  user?: UserProfile | null;
  onOpenLogin?: () => void;
  onOpenSignup?: () => void;
  onLogout?: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  onGoHome,
  user,
  onOpenLogin,
  onOpenSignup,
  onLogout,
}: NavbarProps) {
  const { t, language, toggleLanguage } = useLanguage();

  const navItems = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'calculator', label: t.nav.calculator, icon: Calculator },
    { id: 'simulator', label: t.nav.simulator, icon: BarChart3 },
    { id: 'forms', label: t.nav.forms, icon: FileCheck2 },
    { id: 'mushak', label: t.nav.mushak, icon: Receipt },
    { id: 'calendar', label: t.nav.calendar, icon: CalendarDays },
    { id: 'assistant', label: t.nav.assistant, icon: Bot },
    { id: 'profile', label: (t.nav as any).profile || 'My Profile', icon: User },
  ];

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(240,248,255,0.95)',
      backdropFilter: 'blur(14px)',
      borderBottom: '1px solid #A3D1E0',
      boxShadow: '0 2px 12px rgba(0,119,179,0.06)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 12 }}>

          {/* Brand Logo — home button */}
          <button
            onClick={onGoHome}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 10, overflow: 'hidden',
              border: '2px solid #0077B3', flexShrink: 0,
            }}>
              <img src="/logo.jpg" alt="TaxEaseBD" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#0077B3', letterSpacing: '-0.4px' }}>TaxEaseBD</span>
              <span style={{ fontSize: 10, color: '#5a7a8a', fontWeight: 500 }}>NBR FY26</span>
            </div>
          </button>

          {/* Single Clean Navigation Links Bar */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 3, overflowX: 'auto', padding: '4px 0' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                    padding: '7px 11px', borderRadius: 8,
                    fontSize: 12, fontWeight: isActive ? 700 : 500,
                    border: isActive ? '1px solid rgba(0,119,179,0.35)' : '1px solid transparent',
                    background: isActive ? 'rgba(0,119,179,0.1)' : 'transparent',
                    color: isActive ? '#0077B3' : '#1a2e3b',
                    cursor: 'pointer', transition: 'all 0.18s',
                  }}
                  onMouseOver={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,119,179,0.06)';
                      (e.currentTarget as HTMLButtonElement).style.color = '#0077B3';
                    }
                  }}
                  onMouseOut={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = '#1a2e3b';
                    }
                  }}
                >
                  <Icon style={{ width: 14, height: 14, color: isActive ? '#0077B3' : '#5a7a8a' }} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Controls: Language Switcher & User Auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={toggleLanguage}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 8,
                background: '#FFFFFF', border: '1.5px solid #A3D1E0',
                color: '#0077B3', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.18s',
              }}
            >
              <Globe style={{ width: 13, height: 13 }} />
              <span>{language === 'en' ? 'BN' : 'EN'}</span>
            </button>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setActiveTab('profile')}
                  title="View My Profile"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 20,
                    background: activeTab === 'profile' ? '#0077B3' : 'rgba(0,119,179,0.08)',
                    color: activeTab === 'profile' ? '#FFFFFF' : '#0077B3',
                    border: '1px solid #A3D1E0',
                    fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.18s',
                  }}
                >
                  <User style={{ width: 14, height: 14 }} />
                  <span>{user.name.split(' ')[0]}</span>
                </button>
                <button
                  onClick={onLogout}
                  title="Log Out"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '6px 8px', borderRadius: 8,
                    background: '#FFFFFF', border: '1px solid #FCA5A5',
                    color: '#DC2626', cursor: 'pointer', transition: 'all 0.18s',
                  }}
                >
                  <LogOut style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={onOpenLogin}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    background: 'transparent', border: '1.5px solid #A3D1E0',
                    color: '#0077B3', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.18s',
                  }}
                >
                  Log In
                </button>
                <button
                  onClick={onOpenSignup}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    background: '#0077B3', border: 'none',
                    color: '#FFFFFF', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.18s',
                  }}
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
