import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/PublicTeamProfile.css";

// Team matches already carry an explicit "W"/"L"/"D"/"bye"/null result —
// mirrors the admin TeamProfile.jsx's outcomeFor() exactly, mapped onto
// pt- classes instead of inline colors.
function outcomeFor(match) {
  if (match.result === "bye")
    return { label: "BYE", className: "pt-outcome-bye" };
  if (match.result === "W")
    return { label: "WIN", className: "pt-outcome-win" };
  if (match.result === "D")
    return { label: "DRAW", className: "pt-outcome-draw" };
  if (match.result === "L")
    return { label: "LOSS", className: "pt-outcome-loss" };
  return { label: "PENDING", className: "pt-outcome-pending" };
}

function pointClass(points) {
  if (points === 1) return "pt-point-win";
  if (points === 0.5) return "pt-point-draw";
  if (points === 0) return "pt-point-loss";
  return "";
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`pt-stat ${highlight ? "pt-stat-highlight" : ""}`}>
      <span className="pt-stat-label">{label}</span>
      <span className="pt-stat-value">{value}</span>
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
      <div className="pt-shell">
        <div className="pt-topbar">
          <Link to={`/results/${token}`} className="pt-back-link">
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
      <div className="pt-card pt-error-card">
        <h2 className="pt-error-title">Profile not found</h2>
        <p className="pt-error-message">{loadError}</p>
      </div>,
    );
  }

  if (!profile) {
    return shell(
      <div className="pt-card pt-loading">Loading team profile…</div>,
    );
  }

  const playerCount = profile.roster.length;

  return shell(
    <>
      {/* Header */}
      <header className="pt-card pt-header-card">
        <span className="pt-eyebrow">Team Profile</span>
        <h1 className="pt-team-name">{profile.name}</h1>

        <p className="pt-meta">
          <span>
            {profile.rank
              ? `Rank #${profile.rank} of ${profile.teamCount}`
              : "Unranked"}
          </span>
          <span>
            {playerCount} player{playerCount === 1 ? "" : "s"}
          </span>
        </p>

        <div className="pt-stats">
          <StatBox label="Score" value={profile.score} highlight />
          <StatBox label="Wins" value={profile.wins} />
          <StatBox label="Buchholz" value={profile.buchholz} />
          <StatBox label="Sonneborn-Berger" value={profile.sb} />
        </div>
      </header>

      {/* Roster */}
      <section className="pt-card">
        <h2 className="pt-section-heading">Roster</h2>

        {playerCount === 0 ? (
          <p className="pt-empty">No players on this team.</p>
        ) : (
          <div className="pt-table-wrapper">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Board</th>
                  <th>Player</th>
                  <th>FIDE ID</th>
                  <th className="pt-align-right">Rating</th>
                  <th className="pt-align-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {profile.roster.map((p) => (
                  <tr key={p.id}>
                    <td className="pt-muted">{p.boardNum ?? "—"}</td>
                    <td className="pt-player-cell">
                      {p.title && (
                        <span className="pt-player-title">{p.title}</span>
                      )}
                      <Link
                        to={`/results/${token}/player/${p.id}`}
                        className="pt-link"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="pt-muted">
                      {p.fideId ? (
                        <a
                          href={`https://ratings.fide.com/profile/${p.fideId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pt-fide-link"
                        >
                          {p.fideId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="pt-align-right pt-muted">
                      {p.rating ?? "—"}
                    </td>
                    <td className="pt-align-right pt-score">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Match history */}
      <section className="pt-card">
        <h2 className="pt-section-heading">Match History</h2>

        {profile.matches.length === 0 ? (
          <p className="pt-empty">No matches recorded yet.</p>
        ) : (
          <div className="pt-matches">
            {profile.matches.map((m, i) => {
              const outcome = outcomeFor(m);
              return (
                <div
                  key={`${m.round}-${m.opponentId || "bye"}-${i}`}
                  className="pt-match"
                >
                  <div className="pt-match-summary">
                    <div className="pt-match-info">
                      <span className="pt-round">Round {m.round}</span>
                      {m.opponentId ? (
                        <span className="pt-match-opponent">
                          <Link
                            to={`/results/${token}/team/${m.opponentId}`}
                            className="pt-link"
                          >
                            {m.opponentName}
                          </Link>
                          <span className="pt-match-score">
                            {m.ourScore} – {m.opponentScore}
                          </span>
                        </span>
                      ) : (
                        <span className="pt-bye">No opponent — bye round</span>
                      )}
                    </div>
                    <span className={`pt-outcome ${outcome.className}`}>
                      {outcome.label}
                    </span>
                  </div>

                  {m.boards.length > 0 && (
                    <div className="pt-boards">
                      {m.boards.map((b) => (
                        <div key={b.boardNum} className="pt-board-row">
                          <span className="pt-board-num">Bd {b.boardNum}</span>
                          <span className="pt-board-players">
                            <span className="pt-board-ours">
                              {b.ourPlayerName}
                            </span>
                            {!b.sitOut && b.color && (
                              <span className="pt-board-color">
                                {b.color === "W" ? "White" : "Black"}
                              </span>
                            )}
                            {b.sitOut ? (
                              <span className="pt-board-note">sitting out</span>
                            ) : (
                              <span className="pt-board-vs">
                                vs {b.opponentPlayerName || "Unknown"}
                              </span>
                            )}
                          </span>
                          <span
                            className={`pt-board-result ${pointClass(
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

      <p className="pt-footer">Read-only view — shared by the organizer.</p>
    </>,
  );
}
