import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import "../css/Register.css";

const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
};

let uidCounter = 0;
function rowId() {
  return `p-${++uidCounter}`;
}
function emptyPlayer() {
  return { key: rowId(), name: "", rating: "" };
}

export default function Register() {
  const { token } = useParams();

  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [rating, setRating] = useState("");
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([emptyPlayer(), emptyPlayer()]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    api
      .getPublicRegistration(token)
      .then(setInfo)
      .catch((e) => setLoadError(e.message));
  }, [token]);

  const isTeam = info?.format === "team";
  const isBughouse = info?.variant === "bughouse";

  function updatePlayer(idx, field, value) {
    setPlayers((ps) =>
      ps.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  }
  function addPlayer() {
    setPlayers((ps) => [...ps, emptyPlayer()]);
  }
  function removePlayer(idx) {
    setPlayers((ps) => ps.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    let payload;
    if (isTeam) {
      if (!teamName.trim()) {
        setSubmitError("Team name is required.");
        return;
      }
      const cleanPlayers = players
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), rating: p.rating }));
      if (cleanPlayers.length === 0) {
        setSubmitError("Add at least 1 player.");
        return;
      }
      if (isBughouse && cleanPlayers.length !== 2) {
        setSubmitError("Bughouse requires exactly 2 players per team.");
        return;
      }
      payload = { teamName, players: cleanPlayers };
    } else {
      if (!name.trim()) {
        setSubmitError("Name is required.");
        return;
      }
      payload = { name, rating };
    }

    setSubmitting(true);
    try {
      const result = await api.submitPublicRegistration(token, payload);
      setSuccess(result);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="reg-root">
      <div className="reg-bg" aria-hidden="true">
        <div className="reg-bg-scene" />
        <div className="reg-bg-scene" />
        <div className="reg-bg-scene" />
      </div>

      <div className="reg-card">
        {loadError && (
          <div className="reg-closed">
            <h2>Link not found</h2>
            <p>{loadError}</p>
          </div>
        )}

        {!loadError && !info && <p className="reg-meta">Loading…</p>}

        {info && !info.registrationOpen && !success && (
          <div className="reg-closed">
            <span className="reg-eyebrow">{info.name}</span>
            <h2>Registration is closed</h2>
            <p>This tournament isn't accepting self-registration right now.</p>
          </div>
        )}

        {info && info.registrationOpen && success && (
          <div className="reg-success">
            <div className="reg-success-icon">♟️</div>
            <h2>You're registered!</h2>
            <p>
              {isTeam
                ? `"${success.teamName}" is on the list for ${info.name}.`
                : `${success.name} is on the list for ${info.name}.`}
            </p>
          </div>
        )}

        {info && info.registrationOpen && !success && (
          <>
            <span className="reg-eyebrow">
              {SYSTEM_LABEL[info.system] || info.system}
              {info.fideRated ? " · FIDE Rated" : ""}
            </span>
            <h1 className="reg-title">{info.name}</h1>
            <p className="reg-meta">
              {info.federation && <span>{info.federation}</span>}
              {info.timeControl && <span>{info.timeControl}</span>}
              {info.dateFrom && (
                <span>
                  {info.dateFrom}
                  {info.dateTo && info.dateTo !== info.dateFrom
                    ? ` – ${info.dateTo}`
                    : ""}
                </span>
              )}
              <span>{info.competitorCount} registered so far</span>
            </p>

            <form onSubmit={handleSubmit}>
              {isTeam ? (
                <>
                  <label className="reg-field">
                    <span>Team Name</span>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Nyeri Knights"
                    />
                  </label>

                  <label className="reg-field">
                    <span>Players{isBughouse ? " (exactly 2)" : ""}</span>
                  </label>
                  {players.map((p, idx) => (
                    <div className="reg-player-row" key={p.key}>
                      <input
                        type="text"
                        placeholder="Player name"
                        value={p.name}
                        onChange={(e) =>
                          updatePlayer(idx, "name", e.target.value)
                        }
                      />
                      <input
                        type="number"
                        placeholder="Rating"
                        min="0"
                        max="3500"
                        value={p.rating}
                        onChange={(e) =>
                          updatePlayer(idx, "rating", e.target.value)
                        }
                      />
                      {(!isBughouse || players.length > 2) && (
                        <button
                          type="button"
                          className="reg-player-remove"
                          onClick={() => removePlayer(idx)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {!isBughouse && (
                    <button
                      type="button"
                      className="reg-add-player"
                      onClick={addPlayer}
                    >
                      + Add Player
                    </button>
                  )}
                </>
              ) : (
                <>
                  <label className="reg-field">
                    <span>Your Name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Wanjiku"
                    />
                  </label>
                  <label className="reg-field">
                    <span>Rating (optional)</span>
                    <input
                      type="number"
                      min="0"
                      max="3500"
                      value={rating}
                      onChange={(e) => setRating(e.target.value)}
                      placeholder="e.g. 1450"
                    />
                  </label>
                </>
              )}

              {submitError && <div className="reg-error">{submitError}</div>}

              <button className="reg-submit" disabled={submitting}>
                {submitting ? "Registering…" : "Register"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
