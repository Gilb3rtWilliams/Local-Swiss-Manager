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

function Stars({ value }) {
  return (
    <span
      aria-label={`${value} out of 5 stars`}
      style={{ color: "#d4a853", fontSize: 14, letterSpacing: 2 }}
    >
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

  const primaryBtnStyle = {
    background: "#252532",
    border: "1px solid #353545",
    color: "#e8e8e8",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    padding: "10px 18px",
    borderRadius: 8,
    cursor: "pointer",
    textTransform: "uppercase",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
    display: "inline-flex",
    alignItem: "center",
    gap: 6,
  };

  const secondaryBtnStyle = {
    background: "#1a1a24",
    border: "1px solid #353545",
    color: "#e8e8e8",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    padding: "10px 18px",
    borderRadius: 8,
    cursor: "pointer",
    textTransform: "uppercase",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  };

  const chipStyle = (active) => ({
    background: active ? "#252532" : "#1a1a24",
    border: `1px solid ${active ? "#5a5a6a" : "#353545"}`,
    color: active ? "#fff" : "#8a8a9a",
    fontSize: 11,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  });

  const inputStyle = {
    background: "#1a1a24",
    border: "1px solid #353545",
    color: "#e8e8e8",
    padding: "10px 12px",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "32px",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        color: "#e8e8e8",
        background:
          "radial-gradient(circle at 50% 0%, #1f1f2e 0%, transparent 70%)",
        padding: "16px 0",
        borderRadius: "16px",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          width: "100%",
          margin: "0 auto",
          padding: "0 20px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#e8e8e8",
                margin: "0 0 8px 0",
                lineHeight: 1.4,
              }}
            >
              {welcomeMessage}
            </h1>
            <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
              {subMessage}
            </p>
          </div>
          <button style={primaryBtnStyle} onClick={() => navigate("/new")}>
            + New Tournament
          </button>
        </div>

        {/* Stats Row */}
        {stats && stats.total > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            {[
              { label: "Total tournaments", value: stats.total },
              { label: "In progress", value: stats.active },
              { label: "Finished", value: stats.finished },
              { label: "Competitors managed", value: stats.players },
            ].map((stat, idx) => (
              <div
                key={idx}
                style={{
                  background: "#13131a",
                  border: "1px solid #252532",
                  borderRadius: 12,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <strong
                  style={{ fontSize: 24, fontWeight: 700, color: "#d4a853" }}
                >
                  {stat.value}
                </strong>
                <span
                  style={{
                    fontSize: 11,
                    color: "#8a8a9a",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(255, 107, 107, 0.1)",
              border: "1px solid rgba(255, 107, 107, 0.3)",
              color: "#ff6b6b",
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Tournaments Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#e8e8e8",
                margin: 0,
              }}
            >
              Your Tournaments
            </h2>
          </div>

          {tournaments && tournaments.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 20,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "#6b6b7b",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Format:
                </span>
                {["all", "individual", "team"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    style={chipStyle(formatFilter === f)}
                    onClick={() => setFormatFilter(f)}
                  >
                    {f === "all" ? "All" : FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "#6b6b7b",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Status:
                </span>
                {[
                  ["all", "All"],
                  ["active", "In progress"],
                  ["finished", "Finished"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    style={chipStyle(statusFilter === val)}
                    onClick={() => setStatusFilter(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tournaments === null && (
            <p style={{ color: "#8a8a9a", fontSize: 13 }}>Loading…</p>
          )}

          {tournaments && tournaments.length === 0 && (
            <div
              style={{
                background: "#13131a",
                border: "1px solid #252532",
                borderRadius: 12,
                padding: 48,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 32, color: "#d4a853" }}>♟</div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#e8e8e8",
                  margin: 0,
                }}
              >
                No tournaments yet
              </h2>
              <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
                Create your first tournament to generate Round 1 pairings.
              </p>
              <button
                style={{ ...primaryBtnStyle, marginTop: 8 }}
                onClick={() => navigate("/new")}
              >
                + New Tournament
              </button>
            </div>
          )}

          {filtered && filtered.length === 0 && tournaments.length > 0 && (
            <div
              style={{
                background: "#13131a",
                border: "1px solid #252532",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                color: "#8a8a9a",
                fontSize: 13,
              }}
            >
              No tournaments match these filters.
            </div>
          )}

          {filtered && filtered.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              {filtered.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/tournament/${t.id}`)}
                  style={{
                    background: "#13131a",
                    border: "1px solid #252532",
                    borderRadius: 12,
                    padding: 20,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    transition: "all 0.2s ease",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        borderRadius: 4,
                        background:
                          t.status === "finished" ? "#1f2e1f" : "#2e271f",
                        color: t.status === "finished" ? "#6bc76b" : "#d4a853",
                        border: `1px solid ${t.status === "finished" ? "#2f4a2f" : "#4a3f2f"}`,
                      }}
                    >
                      {t.status}
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, t.id)}
                      title="Delete"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#6b6b7b",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 4,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#e8e8e8",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {t.name}
                  </h3>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 11,
                      color: "#8a8a9a",
                    }}
                  >
                    <span>
                      {FORMAT_LABEL[t.format]}
                      {t.variant && t.variant !== "standard"
                        ? ` · ${VARIANT_LABEL[t.variant] || t.variant}`
                        : ""}
                    </span>
                    {t.federation && <span>{t.federation}</span>}
                    {t.timeControl && <span>{t.timeControl}</span>}
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid #252532",
                      paddingTop: 10,
                      marginTop: 4,
                      fontSize: 11,
                      color: "#6b6b7b",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      Round {t.currentRound} / {t.totalRounds}
                    </span>
                    <span>
                      {t.competitorCount}{" "}
                      {t.format === "team" ? "teams" : "players"}
                    </span>
                  </div>

                  {t.status === "finished" && t.winner && (
                    <div
                      style={{
                        background: "rgba(212, 168, 83, 0.1)",
                        border: "1px solid rgba(212, 168, 83, 0.2)",
                        color: "#d4a853",
                        fontSize: 11,
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      🏆 {t.winner}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* News Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#e8e8e8",
                margin: 0,
              }}
            >
              From the Kenyan Chess World
            </h2>
            <span
              style={{ fontSize: 11, color: "#6b6b7b", fontStyle: "italic" }}
            >
              Sample content — edit anytime
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {NEWS_ITEMS.map((item) => (
              <div
                key={item.title}
                style={{
                  background: "#13131a",
                  border: "1px solid #252532",
                  borderRadius: 12,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#d4a853",
                    background: "#252532",
                    padding: "3px 8px",
                    borderRadius: 4,
                    width: "fit-content",
                  }}
                >
                  {item.tag}
                </span>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#e8e8e8",
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "#8a8a9a",
                    margin: 0,
                    lineHeight: 1.5,
                    flex: 1,
                  }}
                >
                  {item.excerpt}
                </p>
                <span
                  style={{
                    fontSize: 10,
                    color: "#6b6b7b",
                    paddingTop: 8,
                    borderTop: "1px solid #1f1f2a",
                  }}
                >
                  {item.date}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Reviews Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 12,
          }}
        >
          <div
            style={{
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#e8e8e8",
                margin: 0,
              }}
            >
              What Organizers Say
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {reviews.map((r, i) => (
              <div
                key={`${r.name}-${i}`}
                style={{
                  background: "#13131a",
                  border: "1px solid #252532",
                  borderRadius: 12,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <Stars value={r.rating} />
                <p
                  style={{
                    fontSize: 13,
                    color: "#e8e8e8",
                    margin: 0,
                    fontStyle: "italic",
                    lineHeight: 1.5,
                    flex: 1,
                  }}
                >
                  "{r.quote}"
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    borderTop: "1px solid #1f1f2a",
                    paddingTop: 10,
                  }}
                >
                  <strong style={{ fontSize: 12, color: "#e8e8e8" }}>
                    {r.name}
                  </strong>
                  <span style={{ fontSize: 11, color: "#6b6b7b" }}>
                    {r.role}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {!reviewFormOpen ? (
            <button
              style={{
                ...secondaryBtnStyle,
                width: "fit-content",
                marginTop: 8,
              }}
              onClick={() => setReviewFormOpen(true)}
            >
              + Share Your Experience
            </button>
          ) : (
            <div
              style={{
                background: "#13131a",
                border: "1px solid #252532",
                borderRadius: 12,
                padding: 24,
                marginTop: 8,
              }}
            >
              {reviewSubmitted ? (
                <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
                  Thanks for the review! 🙌
                </p>
              ) : (
                <form
                  onSubmit={submitReview}
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 16,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        fontSize: 11,
                        color: "#8a8a9a",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      <span>Your name</span>
                      <input
                        type="text"
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Jane Wanjiku"
                        style={inputStyle}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        fontSize: 11,
                        color: "#8a8a9a",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      <span>Rating</span>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          fontSize: 22,
                          cursor: "pointer",
                          height: 40,
                          alignItems: "center",
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            style={{
                              color: n <= reviewRating ? "#d4a853" : "#353545",
                            }}
                            onClick={() => setReviewRating(n)}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </label>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 11,
                      color: "#8a8a9a",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    <span>Your review</span>
                    <textarea
                      rows={3}
                      value={reviewQuote}
                      onChange={(e) => setReviewQuote(e.target.value)}
                      placeholder="What's it been like running tournaments with Swiss Manager?"
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button style={primaryBtnStyle} type="submit">
                      Submit Review
                    </button>
                    <button
                      type="button"
                      style={secondaryBtnStyle}
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
        <footer
          style={{
            borderTop: "1px solid #252532",
            paddingTop: 24,
            marginTop: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 20,
            color: "#8a8a9a",
            fontSize: 12,
          }}
        >
          <div>
            <p
              style={{ fontWeight: 700, color: "#e8e8e8", margin: "0 0 4px 0" }}
            >
              Swiss Manager
            </p>
            <p style={{ margin: 0, color: "#6b6b7b" }}>
              Built and maintained by Gilbert Williams.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "flex-end",
            }}
          >
            <a
              href="tel:+254719737274"
              style={{ color: "#d4a853", textDecoration: "none" }}
            >
              0719 737 274
            </a>
            <a
              href="tel:+254714591285"
              style={{ color: "#d4a853", textDecoration: "none" }}
            >
              0714 591 285
            </a>
            <a
              href="mailto:gilbertwilliamsnyange@gmail.com"
              style={{ color: "#8a8a9a", textDecoration: "none" }}
            >
              gilbertwilliamsnyange@gmail.com
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
