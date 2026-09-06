import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import "../css/PublicResults.css";

// Derived from points rather than the raw result string — points is
// unambiguous from this player's own perspective regardless of which side
// of the board they were on. Mirrors the admin PlayerProfile.jsx's
// outcomeFor() exactly, just mapped onto pv- classes instead of inline
// colors, since this page uses the class-based public token system.
function outcomeFor(game) {
  if (game.result === "bye")
    return { label: "BYE", className: "pv-outcome-bye" };
  if (game.points === 1) return { label: "WIN", className: "pv-outcome-win" };
  if (game.points === 0.5)
    return { label: "DRAW", className: "pv-outcome-draw" };
  return { label: "LOSS", className: "pv-outcome-loss" };
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

export default function PublicPlayerProfile() {
  const { token, playerId } = useParams();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setLoadError("");
    api
      .getPublicPlayerProfile(token, playerId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, playerId]);

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

        <span className="pv-eyebrow">Player Profile</span>
        <h1 className="pv-title">
          {profile.title && `${profile.title} `}
          {profile.name}
        </h1>
        <p className="pv-meta">
          <span>Rating {profile.rating ?? "Unrated"}</span>
          <span>This tournament only</span>
        </p>

        <div className="pv-card">
          <div className="pv-stat-row">
            <div className="pv-stat">
              <div className="pv-stat-value">{profile.score}</div>
              <div className="pv-stat-label">Score</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-value">{profile.gamesPlayed}</div>
              <div className="pv-stat-label">Games</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-value">{profile.byes}</div>
              <div className="pv-stat-label">Byes</div>
            </div>
            <div className="pv-stat highlight">
              <div className="pv-stat-value">
                {profile.performanceRating ?? "—"}
              </div>
              <div className="pv-stat-label">Performance</div>
            </div>
          </div>
          {profile.performanceRating != null && (
            <p className="pv-note">
              Performance rating is an estimate from games in this tournament
              only (avg. opponent rating adjusted for score) — not an official
              FIDE norm calculation.
            </p>
          )}
        </div>

        <div className="pv-card">
          <h2>Opponents Faced</h2>
          {profile.opponents.length === 0 ? (
            <p className="pv-empty">No games played yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Opponent</th>
                    <th style={{ textAlign: "right" }}>Rating</th>
                    <th style={{ textAlign: "right" }}>Games</th>
                    <th style={{ textAlign: "right" }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.opponents.map((o) => (
                    <tr key={o.opponentId}>
                      <td className="player-name">
                        {o.title && `${o.title} `}
                        <Link to={`/results/${token}/player/${o.opponentId}`}>
                          {o.name}
                        </Link>
                      </td>
                      <td style={{ textAlign: "right" }}>{o.rating ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{o.gamesPlayed}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        {o.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pv-card">
          <h2>Game History</h2>
          {profile.games.length === 0 ? (
            <p className="pv-empty">No games recorded yet.</p>
          ) : (
            profile.games.map((g, i) => {
              const outcome = outcomeFor(g);
              return (
                <div
                  key={`${g.round}-${g.opponentId || "bye"}-${i}`}
                  className="pv-game-row"
                >
                  <div>
                    <span className="pv-game-round">ROUND {g.round}</span>
                    {g.opponentId ? (
                      <span className="player-name">
                        {g.opponentTitle && `${g.opponentTitle} `}
                        <Link to={`/results/${token}/player/${g.opponentId}`}>
                          {g.opponentName}
                        </Link>
                        {g.opponentRating != null && (
                          <span className="pv-game-color">
                            ({g.opponentRating})
                          </span>
                        )}
                        <span className="pv-game-color">
                          {g.color === "W" ? "as White" : "as Black"}
                        </span>
                      </span>
                    ) : (
                      <span className="pv-bye" style={{ marginLeft: 8 }}>
                        No opponent — bye round
                      </span>
                    )}
                  </div>
                  <span className={`pv-outcome ${outcome.className}`}>
                    {outcome.label}
                  </span>
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
