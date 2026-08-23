'use client';

import React, { useEffect, useState } from 'react';
import { LanguageProvider } from '@/context/LanguageContext';
import { loadSession, clearSession, UserProfile } from '@/lib/api';
import Navbar from '@/components/Navbar';
import DashboardView from '@/components/DashboardView';
import CalculatorView from '@/components/CalculatorView';
import SimulatorView from '@/components/SimulatorView';
import FormsView from '@/components/FormsView';
import MushakView from '@/components/MushakView';
import CalendarView from '@/components/CalendarView';
import AssistantView from '@/components/AssistantView';
import ProfileView from '@/components/ProfileView';
import LandingPage from '@/components/LandingPage';
import LoginPage from '@/components/LoginPage';
import SignupPage from '@/components/SignupPage';

type Screen = 'landing' | 'login' | 'signup' | 'app';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [user, setUser] = useState<UserProfile | null>(null);

  // Restore a previous session on load, instead of always starting logged out,
  // and drop the returning user straight back into the dashboard.
  useEffect(() => {
    const session = loadSession();
    if (session?.user) {
      setUser(session.user);
      setScreen('app');
    }
  }, []);

  const handleEnterApp = (view: string) => {
    setActiveTab(view);
    setScreen('app');
  };

  const handleGoHome = () => setScreen('landing');
  const handleOpenLogin = () => setScreen('login');
  const handleOpenSignup = () => setScreen('signup');

  const handleAuthSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setActiveTab('dashboard');
    setScreen('app');
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setScreen('landing');
  };

  if (screen === 'login') {
    return (
      <LanguageProvider>
        <LoginPage onLogin={handleAuthSuccess} onGoSignup={handleOpenSignup} onGoHome={handleGoHome} />
      </LanguageProvider>
    );
  }

  if (screen === 'signup') {
    return (
      <LanguageProvider>
        <SignupPage onSignup={handleAuthSuccess} onGoLogin={handleOpenLogin} onGoHome={handleGoHome} />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <div style={{ minHeight: '100vh', background: '#F0F8FF', color: '#1a2e3b', display: 'flex', flexDirection: 'column' }}>
        {screen === 'landing' ? (
          <LandingPage
            onEnterApp={handleEnterApp}
            onGoLogin={handleOpenLogin}
            onGoSignup={handleOpenSignup}
            isLoggedIn={!!user}
          />
        ) : (
          <>
            {/* Top Sticky Navigation */}
            <Navbar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onGoHome={handleGoHome}
              user={user}
              onOpenLogin={handleOpenLogin}
              onOpenSignup={handleOpenSignup}
              onLogout={handleLogout}
            />

            {/* Main Content Area */}
            <main style={{ flex: 1, maxWidth: 1280, width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>
              {activeTab === 'dashboard' && <DashboardView setActiveTab={setActiveTab} />}
              {activeTab === 'calculator' && <CalculatorView />}
              {activeTab === 'simulator' && <SimulatorView setActiveTab={setActiveTab} />}
              {activeTab === 'forms' && <FormsView />}
              {activeTab === 'mushak' && <MushakView />}
              {activeTab === 'calendar' && <CalendarView />}
              {activeTab === 'assistant' && <AssistantView />}
              {activeTab === 'profile' && <ProfileView user={user} onUpdateUser={setUser} setActiveTab={setActiveTab} />}
            </main>

            {/* Footer */}
            <footer style={{
              borderTop: '1px solid #A3D1E0',
              background: '#FFFFFF',
              padding: '20px 1.5rem',
              marginTop: 'auto',
            }}>
              <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#5a7a8a', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, color: '#0077B3' }}>TaxEaseBD</span>
                  <span>— Smart Business Compliance Platform for Bangladesh</span>
                </div>
                <span>Aligned with NBR Finance Acts 2024–2026 &amp; Companies Act 1994</span>
              </div>
            </footer>
          </>
        )}
      </div>
    </LanguageProvider>
  );
}
