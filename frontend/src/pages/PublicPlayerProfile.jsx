import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/PublicPlayerProfile.css";

const RESULT_STYLE = {
  win: { label: "WIN", className: "ppp-outcome-win" },
  draw: { label: "DRAW", className: "ppp-outcome-draw" },
  loss: { label: "LOSS", className: "ppp-outcome-loss" },
  bye: { label: "BYE", className: "ppp-outcome-bye" },
};

function outcomeFor(game) {
  if (game.result === "bye") return RESULT_STYLE.bye;
  if (game.points === 1) return RESULT_STYLE.win;
  if (game.points === 0.5) return RESULT_STYLE.draw;
  return RESULT_STYLE.loss;
}

export default function PublicPlayerProfile() {
  const { token, playerId } = useParams();
  // The --tp-* theme tokens only exist inside an element carrying `tp-theme`
  // + data-theme, so the page root sets both.
  const [theme, setTheme] = useTheme();

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

  const shell = (children) => (
    <div className="public-player-profile tp-theme" data-theme={theme}>
      <div className="ppp-shell">
        <div className="ppp-topbar">
          <Link to={`/results/${token}`} className="ppp-back-link">
            ← Back to tournament
          </Link>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="ppp-card ppp-loading">Loading player profile…</div>,
    );
  }

  if (loadError) {
    return shell(
      <div className="ppp-card ppp-error-card">
        <p className="ppp-error-message">{loadError}</p>
      </div>,
    );
  }

  if (!profile) return null;

  return shell(
    <>
      {/* Header */}
      <header className="ppp-card ppp-header-card">
        <span className="ppp-eyebrow">Player Profile</span>
        <h1 className="ppp-player-name">
          {profile.title && (
            <span className="ppp-player-title">{profile.title}</span>
          )}
          {profile.name}
        </h1>

        <p className="ppp-rating">
          <span>Rating {profile.rating ?? "Unrated"}</span>
          {profile.fideId && (
            <span>
              <a
                href={`https://ratings.fide.com/profile/${profile.fideId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ppp-fide-link"
              >
                FIDE {profile.fideId}
              </a>
            </span>
          )}
          <span>This tournament only</span>
        </p>

        <div className="ppp-stats">
          <StatBox label="Score" value={profile.score} />
          <StatBox label="Games" value={profile.gamesPlayed} />
          <StatBox label="Byes" value={profile.byes} />
          <StatBox
            label="Performance"
            value={profile.performanceRating ?? "—"}
            highlight
          />
        </div>

        {profile.performanceRating != null && (
          <p className="ppp-performance-note">
            Performance rating is an estimate from games in this tournament only
            (avg. opponent rating adjusted for score) — not an official FIDE
            norm calculation.
          </p>
        )}
      </header>

      {/* Opponents */}
      <section className="ppp-card">
        <h2 className="ppp-section-heading">Opponents Faced</h2>

        {profile.opponents.length === 0 ? (
          <p className="ppp-empty">No games played yet.</p>
        ) : (
          <div className="ppp-table-wrapper">
            <table className="ppp-table">
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th className="ppp-align-right">Rating</th>
                  <th className="ppp-align-right">Games</th>
                  <th className="ppp-align-right">Score</th>
                </tr>
              </thead>

              <tbody>
                {profile.opponents.map((o) => (
                  <tr key={o.opponentId}>
                    <td className="ppp-opponent-name">
                      {o.title && (
                        <span className="ppp-opponent-title">{o.title}</span>
                      )}
                      <Link
                        to={`/results/${token}/player/${o.opponentId}`}
                        className="ppp-player-link"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="ppp-align-right ppp-muted">
                      {o.rating ?? "—"}
                    </td>
                    <td className="ppp-align-right ppp-muted">
                      {o.gamesPlayed}
                    </td>
                    <td className="ppp-align-right ppp-score">{o.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Game History */}
      <section className="ppp-card">
        <h2 className="ppp-section-heading">Game History</h2>

        {profile.games.length === 0 ? (
          <p className="ppp-empty">No games recorded yet.</p>
        ) : (
          <div className="ppp-games-list">
            {profile.games.map((g, i) => {
              const outcome = outcomeFor(g);

              return (
                <div
                  key={`${g.round}-${g.opponentId || "bye"}-${i}`}
                  className="ppp-game-row"
                >
                  <div className="ppp-game-info">
                    <span className="ppp-round">Round {g.round}</span>

                    {g.opponentId ? (
                      <span className="ppp-game-opponent">
                        {g.opponentTitle && (
                          <span className="ppp-opponent-title">
                            {g.opponentTitle}
                          </span>
                        )}
                        <Link
                          to={`/results/${token}/player/${g.opponentId}`}
                          className="ppp-player-link"
                        >
                          {g.opponentName}
                        </Link>
                        {g.opponentRating != null && (
                          <span className="ppp-opponent-rating">
                            {" "}
                            ({g.opponentRating})
                          </span>
                        )}
                        <span className="ppp-color">
                          {g.color === "W" ? "as White" : "as Black"}
                        </span>
                      </span>
                    ) : (
                      <span className="ppp-bye">No opponent — bye round</span>
                    )}
                  </div>

                  <span className={`ppp-outcome ${outcome.className}`}>
                    {outcome.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="ppp-footer">Read-only view — shared by the organizer.</p>
    </>,
  );
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`ppp-stat ${highlight ? "ppp-stat-highlight" : ""}`}>
      <span className="ppp-stat-label">{label}</span>
      <span className="ppp-stat-value">{value}</span>
    </div>
  );
}
