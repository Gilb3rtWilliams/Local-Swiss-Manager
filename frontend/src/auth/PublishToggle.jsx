// auth/PublishToggle.jsx  (desktop app only)
// ─────────────────────────────────────────────────────────────────────────
// "Live Publish" card. Switching it on puts the tournament on the website and
// KEEPS it in step automatically (see publishing/publishSync.js) — this
// component just shows what is really happening:
//
//   Saved on this computer → Uploaded to the website → Checked on the public page
//
// and, once it has reached the website, a link to the ADMIN view of the
// tournament online, so the arbiter can open it and confirm it matches what
// they see here. (The link spectators use is the "Pairings & Standings Link"
// card above this one.)
//
//   <PublishToggle tournamentId={t.id} onBeforeEnable={ensurePublicView} />
//
// `onBeforeEnable` (optional, async) runs just before publishing is switched
// on — Overview uses it to make sure the tournament has its spectator link.

import { useState } from "react";
import usePublishStatus from "./usePublishStatus";

const BADGE = {
  off: ["Not published", "muted"],
  hiding: ["Hiding…", "muted"],
  syncing: ["Syncing…", "info"],
  live: ["Live", "ok"],
  offline: ["Offline", "warn"],
  error: ["Needs attention", "bad"],
  needs_login: ["Sign in required", "warn"],
  subscription: ["Subscription needed", "warn"],
};

function ago(iso) {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describe(s) {
  switch (s.state) {
    case "off":
      return "Turn on to put this tournament on the website. After that, every change you make here is sent automatically.";
    case "hiding":
      return "Removing this tournament from the website…";
    case "live":
      return `Everything on this computer is on the website${
        s.lastSyncedAt ? ` · last synced ${ago(s.lastSyncedAt)}` : ""
      }.`;
    case "offline":
      return "No connection. Your changes are saved on this computer and will upload by themselves as soon as you're back online.";
    case "needs_login":
      return "Sign in (top right of the app) to publish. Your changes will upload once you're signed in.";
    case "subscription":
      return "Publishing needs an active subscription. Your changes are safe on this computer.";
    case "error":
      return "The website hasn't confirmed the latest changes yet. It keeps retrying.";
    default:
      return s.pendingChanges
        ? "Sending your latest changes to the website…"
        : "Sending this tournament to the website…";
  }
}

// done | active | wait | fail for each of the three steps
function stepStates(s) {
  const failed = s.state === "error" || s.state === "offline";
  const uploaded = s.steps.uploaded;
  const verified = s.steps.verified;
  return [
    { label: "Saved on this computer", st: "done" },
    {
      label: "Uploaded to the website",
      st: uploaded ? "done" : failed ? "fail" : "active",
    },
    {
      label: "Checked on the public page",
      st: verified ? "done" : !uploaded ? "wait" : failed ? "fail" : "active",
    },
  ];
}

export default function PublishToggle({ tournamentId, onBeforeEnable }) {
  const { status, refresh, available } = usePublishStatus(tournamentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!available || !status) return null;
  const desktop = window.swissManagerDesktop;

  async function handleToggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!status.enabled) {
        if (onBeforeEnable) await onBeforeEnable();
        const r = await desktop.enablePublishing(tournamentId);
        if (!r?.ok) throw new Error(r?.error || "Couldn't turn publishing on.");
      } else {
        const ok = window.confirm(
          "Hide this tournament from the website?\n\nNothing is deleted — you can turn publishing back on at any time.",
        );
        if (!ok) return;
        const r = await desktop.disablePublishing(tournamentId);
        if (!r?.ok)
          throw new Error(r?.error || "Couldn't turn publishing off.");
      }
      await refresh();
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    await desktop.syncPublishNow(tournamentId);
    refresh();
  }

  async function handleOpen() {
    setError(null);
    const r = await desktop.openOnline(status.adminUrl);
    if (!r?.ok) setError(r?.error || "Couldn't open the link.");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(status.adminUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the link is selectable text below, nothing is lost */
    }
  }

  const [badgeText, tone] = BADGE[status.state] || BADGE.syncing;
  const showSteps = status.enabled && status.state !== "live";
  const canRetry = ["offline", "error", "syncing"].includes(status.state);
  const reachedWebsite =
    status.enabled && (status.steps.uploaded || status.lastSyncedAt);

  return (
    <div className="pp">
      <style>{CSS}</style>

      <div className="pp-row">
        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          aria-label="Publish this tournament"
          className={`pp-switch${status.enabled ? " is-on" : ""}`}
          onClick={handleToggle}
          disabled={busy || status.state === "hiding"}
        >
          <span className="pp-knob" />
        </button>
        <span className="pp-title">Publish this tournament</span>
        <span className={`pp-badge pp-badge--${tone}`} role="status">
          {(status.state === "syncing" || status.state === "hiding") && (
            <span className="pp-spin" aria-hidden="true" />
          )}
          {badgeText}
        </span>
      </div>

      <p className="pp-desc">{describe(status)}</p>

      {showSteps && (
        <ol className="pp-steps" aria-label="Publishing progress">
          {stepStates(status).map((step) => (
            <li key={step.label} className={`pp-step is-${step.st}`}>
              <span className="pp-dot" aria-hidden="true">
                {step.st === "done" ? "✓" : step.st === "fail" ? "!" : ""}
                {step.st === "active" && <span className="pp-spin" />}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      )}

      {(status.error || error) && (
        <div className="pp-alert" role="alert">
          {error || status.error}
        </div>
      )}

      {canRetry && status.enabled && (
        <button type="button" className="pp-btn" onClick={handleRetry}>
          Sync now
        </button>
      )}

      {reachedWebsite && (
        <div className="pp-links">
          <div className="pp-links-label">
            Admin view on the website
            <span>Open it to check that it matches what you see here.</span>
          </div>
          <div className="pp-linkrow">
            <input
              readOnly
              value={status.adminUrl}
              className="pp-input"
              onFocus={(e) => e.target.select()}
              aria-label="Admin link on the website"
            />
            <button
              type="button"
              className="pp-btn pp-btn--primary"
              onClick={handleOpen}
            >
              Open ↗
            </button>
            <button type="button" className="pp-btn" onClick={handleCopy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pp { --pp-b: var(--tp-border, #d9d2c0); --pp-m: var(--tp-muted, #7a7a8a); --pp-t: var(--tp-text, inherit); --pp-a: var(--tp-accent, var(--tp-brass, #b8863a)); }
.pp-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pp-title { font-size: 14px; font-weight: 700; }
.pp-switch { position: relative; flex: 0 0 auto; width: 44px; height: 26px; border-radius: 999px; border: 0; padding: 0; cursor: pointer; background: color-mix(in srgb, var(--pp-m) 45%, transparent); transition: background .15s; }
.pp-switch.is-on { background: var(--pp-a); }
.pp-switch:disabled { opacity: .6; cursor: progress; }
.pp-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.pp-switch.is-on .pp-knob { transform: translateX(18px); }
.pp-badge { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; background: color-mix(in srgb, var(--pp-m) 16%, transparent); color: var(--pp-m); }
.pp-badge--ok { background: color-mix(in srgb, #1fa463 18%, transparent); color: color-mix(in srgb, #1fa463 70%, var(--pp-t, #000)); }
.pp-badge--info { background: color-mix(in srgb, #3b82f6 16%, transparent); color: color-mix(in srgb, #3b82f6 70%, var(--pp-t, #000)); }
.pp-badge--warn { background: color-mix(in srgb, #d99a1c 20%, transparent); color: color-mix(in srgb, #d99a1c 65%, var(--pp-t, #000)); }
.pp-badge--bad { background: color-mix(in srgb, #e5484d 18%, transparent); color: color-mix(in srgb, #e5484d 75%, var(--pp-t, #000)); }
.pp-desc { margin: 10px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--pp-m); }
.pp-steps { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.pp-step { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--pp-m); }
.pp-step.is-done, .pp-step.is-active { color: var(--pp-t); }
.pp-step.is-fail { color: color-mix(in srgb, #e5484d 75%, var(--pp-t, #000)); }
.pp-dot { position: relative; flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--pp-b); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.pp-step.is-done .pp-dot { background: #1fa463; border-color: #1fa463; color: #fff; }
.pp-step.is-fail .pp-dot { background: #e5484d; border-color: #e5484d; color: #fff; }
.pp-spin { display: inline-block; width: 11px; height: 11px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: pp-rot .8s linear infinite; }
.pp-step.is-active .pp-dot .pp-spin { color: var(--pp-a); }
@keyframes pp-rot { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pp-spin { animation-duration: 2.4s; } .pp-knob, .pp-switch { transition: none; } }
.pp-alert { margin-top: 12px; padding: 9px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.5; border: 1px solid color-mix(in srgb, #e5484d 35%, transparent); background: color-mix(in srgb, #e5484d 9%, transparent); color: color-mix(in srgb, #e5484d 75%, var(--pp-t, #000)); overflow-wrap: anywhere; }
.pp-btn { margin-top: 12px; min-height: 38px; padding: 6px 14px; font: inherit; font-size: 12.5px; font-weight: 600; border-radius: 8px; border: 1px solid var(--pp-b); background: transparent; color: var(--pp-t); cursor: pointer; }
.pp-btn:hover { border-color: var(--pp-a); }
.pp-btn--primary { background: var(--pp-a); border-color: var(--pp-a); color: #fff; }
.pp-links { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--pp-b); }
.pp-links-label { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; font-weight: 700; }
.pp-links-label span { font-weight: 400; color: var(--pp-m); }
.pp-linkrow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.pp-linkrow .pp-btn { margin-top: 0; }
.pp-input { flex: 1 1 220px; min-width: 0; min-height: 38px; padding: 6px 10px; font: inherit; font-size: 12.5px; border: 1px solid var(--pp-b); border-radius: 8px; background: transparent; color: var(--pp-t); }
@media (max-width: 640px) { .pp-input { font-size: 16px; } .pp-btn { flex: 1 1 auto; min-height: 44px; } .pp-badge { margin-left: 0; } }
`;
