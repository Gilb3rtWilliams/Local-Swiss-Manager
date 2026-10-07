import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/Dashboard.css";

const FORMAT_LABEL = { individual: "Individual", team: "Team", match: "Match" };
const VARIANT_LABEL = {
  standard: "Standard",
  bughouse: "Bughouse",
  league: "League",
};

const NEWS_ITEMS = [
  {
    tag: "Organizing",
    title: "Running a fair Swiss tournament in a small hall",
    excerpt:
      "Pairing rules matter more than prize money when it comes to keeping players coming back. A few practical habits for keeping a one-room event running on time.",
    date: "Organizer's guide",
  },
  {
    tag: "Community",
    title: "Kenya's club scene keeps finding new rooms to play in",
    excerpt:
      "From Nairobi to smaller towns like Nyeri, weekend club nights are where most new players get their first rated game in.",
    date: "Community notes",
  },
  {
    tag: "Federation",
    title: "What the Kenya Chess Federation actually does for local arbiters",
    excerpt:
      "Titled-arbiter pathways, rating submissions, and why it's worth affiliating your club event even when it's small.",
    date: "Federation news",
  },
  {
    tag: "Organizing",
    title: "Byes, late entries, and the rules nobody reads until round 1",
    excerpt:
      "A short checklist for the messy real-world edge cases — walkovers, no-shows, and last-minute additions — before you generate pairings.",
    date: "Organizer's guide",
  },
];

const REVIEWS_COLLAPSED_COUNT = 3;

// Small outline icons for the stats bar — hand-rolled inline so the
// dashboard doesn't pull in an icon library just for four glyphs.
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

function Stars({ value, onChange }) {
  if (onChange) {
    return (
      <div className="dash-star-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={n <= value ? "filled" : ""}
            onClick={() => onChange(n)}
          >
            ★
          </span>
        ))}
      </div>
    );
  }
  return (
    <span className="dash-review-stars" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      {"☆".repeat(5 - value)}
    </span>
  );
}

// ACTIVE gets the green treatment; anything still in setup gets the amber
// "not started" treatment; everything else (finished) reads as neutral.
function statusPillClass(status) {
  if (status === "finished") return "dash-pill dash-pill-finished";
  if (status === "setup") return "dash-pill dash-pill-setup";
  return "dash-pill dash-pill-active";
}

function progressFor(t) {
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";

  let percent;
  let label;
  if (t.currentRound == null || t.totalRounds == null) {
    // Cage matches (and anything else without a round structure) have no
    // round counter to show.
    percent = 0;
    label = t.format === "match" ? "Cage match" : "—";
  } else if (isElimination && t.bracketProgress) {
    const { completed, total } = t.bracketProgress;
    percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
    label = `${completed} / ${total} matches`;
  } else {
    const totalRounds = t.totalRounds || 1;
    percent = Math.min(100, Math.max(0, (t.currentRound / totalRounds) * 100));
    label = `Round ${t.currentRound} / ${t.totalRounds}`;
  }
  // A finished tournament is always 100% done — this is the ground-truth
  // signal, so it wins regardless of what either fraction above computed.
  if (t.status === "finished") percent = 100;
  return { percent, label };
}

export default function Dashboard() {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();

  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [reviews, setReviews] = useState(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewName, setReviewName] = useState("");
  const [reviewQuote, setReviewQuote] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    refresh();
    api
      .listReviews()
      .then(setReviews)
      .catch(() => setReviews([])); // reviews are a nice-to-have section — a
    // failed fetch here shouldn't block the rest of the dashboard, so this
    // degrades to "no reviews yet" rather than surfacing a page-level error.
  }, []);

  function refresh() {
    api
      .listTournaments()
      .then(setTournaments)
      .catch((e) => setError(e.message));
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm("Delete this tournament? This cannot be undone.")) return;
    await api.deleteTournament(id);
    refresh();
  }

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
    const finished = tournaments.length - active;
    const players = tournaments.reduce(
      (sum, t) => sum + (t.competitorCount || 0),
      0,
    );
    return { total: tournaments.length, active, finished, players };
  }, [tournaments]);

  const statItems = stats
    ? [
        { icon: <IconFlag />, value: stats.total, label: "Total tournaments" },
        { icon: <IconTarget />, value: stats.active, label: "In progress" },
        { icon: <IconCheck />, value: stats.finished, label: "Finished" },
        { icon: <IconPawn />, value: stats.players, label: "Competitors" },
      ]
    : [];

  async function submitReview(e) {
    e.preventDefault();
    if (!reviewName.trim() || !reviewQuote.trim()) return;
    setReviewBusy(true);
    setReviewError("");
    try {
      const created = await api.submitReview({
        name: reviewName.trim(),
        quote: reviewQuote.trim(),
        rating: reviewRating,
      });
      setReviews((rs) => [created, ...(rs || [])]);
      setReviewName("");
      setReviewQuote("");
      setReviewRating(5);
      setReviewSubmitted(true);
      setTimeout(() => {
        setReviewSubmitted(false);
        setReviewFormOpen(false);
      }, 1800);
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setReviewBusy(false);
    }
  }

  const visibleReviews =
    reviews && !showAllReviews
      ? reviews.slice(0, REVIEWS_COLLAPSED_COUNT)
      : reviews;

  return (
    <div className="dash-root tp-theme" data-theme={theme}>
      <div className="dash-container">
        {/* Top bar — same pattern as the tournament page's header row */}
        <div className="dash-topbar">
          <span className="dash-brand">
            <span aria-hidden="true">♟</span> Swiss Manager
          </span>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>

        {/* Centered header */}
        <div className="dash-header">
          <div className="dash-eyebrow">Admin · Tournament Manager</div>
          <h1 className="dash-title">Dashboard</h1>
          <button
            type="button"
            className="dash-btn dash-btn-primary"
            onClick={() => navigate("/new")}
          >
            + New Tournament
          </button>
        </div>

        {stats && stats.total > 0 && (
          <div className="dash-stats">
            {statItems.map((item) => (
              <div className="dash-stat" key={item.label}>
                <span className="dash-stat-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="dash-stat-body">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="dash-panel dash-error">{error}</div>}

        <div className="dash-grid">
          {/* ── Main column: tournaments ───────────────────────────── */}
          <main className="dash-main">
            <section className="dash-panel">
              <div className="dash-panel-head">
                <h2>Your Tournaments</h2>

                {tournaments && tournaments.length > 0 && (
                  <div className="dash-filters">
                    <div className="dash-segmented" role="group">
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
                    <div className="dash-segmented" role="group">
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

              {tournaments === null && (
                <p className="dash-note dash-pad">Loading…</p>
              )}

              {tournaments && tournaments.length === 0 && (
                <div className="dash-empty">
                  <div className="dash-empty-icon">♟</div>
                  <h3>No tournaments yet</h3>
                  <p className="dash-note">
                    Create your first tournament to generate Round 1 pairings.
                  </p>
                  <button
                    type="button"
                    className="dash-btn dash-btn-primary"
                    onClick={() => navigate("/new")}
                  >
                    + New Tournament
                  </button>
                </div>
              )}

              {filtered && filtered.length === 0 && tournaments.length > 0 && (
                <p className="dash-note dash-pad dash-center">
                  No tournaments match these filters.
                </p>
              )}

              {filtered && filtered.length > 0 && (
                <ul className="dash-list">
                  {filtered.map((t) => {
                    const { percent, label } = progressFor(t);
                    const open = () => navigate(`/tournament/${t.id}`);
                    return (
                      <li
                        key={t.id}
                        className="dash-row"
                        role="link"
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open();
                          }
                        }}
                      >
                        <div className="dash-row-main">
                          <h3 className="dash-row-title">{t.name}</h3>
                          <div className="dash-tags">
                            <span className="dash-chip">
                              {t.format === "match" && t.matchType === "cage"
                                ? "Cage Match"
                                : FORMAT_LABEL[t.format] || t.format}
                            </span>
                            {t.variant && t.variant !== "standard" && (
                              <span className="dash-chip dash-chip-variant">
                                {VARIANT_LABEL[t.variant] || t.variant}
                              </span>
                            )}
                            {t.timeControl && (
                              <span className="dash-chip dash-chip-outline">
                                {t.timeControl}
                              </span>
                            )}
                            {t.source === "desktop" && (
                              <span className="dash-chip dash-chip-variant">
                                Published from Desktop
                              </span>
                            )}
                            {t.federation && (
                              <span className="dash-federation">
                                {t.federation}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="dash-row-progress">
                          <div className="dash-bar">
                            <div
                              className={`dash-bar-fill ${
                                t.status === "finished" ? "is-muted" : ""
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span>{label}</span>
                        </div>

                        <div className="dash-row-count">
                          <strong>{t.competitorCount}</strong>
                          <span>
                            {t.format === "team" ? "teams" : "players"}
                          </span>
                        </div>

                        <div className="dash-row-end">
                          <span className={statusPillClass(t.status)}>
                            {t.status}
                          </span>
                          <button
                            type="button"
                            className="dash-delete"
                            onClick={(e) => handleDelete(e, t.id)}
                            title="Delete"
                            aria-label={`Delete ${t.name}`}
                          >
                            ✕
                          </button>
                        </div>

                        {t.status === "finished" && t.winner && (
                          <div className="dash-winner">🏆 {t.winner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </main>

          {/* ── Side column: news + reviews ────────────────────────── */}
          <aside className="dash-side">
            <section className="dash-panel">
              <div className="dash-panel-head">
                <h2>Kenyan Chess World</h2>
              </div>
              <ul className="dash-news">
                {NEWS_ITEMS.map((item) => (
                  <li key={item.title} className="dash-news-item">
                    <div className="dash-news-meta">
                      <span className="dash-news-tag">{item.tag}</span>
                      <span>{item.date}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.excerpt}</p>
                  </li>
                ))}
              </ul>
              <p className="dash-note dash-pad-sm">
                Sample content — edit anytime
              </p>
            </section>

            <section className="dash-panel">
              <div className="dash-panel-head">
                <h2>What Organizers Say</h2>
              </div>

              {reviews === null ? (
                <p className="dash-note dash-pad">Loading…</p>
              ) : reviews.length === 0 ? (
                <p className="dash-note dash-pad">
                  No reviews yet — be the first to share your experience.
                </p>
              ) : (
                <ul className="dash-reviews">
                  {visibleReviews.map((r) => (
                    <li key={r.id} className="dash-review">
                      <Stars value={r.rating} />
                      <p className="dash-review-quote">"{r.quote}"</p>
                      <div className="dash-review-author">
                        <strong>{r.name}</strong>
                        <span>{r.role}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {reviews && reviews.length > REVIEWS_COLLAPSED_COUNT && (
                <button
                  type="button"
                  className="dash-link-btn"
                  onClick={() => setShowAllReviews((s) => !s)}
                >
                  {showAllReviews
                    ? "Show fewer"
                    : `Show all ${reviews.length} reviews`}
                </button>
              )}

              <div className="dash-review-cta">
                {!reviewFormOpen ? (
                  <button
                    type="button"
                    className="dash-btn dash-btn-ghost"
                    onClick={() => setReviewFormOpen(true)}
                  >
                    + Share Your Experience
                  </button>
                ) : reviewSubmitted ? (
                  <p className="dash-note">Thanks for the review! 🙌</p>
                ) : (
                  <form onSubmit={submitReview} className="dash-form">
                    <label className="dash-label">
                      <span>Your name</span>
                      <input
                        type="text"
                        className="dash-input"
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Jane Wanjiku"
                      />
                    </label>
                    <div className="dash-label">
                      <span>Rating</span>
                      <Stars value={reviewRating} onChange={setReviewRating} />
                    </div>
                    <label className="dash-label">
                      <span>Your review</span>
                      <textarea
                        rows={3}
                        className="dash-input"
                        value={reviewQuote}
                        onChange={(e) => setReviewQuote(e.target.value)}
                        placeholder="What's it been like running tournaments with Swiss Manager?"
                      />
                    </label>
                    <div className="dash-form-actions">
                      <button
                        className="dash-btn dash-btn-primary"
                        type="submit"
                        disabled={reviewBusy}
                      >
                        {reviewBusy ? "Submitting…" : "Submit Review"}
                      </button>
                      <button
                        type="button"
                        className="dash-btn dash-btn-ghost"
                        onClick={() => setReviewFormOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                    {reviewError && (
                      <span className="dash-form-error">{reviewError}</span>
                    )}
                  </form>
                )}
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <div className="dash-footer">
          <div>
            <p className="dash-footer-title">Swiss Manager</p>
            <p className="dash-footer-sub">
              Built and maintained by Gilbert Williams.
            </p>
          </div>
          <div className="dash-footer-contact">
            <a href="tel:+254719737274">0719 737 274</a>
            <a href="tel:+254714591285">0714 591 285</a>
            <a href="mailto:gilbertwilliamsnyange@gmail.com">
              gilbertwilliamsnyange@gmail.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
