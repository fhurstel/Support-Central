// Authentication context and API client for the frontend.
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = '/api';

// ── CSRF Token Helper (C6) ──────────────────────────────────────────────────
function getCsrfToken() {
  const match = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
  return match ? match.split('=')[1] : null;
}

// ── Mutating methods that need CSRF header ──────────────────────────────────
const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

async function apiFetch(path, options = {}, token = null, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // C6: Add X-CSRF-Token header to all mutating requests
  if (options.method && MUTATING_METHODS.includes(options.method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    // C7: Token refresh on 401 — but never for the auth endpoints themselves:
    // a wrong password must surface as an error on the login form, not clear
    // storage and hard-reload the page.
    const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/refresh');
    if (res.status === 401 && retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem('fiji_refresh_token');
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            localStorage.setItem('fiji_token', refreshData.access_token);
            if (refreshData.refresh_token) {
              localStorage.setItem('fiji_refresh_token', refreshData.refresh_token);
            }
            // Update in-memory token and retry original request
            setToken(refreshData.access_token);
            return apiFetch(path, options, refreshData.access_token, false);
          }
        } catch {
          // Refresh failed — fall through to logout
        }
      }
      // Refresh failed or no refresh token — clear and redirect
      localStorage.removeItem('fiji_token');
      localStorage.removeItem('fiji_refresh_token');
      localStorage.removeItem('fiji_user');
      window.location.href = '/login';
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    // H9: Network failure detection
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Network error — please check your connection and try again.');
    }
    throw err;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('fiji_token');
    const savedUser = localStorage.getItem('fiji_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  // H9: Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!data) throw new Error('Login failed');
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem('fiji_token', data.access_token);
    localStorage.setItem('fiji_user', JSON.stringify(data.user));
    // C5: Store refresh token separately
    if (data.refresh_token) {
      localStorage.setItem('fiji_refresh_token', data.refresh_token);
    }
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('fiji_token');
    localStorage.removeItem('fiji_refresh_token');
    localStorage.removeItem('fiji_user');
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isTech = user?.role === 'TECHNICIAN' || user?.role === 'ADMIN';
  const isGuest = user?.role === 'GUEST';

  // Token-bound API fetch for use in pages
  const boundApiFetch = useCallback(
    (path, options = {}) => apiFetch(path, options, token),
    [token]
  );

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, isAdmin, isTech, isGuest, apiFetch: boundApiFetch, isOnline }}>
      {children}
      {/* H9: Offline indicator */}
      {!isOnline && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#dc2626', color: '#fff', textAlign: 'center',
          padding: 8, fontSize: 13, zIndex: 9999,
        }}>
          ⚠ You are offline — some features may be unavailable
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Authenticated fetch helper
export const useApi = () => {
  const { token } = useAuth();
  return useCallback(
    (path, options = {}) => apiFetch(path, options, token),
    [token]
  );
};
