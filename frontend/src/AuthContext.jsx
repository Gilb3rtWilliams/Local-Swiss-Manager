import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { api } from "./api.js";

const AuthContext = createContext(null);

// The desktop app's local server has no auth at all (requireAdmin is a
// no-op there — see desktop/backend-overrides/src/middleware/requireAdmin.js
// and GETTING_STARTED.md's note that desktop needs no JWT_SECRET/
// ADMIN_PASSWORD_HASH). Checking /api/auth/status locally would just 404
// forever, so skip the network round-trip entirely inside Electron and
// report authenticated immediately instead.
const isDesktop = typeof window !== "undefined" && !!window.swissManagerDesktop;

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(isDesktop ? true : null);

  const refresh = useCallback(() => {
    if (isDesktop) {
      setAuthenticated(true);
      return;
    }
    api
      .getAuthStatus()
      .then((d) => setAuthenticated(d.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(password) {
    if (isDesktop) return;
    await api.login(password);
    setAuthenticated(true);
  }

  async function logout() {
    if (isDesktop) return;
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
