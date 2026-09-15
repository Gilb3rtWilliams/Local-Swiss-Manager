import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";

const RESULT_STYLE = {
  win: { label: "WIN", color: "#4ade80" },
  draw: { label: "DRAW", color: "#8a8a9a" },
  loss: { label: "LOSS", color: "#ff6b6b" },
  bye: { label: "BYE", color: "#d4a853" },
};

// Team matches already carry an explicit "W"/"L"/"D"/"bye"/null result
// (computed server-side from ourScore vs opponentScore) — no need to
// re-derive it from points the way PlayerProfile's outcomeFor does for
// individual games.
function outcomeFor(match) {
  if (match.result === "bye") return RESULT_STYLE.bye;
  if (match.result === "W") return RESULT_STYLE.win;
  if (match.result === "D") return RESULT_STYLE.draw;
  if (match.result === "L") return RESULT_STYLE.loss;
  return { label: "PENDING", color: "#6b6b7b" };
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

const fideLinkStyle = {
  color: "#8aa9d4",
  textDecoration: "none",
  fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
  fontSize: 11,
};

function FideLink({ fideId }) {
  if (!fideId) return <span style={{ color: "#4a4a55" }}>—</span>;
  return (
    <a
      href={`https://ratings.fide.com/profile/${fideId}`}
      target="_blank"
      rel="noopener noreferrer"
      style={fideLinkStyle}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {fideId}
    </a>
  );
}

export default function TeamProfile() {
  // Nested under TournamentLayout like PlayerProfile — `t` comes from the
  // same outlet context, no separate tournament-fetching pattern needed.
  const { t } = useOutletContext();
  const { teamId } = useParams();

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getTeamProfile(t.id, teamId)
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
  }, [t.id, teamId]);

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
          Loading team profile…
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
              {profile.name}
            </h2>
            <div style={{ color: "#8a8a9a", fontSize: 12, marginTop: 6 }}>
              {profile.rank
                ? `Rank #${profile.rank} of ${profile.teamCount}`
                : "Unranked"}
              {" · "}
              {profile.roster.length} player
              {profile.roster.length === 1 ? "" : "s"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatBox label="Score" value={profile.score} highlight />
            <StatBox label="Wins" value={profile.wins} />
            <StatBox label="Buchholz" value={profile.buchholz} />
            <StatBox label="Sonneborn-Berger" value={profile.sb} />
          </div>
        </div>
      </div>

      {/* Roster */}
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Roster</h3>
        {profile.roster.length === 0 ? (
          <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
            No players on this team.
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
                  <th style={{ padding: "10px 12px" }}>Board</th>
                  <th style={{ padding: "10px 12px" }}>Player</th>
                  <th style={{ padding: "10px 12px" }}>FIDE ID</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>
                    Rating
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.roster.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #1f1f2a" }}>
                    <td style={{ padding: "10px 12px", color: "#6b6b7b" }}>
                      {p.boardNum ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                      {p.title && (
                        <span
                          style={{
                            color: "#c25555",
                            marginRight: 6,
                            fontWeight: 700,
                          }}
                        >
                          {p.title}
                        </span>
                      )}
                      <Link
                        to={`/tournament/${t.id}/player/${p.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.textDecoration = "underline")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.textDecoration = "none")
                        }
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <FideLink fideId={p.fideId} />
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: "#8a8a9a",
                      }}
                    >
                      {p.rating ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {p.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Match history, most recent round first */}
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Match History</h3>
        {profile.matches.length === 0 ? (
          <p style={{ color: "#8a8a9a", fontSize: 13, margin: 0 }}>
            No matches recorded yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {profile.matches.map((m, i) => {
              const outcome = outcomeFor(m);
              return (
                <div
                  key={`${m.round}-${m.opponentId || "bye"}-${i}`}
                  style={{
                    background: "#181822",
                    border: "1px solid #252532",
                    borderRadius: 8,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
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
                        ROUND {m.round}
                      </span>
                      {m.opponentId ? (
                        <span style={{ fontWeight: 600 }}>
                          <Link
                            to={`/tournament/${t.id}/team/${m.opponentId}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.textDecoration =
                                "underline")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.textDecoration = "none")
                            }
                          >
                            {m.opponentName}
                          </Link>
                        </span>
                      ) : (
                        <span style={{ color: "#8a8a9a", fontStyle: "italic" }}>
                          No opponent — bye round
                        </span>
                      )}
                      {m.opponentId && (
                        <span style={{ color: "#8a8a9a", fontSize: 12 }}>
                          {m.ourScore} – {m.opponentScore}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: outcome.color,
                        minWidth: 60,
                        textAlign: "right",
                      }}
                    >
                      {outcome.label}
                    </span>
                  </div>

                  {m.boards.length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px solid #252532",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {m.boards.map((b) => (
                        <div
                          key={b.boardNum}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            fontSize: 12,
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <span style={{ color: "#8a8a9a" }}>
                            <span style={{ color: "#6b6b7b", marginRight: 8 }}>
                              Bd {b.boardNum}
                            </span>
                            {b.ourPlayerName}
                            {!b.sitOut && b.color && (
                              <span style={{ color: "#6b6b7b" }}>
                                {" "}
                                ({b.color === "W" ? "White" : "Black"})
                              </span>
                            )}
                            {b.sitOut ? (
                              <span
                                style={{
                                  color: "#6b6b7b",
                                  fontStyle: "italic",
                                }}
                              >
                                {" "}
                                — sitting out
                              </span>
                            ) : (
                              <>
                                {" vs "}
                                {b.opponentPlayerName || "Unknown"}
                              </>
                            )}
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                b.points === 1
                                  ? "#4ade80"
                                  : b.points === 0.5
                                  ? "#8a8a9a"
                                  : b.points === 0
                                  ? "#ff6b6b"
                                  : "#6b6b7b",
                            }}
                          >
                            {b.sitOut ? "—" : b.result ? b.result : "pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
