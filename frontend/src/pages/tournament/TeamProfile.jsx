import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/TeamProfile.css";

// Team matches already carry an explicit "W"/"L"/"D"/"bye"/null result —
// mirrors the admin TeamProfile.jsx's outcomeFor() exactly, mapped onto
// tm- classes instead of inline colors.
function outcomeFor(match) {
  if (match.result === "bye")
    return { label: "BYE", className: "tm-outcome-bye" };
  if (match.result === "W")
    return { label: "WIN", className: "tm-outcome-win" };
  if (match.result === "D")
    return { label: "DRAW", className: "tm-outcome-draw" };
  if (match.result === "L")
    return { label: "LOSS", className: "tm-outcome-loss" };
  return { label: "PENDING", className: "tm-outcome-pending" };
}

function pointClass(points) {
  if (points === 1) return "tm-point-win";
  if (points === 0.5) return "tm-point-draw";
  if (points === 0) return "tm-point-loss";
  return "";
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`tm-stat ${highlight ? "tm-stat-highlight" : ""}`}>
      <span className="tm-stat-label">{label}</span>
      <span className="tm-stat-value">{value}</span>
    </div>
  );
}

export default function PublicTeamProfile() {
  // Nested under TournamentLayout like PlayerProfile — `t` comes from the
  // same outlet context, and the layout already provides the theme.
  const { t } = useOutletContext();
  const { teamId } = useParams();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setLoadError("");
    api
      .getTeamProfile(t.id, teamId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [t.id, teamId]);

  const shell = (children) => (
    <div className="team-profile">
      <div className="tm-topbar">
        <Link to={`/tournament/${t.id}/standings`} className="tm-back-link">
          ← Back to tournament
        </Link>
      </div>
      {children}
    </div>
  );

  if (loadError) {
    return shell(
      <div className="tm-card tm-error-card">
        <h2 className="tm-error-title">Profile not found</h2>
        <p className="tm-error-message">{loadError}</p>
      </div>,
    );
  }

  if (!profile) {
    return shell(
      <div className="tm-card tm-loading">Loading team profile…</div>,
    );
  }

  const playerCount = profile.roster.length;

  return shell(
    <>
      {/* Header */}
      <header className="tm-card tm-header-card">
        <span className="tm-eyebrow">Team Profile</span>
        <h1 className="tm-team-name">{profile.name}</h1>

        <p className="tm-meta">
          <span>
            {profile.rank
              ? `Rank #${profile.rank} of ${profile.teamCount}`
              : "Unranked"}
          </span>
          <span>
            {playerCount} player{playerCount === 1 ? "" : "s"}
          </span>
        </p>

        <div className="tm-stats">
          <StatBox label="Score" value={profile.score} highlight />
          <StatBox label="Wins" value={profile.wins} />
          <StatBox label="Buchholz" value={profile.buchholz} />
          <StatBox label="Sonneborn-Berger" value={profile.sb} />
        </div>
      </header>

      {/* Roster */}
      <section className="tm-card">
        <h2 className="tm-section-heading">Roster</h2>

        {playerCount === 0 ? (
          <p className="tm-empty">No players on this team.</p>
        ) : (
          <div className="tm-table-wrapper">
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Board</th>
                  <th>Player</th>
                  <th>FIDE ID</th>
                  <th className="tm-align-right">Rating</th>
                  <th className="tm-align-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {profile.roster.map((p) => (
                  <tr key={p.id}>
                    <td className="tm-muted">{p.boardNum ?? "—"}</td>
                    <td className="tm-player-cell">
                      {p.title && (
                        <span className="tm-player-title">{p.title}</span>
                      )}
                      <Link
                        to={`/tournament/${t.id}/player/${p.id}`}
                        className="tm-link"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="tm-muted">
                      {p.fideId ? (
                        <a
                          href={`https://ratings.fide.com/profile/${p.fideId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tm-fide-link"
                        >
                          {p.fideId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tm-align-right tm-muted">
                      {p.rating ?? "—"}
                    </td>
                    <td className="tm-align-right tm-score">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Match history */}
      <section className="tm-card">
        <h2 className="tm-section-heading">Match History</h2>

        {profile.matches.length === 0 ? (
          <p className="tm-empty">No matches recorded yet.</p>
        ) : (
          <div className="tm-matches">
            {profile.matches.map((m, i) => {
              const outcome = outcomeFor(m);
              return (
                <div
                  key={`${m.round}-${m.opponentId || "bye"}-${i}`}
                  className="tm-match"
                >
                  <div className="tm-match-summary">
                    <div className="tm-match-info">
                      <span className="tm-round">Round {m.round}</span>
                      {m.opponentId ? (
                        <span className="tm-match-opponent">
                          <Link
                            to={`/tournament/${t.id}/team/${m.opponentId}`}
                            className="tm-link"
                          >
                            {m.opponentName}
                          </Link>
                          <span className="tm-match-score">
                            {m.ourScore} – {m.opponentScore}
                          </span>
                        </span>
                      ) : (
                        <span className="tm-bye">No opponent — bye round</span>
                      )}
                    </div>
                    <span className={`tm-outcome ${outcome.className}`}>
                      {outcome.label}
                    </span>
                  </div>

                  {m.boards.length > 0 && (
                    <div className="tm-boards">
                      {m.boards.map((b) => (
                        <div key={b.boardNum} className="tm-board-row">
                          <span className="tm-board-num">Bd {b.boardNum}</span>
                          <span className="tm-board-players">
                            <span className="tm-board-ours">
                              {b.ourPlayerName}
                            </span>
                            {!b.sitOut && b.color && (
                              <span className="tm-board-color">
                                {b.color === "W" ? "White" : "Black"}
                              </span>
                            )}
                            {b.sitOut ? (
                              <span className="tm-board-note">sitting out</span>
                            ) : (
                              <span className="tm-board-vs">
                                vs {b.opponentPlayerName || "Unknown"}
                              </span>
                            )}
                          </span>
                          <span
                            className={`tm-board-result ${pointClass(
                              b.points,
                            )}`}
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
      </section>

      <p className="tm-footer">Read-only view — shared by the organizer.</p>
    </>,
  );
}
