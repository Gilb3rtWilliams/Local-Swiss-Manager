import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/PublicTeamProfile.css";

// Team matches already carry an explicit "W"/"L"/"D"/"bye"/null result —
// mirrors the admin TeamProfile.jsx's outcomeFor() exactly, mapped onto
// ptp- classes instead of inline colors.
function outcomeFor(match) {
  if (match.result === "bye")
    return { label: "BYE", className: "ptp-outcome-bye" };
  if (match.result === "W")
    return { label: "WIN", className: "ptp-outcome-win" };
  if (match.result === "D")
    return { label: "DRAW", className: "ptp-outcome-draw" };
  if (match.result === "L")
    return { label: "LOSS", className: "ptp-outcome-loss" };
  return { label: "PENDING", className: "ptp-outcome-pending" };
}

function pointClass(points) {
  if (points === 1) return "ptp-point-win";
  if (points === 0.5) return "ptp-point-draw";
  if (points === 0) return "ptp-point-loss";
  return "";
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`ptp-stat ${highlight ? "ptp-stat-highlight" : ""}`}>
      <span className="ptp-stat-label">{label}</span>
      <span className="ptp-stat-value">{value}</span>
    </div>
  );
}

export default function PublicTeamProfile() {
  const { token, teamId } = useParams();
  // The --tp-* theme tokens only exist inside an element carrying
  // `tp-theme` + data-theme, so the page root sets both.
  const [theme, setTheme] = useTheme();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setLoadError("");
    api
      .getPublicTeamProfile(token, teamId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, teamId]);

  const shell = (children) => (
    <div className="public-team-profile tp-theme" data-theme={theme}>
      <div className="ptp-shell">
        <div className="ptp-topbar">
          <Link to={`/results/${token}`} className="ptp-back-link">
            ← Back to results
          </Link>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>
        {children}
      </div>
    </div>
  );

  if (loadError) {
    return shell(
      <div className="ptp-card ptp-error-card">
        <h2 className="ptp-error-title">Profile not found</h2>
        <p className="ptp-error-message">{loadError}</p>
      </div>,
    );
  }

  if (!profile) {
    return shell(
      <div className="ptp-card ptp-loading">Loading team profile…</div>,
    );
  }

  const playerCount = profile.roster.length;

  return shell(
    <>
      {/* Header */}
      <header className="ptp-card ptp-header-card">
        <span className="ptp-eyebrow">Team Profile</span>
        <h1 className="ptp-team-name">{profile.name}</h1>

        <p className="ptp-meta">
          <span>
            {profile.rank
              ? `Rank #${profile.rank} of ${profile.teamCount}`
              : "Unranked"}
          </span>
          <span>
            {playerCount} player{playerCount === 1 ? "" : "s"}
          </span>
        </p>

        <div className="ptp-stats">
          <StatBox label="Score" value={profile.score} highlight />
          <StatBox label="Wins" value={profile.wins} />
          <StatBox label="Buchholz" value={profile.buchholz} />
          <StatBox label="Sonneborn-Berger" value={profile.sb} />
        </div>
      </header>

      {/* Roster */}
      <section className="ptp-card">
        <h2 className="ptp-section-heading">Roster</h2>

        {playerCount === 0 ? (
          <p className="ptp-empty">No players on this team.</p>
        ) : (
          <div className="ptp-table-wrapper">
            <table className="ptp-table">
              <thead>
                <tr>
                  <th>Board</th>
                  <th>Player</th>
                  <th>FIDE ID</th>
                  <th className="ptp-align-right">Rating</th>
                  <th className="ptp-align-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {profile.roster.map((p) => (
                  <tr key={p.id}>
                    <td className="ptp-muted">{p.boardNum ?? "—"}</td>
                    <td className="ptp-player-cell">
                      {p.title && (
                        <span className="ptp-player-title">{p.title}</span>
                      )}
                      <Link
                        to={`/results/${token}/player/${p.id}`}
                        className="ptp-link"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="ptp-muted">
                      {p.fideId ? (
                        <a
                          href={`https://ratings.fide.com/profile/${p.fideId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ptp-fide-link"
                        >
                          {p.fideId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="ptp-align-right ptp-muted">
                      {p.rating ?? "—"}
                    </td>
                    <td className="ptp-align-right ptp-score">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Match history */}
      <section className="ptp-card">
        <h2 className="ptp-section-heading">Match History</h2>

        {profile.matches.length === 0 ? (
          <p className="ptp-empty">No matches recorded yet.</p>
        ) : (
          <div className="ptp-matches">
            {profile.matches.map((m, i) => {
              const outcome = outcomeFor(m);
              return (
                <div
                  key={`${m.round}-${m.opponentId || "bye"}-${i}`}
                  className="ptp-match"
                >
                  <div className="ptp-match-summary">
                    <div className="ptp-match-info">
                      <span className="ptp-round">Round {m.round}</span>
                      {m.opponentId ? (
                        <span className="ptp-match-opponent">
                          <Link
                            to={`/results/${token}/team/${m.opponentId}`}
                            className="ptp-link"
                          >
                            {m.opponentName}
                          </Link>
                          <span className="ptp-match-score">
                            {m.ourScore} – {m.opponentScore}
                          </span>
                        </span>
                      ) : (
                        <span className="ptp-bye">No opponent — bye round</span>
                      )}
                    </div>
                    <span className={`ptp-outcome ${outcome.className}`}>
                      {outcome.label}
                    </span>
                  </div>

                  {m.boards.length > 0 && (
                    <div className="ptp-boards">
                      {m.boards.map((b) => (
                        <div key={b.boardNum} className="ptp-board-row">
                          <span className="ptp-board-num">Bd {b.boardNum}</span>
                          <span className="ptp-board-players">
                            <span className="ptp-board-ours">
                              {b.ourPlayerName}
                            </span>
                            {!b.sitOut && b.color && (
                              <span className="ptp-board-color">
                                {b.color === "W" ? "White" : "Black"}
                              </span>
                            )}
                            {b.sitOut ? (
                              <span className="ptp-board-note">
                                sitting out
                              </span>
                            ) : (
                              <span className="ptp-board-vs">
                                vs {b.opponentPlayerName || "Unknown"}
                              </span>
                            )}
                          </span>
                          <span
                            className={`ptp-board-result ${pointClass(
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

      <p className="ptp-footer">Read-only view — shared by the organizer.</p>
    </>,
  );
}
