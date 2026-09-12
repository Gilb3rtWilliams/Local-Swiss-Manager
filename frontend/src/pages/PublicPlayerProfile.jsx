import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import "../css/PublicPlayerProfile.css";

const RESULT_STYLE = {
  win: { label: "WIN", color: "#4ade80" },
  draw: { label: "DRAW", color: "#8a8a9a" },
  loss: { label: "LOSS", color: "#ff6b6b" },
  bye: { label: "BYE", color: "#d4a853" },
};

function outcomeFor(game) {
  if (game.result === "bye") return RESULT_STYLE.bye;
  if (game.points === 1) return RESULT_STYLE.win;
  if (game.points === 0.5) return RESULT_STYLE.draw;
  return RESULT_STYLE.loss;
}

export default function PublicPlayerProfile() {
  const { token, playerId } = useParams();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setProfile(null);
    setLoadError("");
    setLoading(true);

    api
      .getPublicPlayerProfile(token, playerId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, playerId]);

  if (loading) {
    return (
      <div className="public-player-profile">
        <div className="pp-card pp-loading">Loading player profile…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="public-player-profile">
        <div className="pp-card pp-error-card">
          <p className="pp-error-message">{loadError}</p>

          <Link to={`/results/${token}`} className="pp-back-link">
            ← Back to results
          </Link>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="public-player-profile">
      {/* Back */}
      <div>
        <Link to={`/results/${token}`} className="pp-back-link">
          ← Back to tournament
        </Link>
      </div>

      {/* Header */}
      <div className="pp-card pp-header-card">
        <div className="pp-header-content">
          <div className="pp-player-heading">
            <h2 className="pp-player-name">
              {profile.title && (
                <span className="pp-player-title">{profile.title}</span>
              )}

              {profile.name}
            </h2>

            <div className="pp-rating">
              Rating {profile.rating ?? "Unrated"}
              {profile.fideId && (
                <>
                  {" · "}
                  <a
                    href={`https://ratings.fide.com/profile/${profile.fideId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pp-fide-link"
                  >
                    FIDE {profile.fideId}
                  </a>
                </>
              )}
              {" · This tournament only"}
            </div>
          </div>

          <div className="pp-stat-row">
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
          <p className="pp-performance-note">
            Performance rating is an estimate from games in this tournament only
            (avg. opponent rating adjusted for score) — not an official FIDE
            norm calculation.
          </p>
        )}
      </div>

      {/* Opponents */}
      <div className="pp-card">
        <h3 className="pp-section-heading">Opponents Faced</h3>

        {profile.opponents.length === 0 ? (
          <p className="pp-empty">No games played yet.</p>
        ) : (
          <div className="pp-table-wrapper">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th className="pp-align-right">FIDE ID</th>
                  <th className="pp-align-right">Rating</th>
                  <th className="pp-align-right">Games</th>
                  <th className="pp-align-right">Score</th>
                </tr>
              </thead>

              <tbody>
                {profile.opponents.map((o) => (
                  <tr key={o.opponentId}>
                    <td className="pp-opponent-name">
                      {o.title && (
                        <span className="pp-opponent-title">{o.title}</span>
                      )}

                      <Link
                        to={`/results/${token}/player/${o.opponentId}`}
                        className="pp-player-link"
                      >
                        {o.name}
                      </Link>
                    </td>

                    <td className="pp-align-right pp-muted">
                      {o.rating ?? "—"}
                    </td>

                    <td className="pp-align-right pp-muted">{o.gamesPlayed}</td>

                    <td className="pp-align-right pp-score">{o.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Game History */}
      <div className="pp-card">
        <h3 className="pp-section-heading">Game History</h3>

        {profile.games.length === 0 ? (
          <p className="pp-empty">No games recorded yet.</p>
        ) : (
          <div className="pp-games-list">
            {profile.games.map((g, i) => {
              const outcome = outcomeFor(g);

              return (
                <div
                  key={`${g.round}-${g.opponentId || "bye"}-${i}`}
                  className="pp-game-row"
                >
                  <div className="pp-game-info">
                    <span className="pp-round">ROUND {g.round}</span>

                    {g.opponentId ? (
                      <span className="pp-game-opponent">
                        {g.opponentTitle && (
                          <span className="pp-opponent-title">
                            {g.opponentTitle}
                          </span>
                        )}

                        <Link
                          to={`/results/${token}/player/${g.opponentId}`}
                          className="pp-player-link"
                        >
                          {g.opponentName}
                        </Link>

                        {g.opponentRating != null && (
                          <span className="pp-opponent-rating">
                            {" "}
                            ({g.opponentRating})
                          </span>
                        )}

                        <span className="pp-color">
                          {g.color === "W" ? "as White" : "as Black"}
                        </span>
                      </span>
                    ) : (
                      <span className="pp-bye">No opponent — bye round</span>
                    )}
                  </div>

                  <span className="pp-outcome" style={{ color: outcome.color }}>
                    {outcome.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="pp-footer">Read-only view — shared by the organizer.</p>
    </div>
  );
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`pp-stat ${highlight ? "pp-stat-highlight" : ""}`}>
      <div className="pp-stat-value">{value}</div>

      <div className="pp-stat-label">{label}</div>
    </div>
  );
}
