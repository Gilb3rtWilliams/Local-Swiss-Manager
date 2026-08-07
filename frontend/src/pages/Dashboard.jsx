import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import useTypingEffect from "/hooks/useTypingEffect.js";

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

const INITIAL_REVIEWS = [
  {
    name: "Wanjiru K.",
    role: "Club organizer, Nyeri",
    quote:
      "I used to build pairing sheets by hand at 11pm the night before. Now I generate a round in under a minute and actually get to bed.",
    rating: 5,
  },
  {
    name: "Otieno M.",
    role: "Arbiter",
    quote:
      "The bracket view finally makes knockout side-events worth running alongside our main Swiss tournaments. Players can see exactly where they stand.",
    rating: 5,
  },
  {
    name: "Achieng N.",
    role: "Team captain",
    quote:
      "Team match scoring with board-by-board results was the one thing every other tool I tried got clunky. This one didn't.",
    rating: 4,
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

// ACTIVE gets the teal treatment; anything still in setup gets the amber
// "not started" treatment; everything else (finished) reads as neutral.
function statusPillClass(status) {
  if (status === "finished") return "status-pill status-pill-finished";
  if (status === "setup") return "status-pill status-pill-setup";
  return "status-pill status-pill-active";
}

export default function Dashboard() {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [reviews, setReviews] = useState(INITIAL_REVIEWS);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewName, setReviewName] = useState("");
  const [reviewQuote, setReviewQuote] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const heroTitle = useTypingEffect("Tournament Manager Dashboard", 60);

  useEffect(() => {
    refresh();
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

  function submitReview(e) {
    e.preventDefault();
    if (!reviewName.trim() || !reviewQuote.trim()) return;
    setReviews((rs) => [
      {
        name: reviewName.trim(),
        role: "Swiss Manager user",
        quote: reviewQuote.trim(),
        rating: reviewRating,
      },
      ...rs,
    ]);
    setReviewName("");
    setReviewQuote("");
    setReviewRating(5);
    setReviewSubmitted(true);
    setTimeout(() => {
      setReviewSubmitted(false);
      setReviewFormOpen(false);
    }, 1800);
  }

  return (
    <div className="dash-root">
      <div className="dash-bg" />
      <div className="dash-container">
        {/* Hero: title, primary action, and the stat strip in one card */}
        <div className="dash-hero card">
          <div className="dash-hero-top">
            <h1 className="dash-hero-title">
              <span className="dash-accent-bar" aria-hidden="true" />
              {heroTitle}
            </h1>
            <button className="btn-primary" onClick={() => navigate("/new")}>
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
        </div>

        {error && <div className="card dash-error-card">{error}</div>}

        {/* Tournaments Section */}
        <div className="dash-section">
          <div className="dash-section-head">
            <h2>
              <span className="dash-accent-bar" aria-hidden="true" />
              Your Tournaments
            </h2>

            {tournaments && tournaments.length > 0 && (
              <div className="dash-filters" style={{ marginBottom: 0 }}>
                <div className="dash-filter-group">
                  <span className="dash-filter-label">Format:</span>
                  {["all", "individual", "team"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`dash-chip ${formatFilter === f ? "active" : ""}`}
                      onClick={() => setFormatFilter(f)}
                    >
                      {f === "all" ? "All" : FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
                <div className="dash-filter-group">
                  <span className="dash-filter-label">Status:</span>
                  {[
                    ["all", "All"],
                    ["active", "In progress"],
                    ["finished", "Finished"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={`dash-chip ${statusFilter === val ? "active" : ""}`}
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
            <p className="dash-section-note">Loading…</p>
          )}

          {tournaments && tournaments.length === 0 && (
            <div className="card dash-empty-card">
              <div className="dash-empty-icon">♟</div>
              <h2 className="dash-empty-title">No tournaments yet</h2>
              <p className="dash-section-note">
                Create your first tournament to generate Round 1 pairings.
              </p>
              <button
                className="btn-primary dash-mt-16"
                onClick={() => navigate("/new")}
              >
                + New Tournament
              </button>
            </div>
          )}

          {filtered && filtered.length === 0 && tournaments.length > 0 && (
            <div className="card dash-section-note dash-note-card">
              No tournaments match these filters.
            </div>
          )}

          {filtered && filtered.length > 0 && (
            <div className="tourney-grid tourney-grid-layout">
              {filtered.map((t) => {
                const totalRounds = t.totalRounds || 1;
                const roundProgress = Math.min(
                  100,
                  Math.max(0, (t.currentRound / totalRounds) * 100),
                );

                return (
                  <div
                    key={t.id}
                    className="card tourney-card tourney-card-layout"
                    onClick={() => navigate(`/tournament/${t.id}`)}
                  >
                    <div className="tourney-card-header">
                      <span className={statusPillClass(t.status)}>
                        {t.status}
                      </span>
                      <button
                        className="btn-delete"
                        onClick={(e) => handleDelete(e, t.id)}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>

                    <h3 className="tourney-title">{t.name}</h3>

                    <div className="tourney-meta">
                      <div className="tourney-tags">
                        <span className="tourney-chip tourney-chip-neutral">
                          {FORMAT_LABEL[t.format]}
                        </span>
                        {t.variant && t.variant !== "standard" && (
                          <span className="tourney-chip tourney-chip-variant">
                            {VARIANT_LABEL[t.variant] || t.variant}
                          </span>
                        )}
                        {t.timeControl && (
                          <span className="tourney-chip tourney-chip-time">
                            {t.timeControl}
                          </span>
                        )}
                        {t.federation && (
                          <span className="tourney-federation">
                            {t.federation}
                          </span>
                        )}
                      </div>

                      <div className="tourney-progress">
                        <div
                          className={`tourney-progress-fill ${t.status === "finished" ? "is-muted" : ""}`}
                          style={{ width: `${roundProgress}%` }}
                        />
                      </div>
                    </div>

                    <div className="tourney-footer">
                      <span>
                        Round {t.currentRound} / {t.totalRounds}
                      </span>
                      <span>
                        {t.competitorCount}{" "}
                        {t.format === "team" ? "teams" : "players"}
                      </span>
                    </div>

                    {t.status === "finished" && t.winner && (
                      <div className="tourney-winner">🏆 {t.winner}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* News Section */}
        <div className="dash-section">
          <div className="dash-section-head">
            <h2>
              <span className="dash-accent-bar" aria-hidden="true" />
              From the Kenyan Chess World
            </h2>
            <span className="dash-section-note">
              Sample content — edit anytime
            </span>
          </div>

          <div className="dash-news-grid">
            {NEWS_ITEMS.map((item) => (
              <div key={item.title} className="card dash-news-card">
                <span className="dash-news-tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <span className="dash-news-date">{item.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reviews Section */}
        <div className="dash-section">
          <div className="dash-section-head">
            <h2>
              <span className="dash-accent-bar" aria-hidden="true" />
              What Organizers Say
            </h2>
          </div>

          <div className="dash-reviews-grid">
            {reviews.map((r, i) => (
              <div key={`${r.name}-${i}`} className="card dash-review-card">
                <Stars value={r.rating} />
                <p className="dash-review-quote">"{r.quote}"</p>
                <div className="dash-review-author dash-author-footer">
                  <strong>{r.name}</strong>
                  <span>{r.role}</span>
                </div>
              </div>
            ))}
          </div>

          {!reviewFormOpen ? (
            <button
              className="btn-secondary"
              onClick={() => setReviewFormOpen(true)}
            >
              + Share Your Experience
            </button>
          ) : (
            <div className="card dash-review-form">
              {reviewSubmitted ? (
                <p className="dash-section-note dash-m-0">
                  Thanks for the review! 🙌
                </p>
              ) : (
                <form onSubmit={submitReview}>
                  <div className="form-grid form-grid-layout">
                    <label className="form-label">
                      <span className="dash-filter-label">Your name</span>
                      <input
                        type="text"
                        className="form-input"
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Jane Wanjiku"
                      />
                    </label>
                    <label className="form-label">
                      <span className="dash-filter-label">Rating</span>
                      <div className="form-rating-wrapper">
                        <Stars
                          value={reviewRating}
                          onChange={setReviewRating}
                        />
                      </div>
                    </label>
                  </div>
                  <label className="form-label form-label-mb">
                    <span className="dash-filter-label">Your review</span>
                    <textarea
                      rows={3}
                      className="form-textarea"
                      value={reviewQuote}
                      onChange={(e) => setReviewQuote(e.target.value)}
                      placeholder="What's it been like running tournaments with Swiss Manager?"
                    />
                  </label>
                  <div className="form-actions">
                    <button className="btn-primary" type="submit">
                      Submit Review
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setReviewFormOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
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
            <a
              href="mailto:gilbertwilliamsnyange@gmail.com"
              className="footer-email"
            >
              gilbertwilliamsnyange@gmail.com
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
