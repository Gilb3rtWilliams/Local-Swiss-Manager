import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = still checking on first load, true/false once we know.
  const [authenticated, setAuthenticated] = useState(null);

  const refresh = useCallback(() => {
    api
      .getAuthStatus()
      .then((d) => setAuthenticated(d.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(password) {
    await api.login(password); // throws with a real message on wrong password
    setAuthenticated(true);
  }

  async function logout() {
    await api.logout();
    setAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ authenticated, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
  return ctx;
}
