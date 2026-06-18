import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('oration_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('oration_token')) return;
    api('/auth/me')
      .then((data) => {
        setUser(data.user);
        localStorage.setItem('oration_user', JSON.stringify(data.user));
      })
      .catch(() => logout());
  }, []);

  async function login(email, password) {
    setLoading(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('oration_token', data.token);
      localStorage.setItem('oration_user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('oration_token');
    localStorage.removeItem('oration_user');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout, loading }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

