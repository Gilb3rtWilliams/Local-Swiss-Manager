// auth/usePublishStatus.js
// ─────────────────────────────────────────────────────────────────────────
// Live publishing status for one tournament, straight from the desktop app's
// sync loop (window.swissManagerDesktop.publishStatus). Returns
// { status: null, available: false } outside the desktop app, so callers can
// render nothing there.
//
// status = {
//   enabled, state, synced, steps: { saved, uploaded, verified },
//   pendingChanges, lastSyncedAt, error, errorKind,
//   adminUrl, publicUrl, webOrigin
// }
// state: "off" | "hiding" | "syncing" | "live" | "offline" | "error"
//        | "needs_login" | "subscription"
//
// Polls quickly while something is in flight and slowly otherwise.

import { useCallback, useEffect, useRef, useState } from "react";

const FAST_MS = 1500;
const SLOW_MS = 5000;
const HIDDEN_MS = 15000;

export default function usePublishStatus(tournamentId) {
  const desktop =
    typeof window !== "undefined" ? window.swissManagerDesktop : undefined;
  const available = Boolean(desktop?.publishStatus);
  const [status, setStatus] = useState(null);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    if (!available || !tournamentId) return null;
    try {
      const s = await desktop.publishStatus(tournamentId);
      setStatus(s);
      return s;
    } catch {
      return null; // keep showing the last known status
    }
  }, [available, desktop, tournamentId]);

  useEffect(() => {
    setStatus(null);
    if (!available || !tournamentId) return undefined;
    let cancelled = false;

    async function tick() {
      const s = await refresh();
      if (cancelled) return;
      const busy =
        s &&
        (s.state === "syncing" || s.state === "hiding" || s.pendingChanges);
      timer.current = setTimeout(
        tick,
        document.hidden ? HIDDEN_MS : busy ? FAST_MS : SLOW_MS,
      );
    }
    function onVisible() {
      if (document.hidden) return;
      clearTimeout(timer.current);
      tick();
    }

    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [available, tournamentId, refresh]);

  return { status, refresh, available };
}
