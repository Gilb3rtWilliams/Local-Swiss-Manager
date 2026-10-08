import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/PlayerProfile.css";

const RESULT_STYLE = {
  win: { label: "WIN", className: "pl-outcome-win" },
  draw: { label: "DRAW", className: "pl-outcome-draw" },
  loss: { label: "LOSS", className: "pl-outcome-loss" },
  bye: { label: "BYE", className: "pl-outcome-bye" },
};

function outcomeFor(game) {
  if (game.result === "bye") return RESULT_STYLE.bye;
  if (game.points === 1) return RESULT_STYLE.win;
  if (game.points === 0.5) return RESULT_STYLE.draw;
  return RESULT_STYLE.loss;
}

export default function PublicPlayerProfile() {
  // Nested under TournamentLayout like every other tournament page, so `t`
  // (and refresh) come from the same outlet context — this page doesn't
  // introduce a new data-fetching pattern for the tournament itself, only
  // for the profile data layered on top of it. The layout also provides the
  // theme, so no theme wiring is needed here.
  const { t } = useOutletContext();
  const { playerId } = useParams();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setProfile(null);
    setLoadError("");
    setLoading(true);

    api
      .getPlayerProfile(t.id, playerId)
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
  }, [t.id, playerId]);

  const shell = (children) => (
    <div className="player-profile">
      <div className="pl-topbar">
        <Link to={`/tournament/${t.id}/standings`} className="pl-back-link">
          ← Back to tournament
        </Link>
      </div>
      {children}
    </div>
  );

  if (loading) {
    return shell(
      <div className="pl-card pl-loading">Loading player profile…</div>,
    );
  }

  if (loadError) {
    return shell(
      <div className="pl-card pl-error-card">
        <p className="pl-error-message">{loadError}</p>
      </div>,
    );
  }

  if (!profile) return null;

  return shell(
    <>
      {/* Header */}
      <header className="pl-card pl-header-card">
        <span className="pl-eyebrow">Player Profile</span>
        <h1 className="pl-player-name">
          {profile.title && (
            <span className="pl-player-title">{profile.title}</span>
          )}
          {profile.name}
        </h1>

        <p className="pl-rating">
          <span>Rating {profile.rating ?? "Unrated"}</span>
          {profile.fideId && (
            <span>
              <a
                href={`https://ratings.fide.com/profile/${profile.fideId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pl-fide-link"
              >
                FIDE {profile.fideId}
              </a>
            </span>
          )}
          <span>This tournament only</span>
        </p>

        <div className="pl-stats">
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
          <p className="pl-performance-note">
            Performance rating is an estimate from games in this tournament only
            (avg. opponent rating adjusted for score) — not an official FIDE
            norm calculation.
          </p>
        )}
      </header>

      {/* Opponents */}
      <section className="pl-card">
        <h2 className="pl-section-heading">Opponents Faced</h2>

        {profile.opponents.length === 0 ? (
          <p className="pl-empty">No games played yet.</p>
        ) : (
          <div className="pl-table-wrapper">
            <table className="pl-table">
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th className="pl-align-right">FIDE ID</th>
                  <th className="pl-align-right">Rating</th>
                  <th className="pl-align-right">Games</th>
                  <th className="pl-align-right">Score</th>
                </tr>
              </thead>

              <tbody>
                {profile.opponents.map((o) => (
                  <tr key={o.opponentId}>
                    <td className="pl-opponent-name">
                      {o.title && (
                        <span className="pl-opponent-title">{o.title}</span>
                      )}
                      <Link
                        to={`/tournament/${t.id}/player/${o.opponentId}`}
                        className="pl-player-link"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="pl-align-right">
                      {o.fideId ? (
                        <a
                          href={`https://ratings.fide.com/profile/${o.fideId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pl-fide-link pl-fide-small"
                        >
                          {o.fideId}
                        </a>
                      ) : (
                        <span className="pl-faint">—</span>
                      )}
                    </td>
                    <td className="pl-align-right pl-muted">
                      {o.rating ?? "—"}
                    </td>
                    <td className="pl-align-right pl-muted">{o.gamesPlayed}</td>
                    <td className="pl-align-right pl-score">{o.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Game History */}
      <section className="pl-card">
        <h2 className="pl-section-heading">Game History</h2>

        {profile.games.length === 0 ? (
          <p className="pl-empty">No games recorded yet.</p>
        ) : (
          <div className="pl-games-list">
            {profile.games.map((g, i) => {
              const outcome = outcomeFor(g);

              return (
                <div
                  key={`${g.round}-${g.opponentId || "bye"}-${i}`}
                  className="pl-game-row"
                >
                  <div className="pl-game-info">
                    <span className="pl-round">Round {g.round}</span>

                    {g.opponentId ? (
                      <span className="pl-game-opponent">
                        {g.opponentTitle && (
                          <span className="pl-opponent-title">
                            {g.opponentTitle}
                          </span>
                        )}
                        <Link
                          to={`/tournament/${t.id}/player/${g.opponentId}`}
                          className="pl-player-link"
                        >
                          {g.opponentName}
                        </Link>
                        {g.opponentRating != null && (
                          <span className="pl-opponent-rating">
                            {" "}
                            ({g.opponentRating})
                          </span>
                        )}
                        {g.opponentFideId && (
                          <a
                            href={`https://ratings.fide.com/profile/${g.opponentFideId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pl-fide-link pl-fide-small pl-game-fide"
                          >
                            FIDE {g.opponentFideId}
                          </a>
                        )}
                        <span className="pl-color">
                          {g.color === "W" ? "as White" : "as Black"}
                        </span>
                      </span>
                    ) : (
                      <span className="pl-bye">No opponent — bye round</span>
                    )}
                  </div>

                  <span className={`pl-outcome ${outcome.className}`}>
                    {outcome.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="pl-footer">Read-only view — shared by the organizer.</p>
    </>,
  );
}

function StatBox({ label, value, highlight = false }) {
  return (
    <div className={`pl-stat ${highlight ? "pl-stat-highlight" : ""}`}>
      <span className="pl-stat-label">{label}</span>
      <span className="pl-stat-value">{value}</span>
    </div>
  );
}
