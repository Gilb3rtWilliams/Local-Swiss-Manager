// PublishToggle.jsx  (renderer -- drop into your tournament screen)
// ─────────────────────────────────────────────────────────────────────────
// Renders inside a single tournament's screen -- it needs the LOCAL
// tournament id (the one already in your `tournaments` table), not
// anything server-side.
//
//   <PublishToggle tournamentId={tournament.id} />
//
// Turning it on/off is IMMEDIATE locally (see outboxWriter.js's
// enable/disablePublishing -- no network round-trip needed to flip the
// toggle's own position), but making that take effect on the server
// (actually registering, or actually hiding) is outboxWorker.js's job and
// happens slightly after -- so this component polls publish:status for a
// few seconds after every toggle to show "Turning on…"/"Turning off…"
// rather than claiming to be done before it actually is.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

const POLL_WHILE_SYNCING_MS = 1500;
const POLL_IDLE_MS = 30000; // catches external changes, e.g. subscription lapsing elsewhere

export default function PublishToggle({ tournamentId }) {
  const { checkEntitled } = useAuth();
  const [entitled, setEntitled] = useState(true); // optimistic default, corrected below
  const [status, setStatus] = useState(null); // { enabled, synced, publicUrl } | null while loading
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollTimer = useRef(null);

  const refresh = useCallback(async () => {
    const [s, e] = await Promise.all([
      window.swissManagerDesktop.publishStatus(tournamentId),
      checkEntitled(),
    ]);
    setStatus(s);
    setEntitled(e);
    return s;
  }, [tournamentId, checkEntitled]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const s = await refresh();
      if (cancelled) return;
      pollTimer.current = setTimeout(
        tick,
        s.synced ? POLL_IDLE_MS : POLL_WHILE_SYNCING_MS,
      );
    }
    tick();

    return () => {
      cancelled = true;
      clearTimeout(pollTimer.current);
    };
  }, [refresh]);

  async function handleToggle() {
    if (submitting || !status) return;
    setSubmitting(true);
    setError(null);

    const turningOn = !status.enabled;
    if (turningOn && !entitled) {
      setError("Publishing requires an active subscription.");
      setSubmitting(false);
      return;
    }

    const result = turningOn
      ? await window.swissManagerDesktop.enablePublishing(tournamentId)
      : await window.swissManagerDesktop.disablePublishing(tournamentId);

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || "Something went wrong.");
      return;
    }
    // Re-poll immediately rather than waiting for the next scheduled tick,
    // so the UI reflects the new (still-syncing) state right away.
    clearTimeout(pollTimer.current);
    const s = await refresh();
    pollTimer.current = setTimeout(
      function tick2() {
        refresh().then((s2) => {
          pollTimer.current = setTimeout(
            tick2,
            s2.synced ? POLL_IDLE_MS : POLL_WHILE_SYNCING_MS,
          );
        });
      },
      s.synced ? POLL_IDLE_MS : POLL_WHILE_SYNCING_MS,
    );
  }

  async function handleCopyLink() {
    if (!status?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(status.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, older environments) -- the
      // link is still shown as selectable text below, so nothing is lost.
    }
  }

  if (!status) return null; // first load -- avoid flashing a wrong state

  const label = status.enabled
    ? status.synced
      ? "Live"
      : "Turning on…"
    : status.synced
    ? "Not published"
    : "Turning off…";

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          onClick={handleToggle}
          disabled={submitting}
          style={{
            ...styles.switch,
            background: status.enabled ? "#2b6cb0" : "#ccc",
          }}
        >
          <span
            style={{
              ...styles.knob,
              transform: status.enabled
                ? "translateX(18px)"
                : "translateX(2px)",
            }}
          />
        </button>
        <span style={styles.label}>Publish this tournament</span>
        <span
          style={{
            ...styles.badge,
            ...(status.enabled && status.synced
              ? styles.badgeLive
              : styles.badgeMuted),
          }}
        >
          {label}
        </span>
      </div>

      {!entitled && !status.enabled && (
        <p style={styles.hint}>Publishing requires an active subscription.</p>
      )}
      {error && (
        <p style={styles.error} role="alert">
          {error}
        </p>
      )}

      {status.enabled && status.cloudTournamentId && (
        <div style={styles.linkRow}>
          <input
            readOnly
            value={`https://local-swiss-manager.onrender.com/tournament/${status.cloudTournamentId}`}
            style={styles.linkInput}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopyLink}
            style={styles.copyButton}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { padding: 16, border: "1px solid #e2e2e2", borderRadius: 10 },
  row: { display: "flex", alignItems: "center", gap: 10 },
  switch: {
    position: "relative",
    width: 40,
    height: 22,
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  knob: {
    position: "absolute",
    top: 2,
    left: 0,
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#fff",
    transition: "transform 0.15s",
  },
  label: { fontSize: 14, fontWeight: 600 },
  badge: {
    marginLeft: "auto",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
  },
  badgeLive: { background: "#e6f4ea", color: "#1a7f37" },
  badgeMuted: { background: "#f0f0f0", color: "#777" },
  hint: { margin: "10px 0 0", fontSize: 12, color: "#888" },
  error: { margin: "10px 0 0", fontSize: 12, color: "#a33" },
  linkRow: { display: "flex", gap: 8, marginTop: 12 },
  linkInput: {
    flex: 1,
    padding: "6px 8px",
    fontSize: 12,
    border: "1px solid #ddd",
    borderRadius: 6,
    color: "#444",
  },
  copyButton: {
    padding: "6px 12px",
    fontSize: 12,
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#fff",
    cursor: "pointer",
  },
};
