/**
 * Single source of truth for talking to the TaxEaseBD backend.
 *
 * Previously the API base URL (http://127.0.0.1:8000) was hardcoded
 * separately in AuthModal.tsx and AssistantView.tsx, while the backend's
 * own docstring told you to run it on port 8001 - a silent mismatch.
 * Now there is exactly one place this is defined, and it is configurable
 * via NEXT_PUBLIC_API_BASE_URL for deployments where frontend and backend
 * aren't both on localhost.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

export interface ManagedCompany {
  id: string;
  company_name: string;
  entity_type: string;
  tin?: string | null;
  bin?: string | null;
  trade_license?: string | null;
  business_address?: string | null;
}

export interface UploadedDocItem {
  docId: string;
  filename: string;
  uploadedAt: string;
  size: string;
  category?: string;
  status: 'Verified' | 'Pending';
  dataUrl?: string;
}

export interface UserProfile {
  email: string;
  name: string;
  tin?: string | null;
  entity_type?: string | null;
  phone?: string | null;
  company_name?: string | null;
  business_address?: string | null;
  nid?: string | null;
  tax_zone?: string | null;
  managed_companies?: ManagedCompany[] | null;
  uploaded_documents?: UploadedDocItem[] | null;
  created_at?: string | null;
}

interface StoredSession {
  token: string;
  user: UserProfile;
}

const SESSION_KEY = 'taxeasebd_session';

export function saveSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

function authHeaders(): Record<string, string> {
  const session = loadSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

/** fetch() wrapper that points at the API base URL and attaches the auth token, if any. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
}

/** Extracts a human-readable error message from a failed API response. */
export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.message || fallback;
  } catch {
    return fallback;
  }
}

export async function updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile> {
  try {
    const res = await apiFetch('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const result = await res.json();
      const updatedUser: UserProfile = result.user;

      const currentSession = loadSession();
      if (currentSession) {
        saveSession({
          ...currentSession,
          user: updatedUser,
        });
      }
      return updatedUser;
    }
  } catch (err) {
    console.warn('Backend API profile update unreachable, saving locally to session:', err);
  }

  // Offline / Guest session fallback: update profile in local session storage
  const currentSession = loadSession();
  const baseUser: UserProfile = currentSession?.user || {
    email: data.email || 'taxpayer@taxeasebd.com',
    name: data.name || 'Taxpayer',
  };

  const updatedUser: UserProfile = {
    ...baseUser,
    ...data,
  };

  saveSession({
    token: currentSession?.token || 'local_session_token',
    user: updatedUser,
  });

  return updatedUser;
}
