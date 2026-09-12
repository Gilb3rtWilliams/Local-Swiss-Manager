import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";

const RESULT_STYLE = {
  win: { label: "WIN", color: "#4ade80" },
  draw: { label: "DRAW", color: "#8a8a9a" },
  loss: { label: "LOSS", color: "#ff6b6b" },
  bye: { label: "BYE", color: "#d4a853" },
};

// Derived from points rather than re-parsing the raw result string — the
// backend already did that work (scoreFromResult), and points is
// unambiguous from the player's own perspective regardless of which side
// of the board they were on.
function outcomeFor(game) {
  if (game.result === "bye") return RESULT_STYLE.bye;
  if (game.points === 1) return RESULT_STYLE.win;
  if (game.points === 0.5) return RESULT_STYLE.draw;
  return RESULT_STYLE.loss;
}

const cardStyle = {
  background: "#13131a",
  border: "1px solid #252532",
  borderRadius: 12,
  padding: "24px",
};

const sectionHeadingStyle = {
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#e8e8e8",
  margin: 0,
  marginBottom: 20,
  borderBottom: "1px solid #252532",
  paddingBottom: 12,
};

export default function PlayerProfile() {
  // Nested under TournamentLayout like every other tournament page, so `t`
  // (and refresh) come from the same outlet context — this page doesn't
  // introduce a new data-fetching pattern for the tournament itself, only
  // for the profile data layered on top of it.
  const { t } = useOutletContext();
  const { playerId } = useParams();

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getPlayerProfile(t.id, playerId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.id, playerId]);

  const wrapperStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
    color: "#e8e8e8",
    background:
      "radial-gradient(circle at 50% 0%, #1f1f2e 0%, transparent 70%)",
    padding: "8px 0",
    borderRadius: "16px",
  };

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <div style={{ ...cardStyle, textAlign: "center", color: "#8a8a9a" }}>
          Loading player profile…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={wrapperStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <p style={{ color: "#ff6b6b", margin: "0 0 16px 0" }}>{error}</p>
          <Link
            to={`/tournament/${t.id}/standings`}
            style={{ color: "#8a8a9a", fontSize: 12 }}
          >
            ← Back to standings
          </Link>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div style={wrapperStyle}>
      <div>
        <Link
          to={`/tournament/${t.id}/standings`}
          style={{
            color: "#8a8a9a",
            fontSize: 11,
            textDecoration: "none",
            letterSpacing: "0.05em",
          }}
        >
          ← Back to tournament
        </Link>
      </div>

      {/* Header card: identity + headline numbers */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 20,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {profile.title && (
                <span
                  style={{ color: "#c25555", marginRight: 8, fontWeight: 700 }}
                >
                  {profile.title}
                </span>
              )}
              {profile.name}
            </h2>
            <div style={{ color: "#8a8a9a", fontSize: 12, marginTop: 6 }}>
              Rating {profile.rating ?? "Unrated"}
              {profile.fideId && (
                <>
                  {" · "}
                  <a
                    href={`https://ratings.fide.com/profile/${profile.fideId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#8aa9d4", textDecoration: "none" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.textDecoration = "underline")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.textDecoration = "none")
                    }
                  >
                    FIDE {profile.fideId}
                  </a>
                </>
              )}
              {" · This tournament only"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatBox label="Score" value={profile.score} />
            <StatBox label="Games" value={profile.gamesPlayed} />
            <StatBox label="Byes" value={profile.byes} />
            <StatBox
              label="Performance"
              value={profile.performanceRating ?? "—"}
              highlight
            />
          </div>
        </div>
        {profile.performanceRating != null && (
          <p
            style={{
              color: "#6b6b7b",
              fontSize: 11,
              marginTop: 16,
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Performance rating is an estimate from games in this tournament only
            (avg. opponent rating adjusted for score) — not an official FIDE
            norm calculation.
          </p>
        )}
      </div>

      {/* Opponents summary — the "score against them" view */}
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Opponents Faced</h3>
        {profile.opponents.length === 0 ? (
          <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
            No games played yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #252532",
                    color: "#6b6b7b",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  <th style={{ padding: "10px 12px" }}>Opponent</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>
                    FIDE ID
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>
                    Rating
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>
                    Games
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.opponents.map((o) => (
                  <tr
                    key={o.opponentId}
                    style={{ borderBottom: "1px solid #1f1f2a" }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                      {o.title && (
                        <span
                          style={{
                            color: "#c25555",
                            marginRight: 6,
                            fontWeight: 700,
                          }}
                        >
                          {o.title}
                        </span>
                      )}
                      <Link
                        to={`/tournament/${t.id}/player/${o.opponentId}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.textDecoration = "underline")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.textDecoration = "none")
                        }
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontSize: 11,
                        fontFamily:
                          "'SF Mono', Monaco, 'Cascadia Code', monospace",
                      }}
                    >
                      {o.fideId ? (
                        <a
                          href={`https://ratings.fide.com/profile/${o.fideId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#8aa9d4", textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.textDecoration = "underline")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.textDecoration = "none")
                          }
                        >
                          {o.fideId}
                        </a>
                      ) : (
                        <span style={{ color: "#4a4a55" }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: "#8a8a9a",
                      }}
                    >
                      {o.rating ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: "#8a8a9a",
                      }}
                    >
                      {o.gamesPlayed}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {o.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chronological game log, most recent round first */}
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Game History</h3>
        {profile.games.length === 0 ? (
          <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
            No games recorded yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profile.games.map((g, i) => {
              const outcome = outcomeFor(g);
              return (
                <div
                  key={`${g.round}-${g.opponentId || "bye"}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: "#181822",
                    border: "1px solid #252532",
                    borderRadius: 8,
                    padding: "12px 16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 14 }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#6b6b7b",
                        letterSpacing: "0.06em",
                        minWidth: 56,
                      }}
                    >
                      ROUND {g.round}
                    </span>
                    {g.opponentId ? (
                      <span style={{ fontWeight: 600 }}>
                        {g.opponentTitle && (
                          <span
                            style={{
                              color: "#c25555",
                              marginRight: 6,
                              fontWeight: 700,
                            }}
                          >
                            {g.opponentTitle}
                          </span>
                        )}
                        <Link
                          to={`/tournament/${t.id}/player/${g.opponentId}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.textDecoration = "underline")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.textDecoration = "none")
                          }
                        >
                          {g.opponentName}
                        </Link>
                        {g.opponentRating != null && (
                          <span style={{ color: "#8a8a9a", fontWeight: 400 }}>
                            {" "}
                            ({g.opponentRating})
                          </span>
                        )}
                        {g.opponentFideId && (
                          <a
                            href={`https://ratings.fide.com/profile/${g.opponentFideId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#8aa9d4",
                              fontWeight: 400,
                              fontSize: 11,
                              marginLeft: 8,
                              textDecoration: "none",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.textDecoration =
                                "underline")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.textDecoration = "none")
                            }
                          >
                            FIDE {g.opponentFideId}
                          </a>
                        )}
                        <span
                          style={{
                            color: "#6b6b7b",
                            fontWeight: 400,
                            marginLeft: 8,
                            fontSize: 11,
                          }}
                        >
                          {g.color === "W" ? "as White" : "as Black"}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: "#8a8a9a", fontStyle: "italic" }}>
                        No opponent — bye round
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: outcome.color,
                      minWidth: 44,
                      textAlign: "right",
                    }}
                  >
                    {outcome.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }) {
  return (
    <div
      style={{
        background: highlight ? "rgba(212, 168, 83, 0.08)" : "#181822",
        border: `1px solid ${
          highlight ? "rgba(212, 168, 83, 0.35)" : "#252532"
        }`,
        borderRadius: 8,
        padding: "10px 16px",
        minWidth: 90,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: highlight ? "#d4a853" : "#e8e8e8",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#8a8a9a",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
