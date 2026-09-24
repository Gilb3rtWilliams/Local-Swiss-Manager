// AuthContext.jsx  (renderer -- drop into your existing React app)
// ─────────────────────────────────────────────────────────────────────────
// Makes login state available to any component via useAuth(), not just
// whatever sits directly under <AuthGate>. Header/account menus, a "you
// must be signed in to publish" banner deep in some other screen, etc. can
// all just call useAuth() instead of having the info threaded down as
// props from App.jsx.
//
// This context holds UI-relevant auth state (email, logged in, entitled)
// derived from main-process IPC calls -- it never touches the token itself,
// which stays in the OS keychain (see authStore.js) and is never sent to
// the renderer.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // status: "checking" | "loggedOut" | "loggedIn"
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);

  const refreshStatus = useCallback(async () => {
    const s = await window.swissManagerDesktop.authStatus();
    setStatus(s.loggedIn ? "loggedIn" : "loggedOut");
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const login = useCallback(async (emailInput, password) => {
    const result = await window.swissManagerDesktop.login(emailInput, password);
    if (result.ok) {
      setEmail(result.email);
      setSubscriptionActive(!!result.subscriptionActive);
      setStatus("loggedIn");
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await window.swissManagerDesktop.logout();
    setEmail(null);
    setSubscriptionActive(false);
    setStatus("loggedOut");
  }, []);

  // isEntitled() reflects the cached subscription check (see
  // publishing/entitlement.js) -- separate from `status` above, since
  // someone can be logged IN with a LAPSED subscription (still allowed to
  // run tournaments locally, just not to publish). Re-checked whenever
  // something cares, rather than polled continuously.
  const checkEntitled = useCallback(
    () => window.swissManagerDesktop.isEntitled(),
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        status,
        email,
        subscriptionActive,
        login,
        logout,
        checkEntitled,
        refreshStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be called inside <AuthProvider>.");
  return ctx;
}
