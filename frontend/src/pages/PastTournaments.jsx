import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/PastTournaments.css";

const FORMAT_LABEL = { individual: "Individual", team: "Team", match: "Match" };
const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};

// Small outline icons for the stats bar — hand-rolled inline so the page
// doesn't pull in an icon library just for four glyphs.
function IconFlag() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 17V3" />
      <path d="M4.5 4h10l-2.5 3 2.5 3h-10" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function IconPawn() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <circle cx="10" cy="6" r="3" />
      <path d="M7.2 9.6h5.6l1.6 4.4H5.6l1.6-4.4z" />
      <rect x="4.2" y="15" width="11.6" height="2.1" rx="1.05" />
    </svg>
  );
}

// Active gets the green treatment; setup gets amber; finished reads neutral.
function statusPillClass(status) {
  if (status === "finished") return "pt-pill pt-pill-finished";
  if (status === "setup") return "pt-pill pt-pill-setup";
  return "pt-pill pt-pill-active";
}

function progressFor(t) {
  if (t.currentRound == null || t.totalRounds == null) {
    // Cage matches (and anything else without a round structure) have no
    // round counter to show.
    return {
      percent: t.status === "finished" ? 100 : 0,
      label: t.format === "match" ? "Cage match" : "—",
    };
  }
  const percent =
    t.status === "finished"
      ? 100
      : Math.min(
          100,
          Math.max(0, (t.currentRound / (t.totalRounds || 1)) * 100),
        );
  return { percent, label: `Round ${t.currentRound} / ${t.totalRounds}` };
}

export default function PastTournaments() {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");

  // Filter states
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    // listPublicTournaments() so every existing tournament is visible here
    api
      .listPublicTournaments()
      .then(setTournaments)
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!tournaments) return null;
    return tournaments.filter((t) => {
      if (formatFilter !== "all" && t.format !== formatFilter) return false;
      if (statusFilter === "active" && t.status === "finished") return false;
      if (statusFilter === "finished" && t.status !== "finished") return false;
      return true;
    });
  }, [tournaments, formatFilter, statusFilter]);

  const stats = useMemo(() => {
    if (!tournaments) return null;
    const active = tournaments.filter((t) => t.status !== "finished").length;
    return {
      total: tournaments.length,
      active,
      finished: tournaments.length - active,
      players: tournaments.reduce(
        (sum, t) => sum + (t.competitorCount || 0),
        0,
      ),
    };
  }, [tournaments]);

  const statItems = stats
    ? [
        { icon: <IconFlag />, value: stats.total, label: "Tournaments" },
        { icon: <IconTarget />, value: stats.active, label: "In progress" },
        { icon: <IconCheck />, value: stats.finished, label: "Finished" },
        { icon: <IconPawn />, value: stats.players, label: "Competitors" },
      ]
    : [];

  function openTournament(t) {
    if (t.publicViewToken) {
      navigate(`/results/${t.publicViewToken}`);
    } else {
      alert("This tournament does not have a public view token yet.");
    }
  }

  return (
    <div className="pt-root tp-theme" data-theme={theme}>
      <div className="pt-shell">
        {/* Top bar — same pattern as the tournament and dashboard pages */}
        <div className="pt-topbar">
          <span className="pt-brand">
            <span aria-hidden="true">♟</span> Swiss Manager
          </span>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>

        {/* Centered header */}
        <div className="pt-header">
          <div className="pt-eyebrow">Open to Everyone</div>
          <h1 className="pt-title">Past &amp; Live Tournaments</h1>
          <p className="pt-sub">
            Pairings and standings for every event on the platform.
          </p>
        </div>

        {stats && stats.total > 0 && (
          <div className="pt-stats">
            {statItems.map((item) => (
              <div className="pt-stat" key={item.label}>
                <span className="pt-stat-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="pt-stat-body">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="pt-panel pt-error">{error}</div>}

        <section className="pt-panel">
          <div className="pt-panel-head">
            <h2>All Tournaments</h2>

            {tournaments && tournaments.length > 0 && (
              <div className="pt-filters">
                <div className="pt-segmented" role="group">
                  {["all", "individual", "team"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={formatFilter === f ? "active" : ""}
                      onClick={() => setFormatFilter(f)}
                    >
                      {f === "all" ? "All formats" : FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
                <div className="pt-segmented" role="group">
                  {[
                    ["all", "All"],
                    ["active", "In progress"],
                    ["finished", "Finished"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={statusFilter === val ? "active" : ""}
                      onClick={() => setStatusFilter(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {tournaments === null && !error && (
            <p className="pt-note pt-pad">Loading…</p>
          )}

          {tournaments && tournaments.length === 0 && (
            <div className="pt-empty">
              <div className="pt-empty-glyph">♟</div>
              <h3>No tournaments yet</h3>
              <p className="pt-note">
                When an organizer creates an event, it'll show up here.
              </p>
            </div>
          )}

          {filtered && filtered.length === 0 && tournaments.length > 0 && (
            <p className="pt-note pt-pad pt-center">
              No tournaments match these filters.
            </p>
          )}

          {filtered && filtered.length > 0 && (
            <ul className="pt-list">
              {filtered.map((t) => {
                const { percent, label } = progressFor(t);
                return (
                  <li
                    key={t.id || t.publicViewToken}
                    className="pt-row"
                    role="link"
                    tabIndex={0}
                    onClick={() => openTournament(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openTournament(t);
                      }
                    }}
                  >
                    <div className="pt-row-main">
                      <h3 className="pt-row-title">{t.name}</h3>
                      <div className="pt-tags">
                        <span className="pt-chip">
                          {SYSTEM_LABEL[t.system] || t.system}
                        </span>
                        <span className="pt-chip pt-chip-outline">
                          {t.format === "match" && t.matchType === "cage"
                            ? "Cage Match"
                            : FORMAT_LABEL[t.format] || t.format}
                        </span>
                        {t.federation && (
                          <span className="pt-federation">{t.federation}</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-row-progress">
                      <div className="pt-bar">
                        <div
                          className={`pt-bar-fill ${
                            t.status === "finished" ? "is-muted" : ""
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span>{label}</span>
                    </div>

                    <div className="pt-row-count">
                      <strong>{t.competitorCount}</strong>
                      <span>{t.format === "team" ? "teams" : "players"}</span>
                    </div>

                    <div className="pt-row-end">
                      <span className={statusPillClass(t.status)}>
                        {t.status}
                      </span>
                      <span className="pt-open" aria-hidden="true">
                        →
                      </span>
                    </div>

                    {t.status === "finished" && t.winner && (
                      <div className="pt-winner">🏆 {t.winner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
