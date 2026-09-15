import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import "../css/PublicResults.css";

// Team matches already carry an explicit "W"/"L"/"D"/"bye"/null result —
// mirrors the admin TeamProfile.jsx's outcomeFor() exactly, mapped onto
// pv- classes instead of inline colors.
function outcomeFor(match) {
  if (match.result === "bye")
    return { label: "BYE", className: "pv-outcome-bye" };
  if (match.result === "W")
    return { label: "WIN", className: "pv-outcome-win" };
  if (match.result === "D")
    return { label: "DRAW", className: "pv-outcome-draw" };
  if (match.result === "L")
    return { label: "LOSS", className: "pv-outcome-loss" };
  return { label: "PENDING", className: "" };
}

function pointColor(points) {
  if (points === 1) return "pv-outcome-win";
  if (points === 0.5) return "pv-outcome-draw";
  if (points === 0) return "pv-outcome-loss";
  return "";
}

function BgScenes() {
  return (
    <div className="pv-bg" aria-hidden="true">
      <div className="pv-bg-scene" />
      <div className="pv-bg-scene" />
      <div className="pv-bg-scene" />
    </div>
  );
}

export default function PublicTeamProfile() {
  const { token, teamId } = useParams();

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

  if (loadError) {
    return (
      <div className="pv-root">
        <BgScenes />
        <div className="pv-shell">
          <div className="pv-closed">
            <h2>Profile not found</h2>
            <p>{loadError}</p>
            <p style={{ marginTop: 16 }}>
              <Link to={`/results/${token}`}>← Back to results</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="pv-root">
        <BgScenes />
        <div className="pv-shell">
          <p className="pv-meta">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pv-root">
      <BgScenes />
      <div className="pv-shell">
        <Link to={`/results/${token}`} className="pv-back-link">
          ← Back to results
        </Link>

        <span className="pv-eyebrow">Team Profile</span>
        <h1 className="pv-title">{profile.name}</h1>
        <p className="pv-meta">
          <span>
            {profile.rank
              ? `Rank #${profile.rank} of ${profile.teamCount}`
              : "Unranked"}
          </span>
          <span>
            {profile.roster.length} player
            {profile.roster.length === 1 ? "" : "s"}
          </span>
        </p>

        <div className="pv-card">
          <div className="pv-stat-row">
            <div className="pv-stat highlight">
              <div className="pv-stat-value">{profile.score}</div>
              <div className="pv-stat-label">Score</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-value">{profile.wins}</div>
              <div className="pv-stat-label">Wins</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-value">{profile.buchholz}</div>
              <div className="pv-stat-label">Buchholz</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-value">{profile.sb}</div>
              <div className="pv-stat-label">Sonneborn-Berger</div>
            </div>
          </div>
        </div>

        <div className="pv-card">
          <h2>Roster</h2>
          {profile.roster.length === 0 ? (
            <p className="pv-empty">No players on this team.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Board</th>
                    <th>Player</th>
                    <th>FIDE ID</th>
                    <th style={{ textAlign: "right" }}>Rating</th>
                    <th style={{ textAlign: "right" }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.roster.map((p) => (
                    <tr key={p.id}>
                      <td>{p.boardNum ?? "—"}</td>
                      <td className="player-name">
                        {p.title && `${p.title} `}
                        <Link to={`/results/${token}/player/${p.id}`}>
                          {p.name}
                        </Link>
                      </td>
                      <td>
                        {p.fideId ? (
                          <a
                            href={`https://ratings.fide.com/profile/${p.fideId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {p.fideId}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>{p.rating ?? "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        {p.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pv-card">
          <h2>Match History</h2>
          {profile.matches.length === 0 ? (
            <p className="pv-empty">No matches recorded yet.</p>
          ) : (
            profile.matches.map((m, i) => {
              const outcome = outcomeFor(m);
              return (
                <div
                  key={`${m.round}-${m.opponentId || "bye"}-${i}`}
                  className="pv-match-card"
                >
                  <div className="pv-match-summary">
                    <span>
                      <span className="pv-game-round">ROUND {m.round}</span>
                      {m.opponentId ? (
                        <span className="player-name">
                          <Link to={`/results/${token}/team/${m.opponentId}`}>
                            {m.opponentName}
                          </Link>
                          <span className="pv-game-color">
                            {" "}
                            {m.ourScore} – {m.opponentScore}
                          </span>
                        </span>
                      ) : (
                        <span className="pv-bye">No opponent — bye round</span>
                      )}
                    </span>
                    <span className={`pv-outcome ${outcome.className}`}>
                      {outcome.label}
                    </span>
                  </div>

                  {m.boards.length > 0 && (
                    <div className="pv-board-list">
                      {m.boards.map((b) => (
                        <div key={b.boardNum} className="pv-board-row">
                          <span>
                            Bd {b.boardNum} · {b.ourPlayerName}
                            {!b.sitOut && b.color && (
                              <> ({b.color === "W" ? "White" : "Black"})</>
                            )}
                            {b.sitOut ? (
                              <> — sitting out</>
                            ) : (
                              <> vs {b.opponentPlayerName || "Unknown"}</>
                            )}
                          </span>
                          <span className={pointColor(b.points)}>
                            {b.sitOut ? "—" : b.result ? b.result : "pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="pv-footnote">Read-only view — shared by the organizer.</p>
      </div>
    </div>
  );
}
