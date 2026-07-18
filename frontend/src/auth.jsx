import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// In-memory session (no browser storage per platform constraints).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(true);

  async function login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(user);
    return user;
  }
  async function register(name, email, password) {
    const { token, user } = await api.post('/auth/register', { name, email, password });
    setToken(token);
    setUser(user);
    return user;
  }
  function logout() {
    setToken(null);
    setUser(null);
  }

  const value = { user, ready, login, register, logout, isAdmin: user?.role === 'admin', hasToken: !!getToken() };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
