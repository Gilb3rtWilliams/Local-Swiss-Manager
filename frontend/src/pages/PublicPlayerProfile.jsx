import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/PublicPlayerProfile.css";

const RESULT_STYLE = {
  win: { label: "WIN", className: "pp-outcome-win" },
  draw: { label: "DRAW", className: "pp-outcome-draw" },
  loss: { label: "LOSS", className: "pp-outcome-loss" },
  bye: { label: "BYE", className: "pp-outcome-bye" },
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
      <div className="pp-shell">
        <div className="pp-topbar">
          <Link to={`/results/${token}`} className="pp-back-link">
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
      <div className="pp-card pp-loading">Loading player profile…</div>,
    );
  }

  if (loadError) {
    return shell(
      <div className="pp-card pp-error-card">
        <p className="pp-error-message">{loadError}</p>
      </div>,
    );
  }

  if (!profile) return null;

  return shell(
    <>
      {/* Header */}
      <header className="pp-card pp-header-card">
        <span className="pp-eyebrow">Player Profile</span>
        <h1 className="pp-player-name">
          {profile.title && (
            <span className="pp-player-title">{profile.title}</span>
          )}
          {profile.name}
        </h1>

        <p className="pp-rating">
          <span>Rating {profile.rating ?? "Unrated"}</span>
          {profile.fideId && (
            <span>
              <a
                href={`https://ratings.fide.com/profile/${profile.fideId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-fide-link"
              >
                FIDE {profile.fideId}
              </a>
            </span>
          )}
          <span>This tournament only</span>
        </p>

        <div className="pp-stats">
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
          <p className="pp-performance-note">
            Performance rating is an estimate from games in this tournament only
            (avg. opponent rating adjusted for score) — not an official FIDE
            norm calculation.
          </p>
        )}
      </header>

      {/* Opponents */}
      <section className="pp-card">
        <h2 className="pp-section-heading">Opponents Faced</h2>

        {profile.opponents.length === 0 ? (
          <p className="pp-empty">No games played yet.</p>
        ) : (
          <div className="pp-table-wrapper">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Opponent</th>
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
      </section>

      {/* Game History */}
      <section className="pp-card">
        <h2 className="pp-section-heading">Game History</h2>

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
                    <span className="pp-round">Round {g.round}</span>

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

                  <span className={`pp-outcome ${outcome.className}`}>
                    {outcome.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="pp-footer">Read-only view — shared by the organizer.</p>
    </>,
  );
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`pp-stat ${highlight ? "pp-stat-highlight" : ""}`}>
      <span className="pp-stat-label">{label}</span>
      <span className="pp-stat-value">{value}</span>
    </div>
  );
}
