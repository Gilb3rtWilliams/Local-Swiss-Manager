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

const refreshStatus = useCallback(async () => {
  if (!isDesktop) {
    setStatus("loggedOut");
    return;
  }
  const s = await window.swissManagerDesktop.authStatus();
  setStatus(s.loggedIn ? "loggedIn" : "loggedOut");
}, []);

const login = useCallback(async (password) => {
  if (!isDesktop) return { ok: false, error: "Not available here." };
  const result = await window.swissManagerDesktop.login(password);
  if (result.ok) {
    setSubscriptionActive(!!result.subscriptionActive);
    setStatus("loggedIn");
  }
  return result;
}, []);

const logout = useCallback(async () => {
  if (!isDesktop) return;
  await window.swissManagerDesktop.logout();
  setSubscriptionActive(false);
  setStatus("loggedOut");
}, []);

const checkEntitled = useCallback(
  () =>
    isDesktop
      ? window.swissManagerDesktop.isEntitled()
      : Promise.resolve(false),
  [],
);
export function AuthProvider({ children }) {
  // null = still checking on first load, true/false once we know.
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
    if (isDesktop) return; // nothing to do — already authenticated locally
    await api.login(password); // throws with a real message on wrong password
    setAuthenticated(true);
  }

  async function logout() {
    if (isDesktop) return; // no session to clear locally
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
