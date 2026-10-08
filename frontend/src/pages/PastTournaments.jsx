import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/PastTournaments.css";

const FORMAT_LABEL = { individual: "Individual", team: "Team", match: "Match" };

// Remembers that the visitor has dismissed the welcome guide.
const WELCOME_KEY = "pt-welcome-dismissed";

function readWelcomeDismissed() {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false; // storage blocked — just show the guide
  }
}

const STATUS_OPTIONS = [
  ["all", "All"],
  ["active", "In progress"],
  ["finished", "Finished"],
];

const matchesStatus = (t, status) =>
  status === "all" ||
  (status === "active" ? t.status !== "finished" : t.status === "finished");
const matchesFormat = (t, format) => format === "all" || t.format === format;

const HOW_TO = [
  {
    title: "Find an event",
    text: "Narrow the list with the status and format filters.",
  },
  {
    title: "Open it",
    text: "Click any row to follow that event's live results.",
  },
  {
    title: "Look around",
    text: "Inside, use the side menu to switch between pairings, standings and the cross table, and the round bar to revisit earlier rounds.",
  },
  {
    title: "Make it comfortable",
    text: "The theme picker at the top right changes the colours.",
  },
];
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

// One group of filter buttons in the sidebar (status or format), each with a
// count of how many events it would show.
function FilterGroup({ label, options, value, onChange }) {
  return (
    <div className="pt-filter-group" role="group" aria-label={label}>
      <div className="pt-filter-title">{label}</div>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          className={`pt-filter-item${value === o.id ? " is-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          <span>{o.label}</span>
          <span className="pt-filter-count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

export default function PastTournaments() {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");

  // Filter states
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [welcomeOpen, setWelcomeOpen] = useState(() => !readWelcomeDismissed());

  useEffect(() => {
    // listPublicTournaments() so every existing tournament is visible here
    api
      .listPublicTournaments()
      .then(setTournaments)
      .catch((e) => setError(e.message));
  }, []);

  function dismissWelcome() {
    setWelcomeOpen(false);
    try {
      localStorage.setItem(WELCOME_KEY, "1");
    } catch {
      /* storage disabled — it just won't be remembered */
    }
  }

  function reopenWelcome() {
    setWelcomeOpen(true);
    try {
      localStorage.removeItem(WELCOME_KEY);
    } catch {
      /* ignore */
    }
  }

  const filtered = useMemo(() => {
    if (!tournaments) return null;
    return tournaments.filter(
      (t) => matchesFormat(t, formatFilter) && matchesStatus(t, statusFilter),
    );
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

  // Sidebar options. Each count reflects the *other* active filter, so the
  // numbers always match what clicking the button would show. "Match" only
  // appears when the platform actually has cage matches.
  const statusOptions = tournaments
    ? STATUS_OPTIONS.map(([id, label]) => ({
        id,
        label,
        count: tournaments.filter(
          (t) => matchesFormat(t, formatFilter) && matchesStatus(t, id),
        ).length,
      }))
    : [];
  const formatIds = ["all", "individual", "team"];
  if (tournaments?.some((t) => t.format === "match")) formatIds.push("match");
  const formatOptions = tournaments
    ? formatIds.map((id) => ({
        id,
        label: id === "all" ? "All formats" : FORMAT_LABEL[id],
        count: tournaments.filter(
          (t) => matchesFormat(t, id) && matchesStatus(t, statusFilter),
        ).length,
      }))
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
        <aside className="pt-side">
          <div className="pt-brand">
            {/* Sends the visitor to the /welcome page. A real <button> so it's
                keyboard-reachable; every style is inherited from .pt-brand so
                the label looks exactly as before. */}
            <button
              type="button"
              className="pt-brand-link"
              title="Go to the welcome page"
              onClick={() => navigate("/")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "none",
                border: 0,
                padding: 0,
                margin: 0,
                color: "inherit",
                fontFamily: "inherit",
                fontSize: "inherit",
                fontWeight: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
                lineHeight: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.textDecoration = "underline")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.textDecoration = "none")
              }
            >
              <span aria-hidden="true">♟</span> Swiss Manager
            </button>
          </div>

          {tournaments && tournaments.length > 0 && (
            <>
              <FilterGroup
                label="Status"
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <FilterGroup
                label="Format"
                options={formatOptions}
                value={formatFilter}
                onChange={setFormatFilter}
              />
            </>
          )}
        </aside>

        <main className="pt-main">
          <header className="pt-topbar">
            <div className="pt-heading">
              <div className="pt-eyebrow">Open to Everyone</div>
              <h1 className="pt-title">Past &amp; Live Tournaments</h1>
              <p className="pt-sub">
                Pairings and standings for every event on the platform.
              </p>
            </div>
            <div className="pt-top-actions">
              {!welcomeOpen && (
                <button
                  type="button"
                  className="pt-link-btn"
                  onClick={reopenWelcome}
                >
                  How to use this page
                </button>
              )}
              <ThemePicker theme={theme} onChange={setTheme} />
            </div>
          </header>

          {welcomeOpen && (
            <section className="pt-welcome" aria-labelledby="pt-welcome-title">
              <div className="pt-welcome-head">
                <div>
                  <h2 id="pt-welcome-title">Welcome to the tournament view</h2>
                  <p>
                    Follow any event on the platform, live or finished — the
                    pairings, standings and results are open to everyone.
                  </p>
                </div>
                <button
                  type="button"
                  className="pt-welcome-close"
                  aria-label="Dismiss welcome message"
                  onClick={dismissWelcome}
                >
                  ✕
                </button>
              </div>
              <ol className="pt-steps">
                {HOW_TO.map((step, i) => (
                  <li key={step.title}>
                    <span className="pt-step-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <span>{step.text}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

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
                <span className="pt-note">
                  Showing {filtered.length} of {tournaments.length}
                </span>
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
                            <span className="pt-federation">
                              {t.federation}
                            </span>
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
        </main>
      </div>
    </div>
  );
}
