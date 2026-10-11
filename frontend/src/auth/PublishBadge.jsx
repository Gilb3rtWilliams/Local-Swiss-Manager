// auth/PublishBadge.jsx  (desktop app only)
// A small status pill for the tournament header so the publishing state is
// visible on EVERY tab, not just Overview. Renders nothing outside the
// desktop app, or while the tournament isn't published.
//
//   <PublishBadge tournamentId={t.id} onClick={() => navigate(`/tournament/${t.id}/overview`)} />

import usePublishStatus from "./usePublishStatus";

const LABEL = {
  live: ["● Live online", "ok"],
  syncing: ["↻ Syncing…", "info"],
  hiding: ["Hiding…", "muted"],
  offline: ["⚠ Offline — will sync", "warn"],
  error: ["⚠ Not up to date", "bad"],
  needs_login: ["⚠ Sign in to sync", "warn"],
  subscription: ["⚠ Subscription needed", "warn"],
};

export default function PublishBadge({ tournamentId, onClick }) {
  const { status, available } = usePublishStatus(tournamentId);
  if (!available || !status || (!status.enabled && status.state !== "hiding")) {
    return null;
  }
  // Rather than flashing "Live" while changes are still waiting to go up.
  const key =
    status.state === "live" && status.pendingChanges ? "syncing" : status.state;
  const [text, tone] = LABEL[key] || LABEL.syncing;
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title="Live Publish status — click for details"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 11px",
        borderRadius: 999,
        border: 0,
        font: "inherit",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: onClick ? "pointer" : "default",
        ...TONES[tone],
      }}
    >
      {text}
    </Tag>
  );
}

const TONES = {
  ok: { background: "rgba(31,164,99,.16)", color: "#1fa463" },
  info: { background: "rgba(59,130,246,.16)", color: "#3b82f6" },
  warn: { background: "rgba(217,154,28,.2)", color: "#c28a14" },
  bad: { background: "rgba(229,72,77,.16)", color: "#e5484d" },
  muted: { background: "rgba(128,128,128,.16)", color: "#8a8a9a" },
};
