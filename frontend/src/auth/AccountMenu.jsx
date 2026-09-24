// AccountMenu.jsx  (renderer -- drop into your existing app shell's header)
// ─────────────────────────────────────────────────────────────────────────
// Drop this into wherever your app shell already has a header/toolbar. It
// needs nothing passed in -- it reads everything from useAuth(), so it can
// live anywhere inside <AuthGate> (see AuthGate.jsx), not just right next
// to it.
//
//   import AccountMenu from "./AccountMenu";
//   <header>
//     <Logo />
//     <AccountMenu />
//   </header>

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

// How often to re-poll entitlement while the app is open. This is a UI
// freshness concern, separate from (and much more frequent than) the main
// process's own entitlement.js re-check interval -- that one throttles
// actual network calls; this just re-reads whatever it last cached.
const RECHECK_INTERVAL_MS = 60 * 1000;

export default function AccountMenu() {
  const { email, logout, checkEntitled } = useAuth();
  const [entitled, setEntitled] = useState(true); // optimistic default; corrected below

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      checkEntitled().then((result) => {
        if (!cancelled) setEntitled(result);
      });
    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [checkEntitled]);

  return (
    <div style={styles.wrap}>
      <span style={styles.email}>{email}</span>
      {!entitled && (
        <span
          style={styles.badge}
          title="Publishing tournaments requires an active subscription."
        >
          Subscription inactive
        </span>
      )}
      <button type="button" onClick={logout} style={styles.button}>
        Sign out
      </button>
    </div>
  );
}

const styles = {
  wrap: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 },
  email: { color: "#444" },
  badge: {
    padding: "2px 8px",
    borderRadius: 999,
    background: "#fdecea",
    color: "#a33",
    fontSize: 11,
    fontWeight: 600,
  },
  button: {
    padding: "4px 10px",
    fontSize: 12,
    background: "transparent",
    border: "1px solid #ccc",
    borderRadius: 6,
    cursor: "pointer",
  },
};
