import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import useTypingEffect from "/hooks/useTypingEffect.js";
import "../css/Dashboard.css";

const FORMAT_LABEL = { individual: "Individual", team: "Team" };
const VARIANT_LABEL = {
  standard: "Standard",
  bughouse: "Bughouse",
  league: "League",
};

// Sample editorial content — swap for a real feed/CMS whenever you're ready.
// Kept deliberately generic/evergreen rather than asserting specific dates
// or results.
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

function Stars({ value }) {
  return (
    <span className="dash-review-stars" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      {"☆".repeat(5 - value)}
    </span>
  );
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

  const welcomeMessage = useTypingEffect(
    "Welcome to the Tournament Manager Dashboard! ",
    100,
  );
  const subMessage = useTypingEffect(
    "Every tournament you've run, in one place.",
    100,
  );

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
      <div className="dash-bg" aria-hidden="true">
        <div className="dash-bg-scene" />
        <div className="dash-bg-scene" />
        <div className="dash-bg-scene" />
      </div>

      <div className="container">
        <div className="dash-header">
          <div>
            <h1 className="page-title">{welcomeMessage}</h1>
            <p className="page-subtitle">{subMessage}</p>
          </div>
          <button className="btn-primary" onClick={() => navigate("/new")}>
            + New Tournament
          </button>
        </div>

        {stats && stats.total > 0 && (
          <div className="dash-stats">
            <div className="dash-stat">
              <strong className="dash-mono">{stats.total}</strong>
              <span>Total tournaments</span>
            </div>
            <div className="dash-stat">
              <strong className="dash-mono">{stats.active}</strong>
              <span>In progress</span>
            </div>
            <div className="dash-stat">
              <strong className="dash-mono">{stats.finished}</strong>
              <span>Finished</span>
            </div>
            <div className="dash-stat">
              <strong className="dash-mono">{stats.players}</strong>
              <span>Competitors managed</span>
            </div>
          </div>
        )}

        {error && <div className="banner-error">{error}</div>}

        <div className="dash-section">
          <div className="dash-section-head">
            <h2>Your Tournaments</h2>
          </div>

          {tournaments && tournaments.length > 0 && (
            <div className="dash-filters">
              <div className="dash-filter-group">
                <span className="dash-filter-label">Format</span>
                {["all", "individual", "team"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`dash-chip${formatFilter === f ? " active" : ""}`}
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
                    className={`dash-chip${statusFilter === val ? " active" : ""}`}
                    onClick={() => setStatusFilter(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tournaments === null && <p className="muted">Loading…</p>}

          {tournaments && tournaments.length === 0 && (
            <div className="card empty-state">
              <div className="empty-glyph">♟</div>
              <h2>No tournaments yet</h2>
              <p className="muted">
                Create your first tournament to generate Round 1 pairings.
              </p>
              <button className="btn-primary" onClick={() => navigate("/new")}>
                + New Tournament
              </button>
            </div>
          )}

          {filtered && filtered.length === 0 && tournaments.length > 0 && (
            <div className="card empty-state">
              <p className="muted">No tournaments match these filters.</p>
            </div>
          )}

          {filtered && filtered.length > 0 && (
            <div className="tourney-grid">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="card tourney-card"
                  onClick={() => navigate(`/tournament/${t.id}`)}
                >
                  <div className="tourney-card-top">
                    <span className={`status-pill status-${t.status}`}>
                      {t.status}
                    </span>
                    <button
                      className="btn-del btn-sm"
                      onClick={(e) => handleDelete(e, t.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  <h3 className="tourney-name">{t.name}</h3>
                  <div className="tourney-meta">
                    <span>
                      {FORMAT_LABEL[t.format]}
                      {t.variant && t.variant !== "standard"
                        ? ` · ${VARIANT_LABEL[t.variant] || t.variant}`
                        : ""}
                    </span>
                    {t.federation && <span>{t.federation}</span>}
                    {t.timeControl && <span>{t.timeControl}</span>}
                  </div>
                  <div className="tourney-progress">
                    Round {t.currentRound} / {t.totalRounds} ·{" "}
                    {t.competitorCount}{" "}
                    {t.format === "team" ? "teams" : "players"}
                  </div>
                  {t.status === "finished" && t.winner && (
                    <div className="tourney-winner">🏆 {t.winner}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-section">
          <div className="dash-section-head">
            <h2>From the Kenyan Chess World</h2>
            <span className="dash-section-note">
              Sample content — edit anytime
            </span>
          </div>
          <div className="dash-news-grid">
            {NEWS_ITEMS.map((item) => (
              <div className="card dash-news-card" key={item.title}>
                <span className="dash-news-tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <span className="dash-news-date">{item.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dash-section">
          <div className="dash-section-head">
            <h2>What Organizers Say</h2>
          </div>
          <div className="dash-reviews-grid">
            {reviews.map((r, i) => (
              <div className="card dash-review-card" key={`${r.name}-${i}`}>
                <Stars value={r.rating} />
                <p className="dash-review-quote">"{r.quote}"</p>
                <div className="dash-review-author">
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
                <p className="muted">Thanks for the review! 🙌</p>
              ) : (
                <form onSubmit={submitReview}>
                  <div className="form-grid">
                    <label className="field">
                      <span>Your name</span>
                      <input
                        type="text"
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Jane Wanjiku"
                      />
                    </label>
                    <label className="field">
                      <span>Rating</span>
                      <div className="dash-star-picker">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className={n <= reviewRating ? "filled" : ""}
                            onClick={() => setReviewRating(n)}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </label>
                  </div>
                  <label className="field" style={{ marginBottom: 12 }}>
                    <span>Your review</span>
                    <textarea
                      rows={3}
                      value={reviewQuote}
                      onChange={(e) => setReviewQuote(e.target.value)}
                      placeholder="What's it been like running tournaments with Swiss Manager?"
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
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
      </div>
    </div>
  );
}
