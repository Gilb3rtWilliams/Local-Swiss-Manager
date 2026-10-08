import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import useTypingEffect from "/hooks/useTypingEffect.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/Dashboard.css";

const FORMAT_LABEL = { individual: "Individual", team: "Team" };
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

// Small outline icons for the stat strip — hand-rolled inline so the
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
      <div className="dash-star-picker" role="group" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= value ? "filled" : ""}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={n === value}
            onClick={() => onChange(n)}
          >
            ★
          </button>
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

// In progress gets the accent treatment; anything still in setup gets a
// dashed "not started" outline; finished reads as neutral.
function statusPillClass(status) {
  if (status === "finished") return "dash-pill dash-pill-finished";
  if (status === "setup") return "dash-pill dash-pill-setup";
  return "dash-pill dash-pill-active";
}

// Progress for one tournament: bracket events count matches, everything else
// counts rounds. A finished tournament is always 100% done — that's the
// ground-truth signal, so it wins over whatever either fraction computed.
function progressFor(t) {
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";
  let percent;
  let label;
  if (isElimination && t.bracketProgress) {
    const { completed, total } = t.bracketProgress;
    percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
    label = `${completed} / ${total} matches`;
  } else {
    const totalRounds = t.totalRounds || 1;
    percent = Math.min(100, Math.max(0, (t.currentRound / totalRounds) * 100));
    label = `Round ${t.currentRound} / ${t.totalRounds}`;
  }
  if (t.status === "finished") percent = 100;
  return { percent, label };
}

const VIEWS = [
  { id: "tournaments", label: "Tournaments" },
  { id: "news", label: "News" },
  { id: "reviews", label: "Reviews" },
];

function PaneHeading({ children, note }) {
  return (
    <div className="dash-pane-head">
      <h2>
        <span className="dash-accent-bar" aria-hidden="true" />
        {children}
      </h2>
      {note && <span className="dash-note">{note}</span>}
    </div>
  );
}

function TournamentRow({ t, onOpen, onDelete }) {
  const { percent, label } = progressFor(t);
  return (
    <div
      className="dash-row"
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only react to keys pressed on the row itself, not on the delete
        // button nested inside it.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span
        className={statusPillClass(t.status)}
        style={{ gridArea: "status" }}
      >
        {t.status}
      </span>

      <div className="dash-row-main">
        <h3 className="dash-row-title">{t.name}</h3>
        <div className="dash-row-tags">
          <span className="dash-chip-tag">{FORMAT_LABEL[t.format]}</span>
          {t.variant && t.variant !== "standard" && (
            <span className="dash-chip-tag dash-chip-tag-accent">
              {VARIANT_LABEL[t.variant] || t.variant}
            </span>
          )}
          {t.timeControl && (
            <span className="dash-chip-tag dash-chip-tag-outline">
              {t.timeControl}
            </span>
          )}
          {t.source === "desktop" && (
            <span className="dash-chip-tag dash-chip-tag-accent">
              Published from Desktop
            </span>
          )}
          {t.federation && (
            <span className="dash-row-federation">{t.federation}</span>
          )}
        </div>
        {t.status === "finished" && t.winner && (
          <div className="dash-row-winner">🏆 {t.winner}</div>
        )}
      </div>

      <div className="dash-row-progress">
        <span>{label}</span>
        <div
          className="dash-progress"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div
            className={`dash-progress-fill${
              t.status === "finished" ? " is-muted" : ""
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <span className="dash-row-count">
        {t.competitorCount} {t.format === "team" ? "teams" : "players"}
      </span>

      <button
        type="button"
        className="dash-row-delete"
        onClick={onDelete}
        title="Delete"
        aria-label={`Delete ${t.name}`}
      >
        ✕
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();

  // Which section the sidebar is showing, kept in the URL (?view=…) so a
  // refresh or a shared link opens the same one.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = VIEWS.some((v) => v.id === requestedView)
    ? requestedView
    : "tournaments";

  function selectView(id) {
    const next = new URLSearchParams(searchParams);
    next.set("view", id);
    setSearchParams(next, { replace: true });
  }

  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [reviews, setReviews] = useState(null);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewName, setReviewName] = useState("");
  const [reviewQuote, setReviewQuote] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const heroTitle = useTypingEffect("Tournament Manager Dashboard", 60);

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

  const navCounts = {
    tournaments: tournaments ? tournaments.length : null,
    news: NEWS_ITEMS.length,
    reviews: reviews ? reviews.length : null,
  };

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

  return (
    <div className="dash-root tp-theme" data-theme={theme}>
      <div className="dash-shell">
        <aside className="dash-side">
          <div className="dash-brand">
            <span className="dash-accent-bar" aria-hidden="true" />
            Swiss Manager
          </div>

          <button
            type="button"
            className="dash-btn dash-btn-primary dash-side-new"
            onClick={() => navigate("/new")}
          >
            + New Tournament
          </button>

          <nav className="dash-nav" aria-label="Dashboard sections">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-current={v.id === view ? "page" : undefined}
                className={`dash-nav-item${v.id === view ? " is-active" : ""}`}
                onClick={() => selectView(v.id)}
              >
                <span>{v.label}</span>
                {navCounts[v.id] !== null && (
                  <span className="dash-nav-count">{navCounts[v.id]}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <main className="dash-main">
          <header className="dash-topbar">
            <h1 className="dash-title">{heroTitle}</h1>
            <ThemePicker theme={theme} onChange={setTheme} />
          </header>

          {error && <div className="dash-panel dash-error">{error}</div>}

          {/* ── Tournaments ─────────────────────────────────────────── */}
          {view === "tournaments" && (
            <section aria-label="Your tournaments">
              {stats && stats.total > 0 && (
                <div className="dash-stats">
                  {statItems.map((item) => (
                    <div className="dash-stat" key={item.label}>
                      <span className="dash-stat-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <strong>{item.value}</strong>
                      <span className="dash-stat-label">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <PaneHeading>Your Tournaments</PaneHeading>

              {tournaments && tournaments.length > 0 && (
                <div className="dash-filters">
                  <div className="dash-filter-group">
                    <span className="dash-filter-label">Format</span>
                    {["all", "individual", "team"].map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`dash-chip${
                          formatFilter === f ? " active" : ""
                        }`}
                        onClick={() => setFormatFilter(f)}
                      >
                        {f === "all" ? "All" : FORMAT_LABEL[f]}
                      </button>
                    ))}
                  </div>
                  <div className="dash-filter-group">
                    <span className="dash-filter-label">Status</span>
                    {[
                      ["all", "All"],
                      ["active", "In progress"],
                      ["finished", "Finished"],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={`dash-chip${
                          statusFilter === val ? " active" : ""
                        }`}
                        onClick={() => setStatusFilter(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tournaments === null && <p className="dash-note">Loading…</p>}

              {tournaments && tournaments.length === 0 && (
                <div className="dash-panel dash-empty">
                  <div className="dash-empty-icon">♟</div>
                  <h2>No tournaments yet</h2>
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
                <div className="dash-panel dash-empty dash-note">
                  No tournaments match these filters.
                </div>
              )}

              {filtered && filtered.length > 0 && (
                <ul className="dash-list">
                  {filtered.map((t) => (
                    <li key={t.id}>
                      <TournamentRow
                        t={t}
                        onOpen={() => navigate(`/tournament/${t.id}`)}
                        onDelete={(e) => handleDelete(e, t.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ── News ────────────────────────────────────────────────── */}
          {view === "news" && (
            <section aria-label="News">
              <PaneHeading note="Sample content — edit anytime">
                From the Kenyan Chess World
              </PaneHeading>
              <div className="dash-news-grid">
                {NEWS_ITEMS.map((item) => (
                  <article
                    key={item.title}
                    className="dash-panel dash-news-card"
                  >
                    <span className="dash-tag">{item.tag}</span>
                    <h3>{item.title}</h3>
                    <p>{item.excerpt}</p>
                    <span className="dash-news-date">{item.date}</span>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ── Reviews ─────────────────────────────────────────────── */}
          {view === "reviews" && (
            <section aria-label="Reviews">
              <PaneHeading>What Organizers Say</PaneHeading>

              {reviews === null ? (
                <p className="dash-note">Loading…</p>
              ) : reviews.length === 0 ? (
                <p className="dash-note">
                  No reviews yet — be the first to share your experience.
                </p>
              ) : (
                <div className="dash-reviews-grid">
                  {reviews.map((r) => (
                    <figure key={r.id} className="dash-panel dash-review-card">
                      <Stars value={r.rating} />
                      <blockquote className="dash-review-quote">
                        "{r.quote}"
                      </blockquote>
                      <figcaption className="dash-review-author">
                        <strong>{r.name}</strong>
                        <span>{r.role}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {!reviewFormOpen ? (
                <button
                  type="button"
                  className="dash-btn dash-btn-secondary"
                  onClick={() => setReviewFormOpen(true)}
                >
                  + Share Your Experience
                </button>
              ) : (
                <div className="dash-panel dash-review-form">
                  {reviewSubmitted ? (
                    <p className="dash-note dash-m-0">
                      Thanks for the review! 🙌
                    </p>
                  ) : (
                    <form onSubmit={submitReview}>
                      <div className="dash-form-grid">
                        <label className="dash-label">
                          <span className="dash-filter-label">Your name</span>
                          <input
                            type="text"
                            className="dash-input"
                            value={reviewName}
                            onChange={(e) => setReviewName(e.target.value)}
                            placeholder="Jane Wanjiku"
                          />
                        </label>
                        <div className="dash-label">
                          <span className="dash-filter-label">Rating</span>
                          <div className="dash-rating-wrap">
                            <Stars
                              value={reviewRating}
                              onChange={setReviewRating}
                            />
                          </div>
                        </div>
                      </div>
                      <label className="dash-label dash-label-mb">
                        <span className="dash-filter-label">Your review</span>
                        <textarea
                          rows={3}
                          className="dash-input dash-textarea"
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
                          className="dash-btn dash-btn-secondary"
                          onClick={() => setReviewFormOpen(false)}
                        >
                          Cancel
                        </button>
                        {reviewError && (
                          <span className="dash-form-error">{reviewError}</span>
                        )}
                      </div>
                    </form>
                  )}
                </div>
              )}
            </section>
          )}

          <footer className="dash-footer">
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
          </footer>
        </main>
      </div>
    </div>
  );
}
