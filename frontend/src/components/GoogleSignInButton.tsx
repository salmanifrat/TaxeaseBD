'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Renders Google's own "Continue with Google" button via Google Identity
 * Services (https://accounts.google.com/gsi/client) - loaded directly as
 * a <script>, no npm package, matching the rest of the backend/frontend's
 * "keep dependencies small" approach.
 *
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID set (frontend/.env.local) to match
 * GOOGLE_CLIENT_ID in backend/.env - see backend/google_oauth.py. Renders
 * nothing at all if that's not configured, rather than showing a button
 * that would just fail.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('google script failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('google script failed'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with' }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // onCredential can be a fresh closure every render; keep the latest one
  // in a ref so the one-time initialize() call below always invokes the
  // current handler instead of whichever was passed in on mount. Updated
  // in its own effect rather than during render - a ref must never be
  // written while rendering.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onCredentialRef.current(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          width: 380,
          text,
          shape: 'pill',
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => { cancelled = true; };
  }, [text]);

  if (!CLIENT_ID || failed) return null;

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }} />;
}
