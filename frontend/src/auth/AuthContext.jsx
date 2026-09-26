import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

const AuthContext = createContext(null);

const isDesktop = typeof window !== "undefined" && !!window.swissManagerDesktop;

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("checking");
  const [subscriptionActive, setSubscriptionActive] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!isDesktop) {
      setStatus("loggedOut");
      return;
    }
    const s = await window.swissManagerDesktop.authStatus();
    setStatus(s.loggedIn ? "loggedIn" : "loggedOut");
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

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

  return (
    <AuthContext.Provider
      value={{
        status,
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
