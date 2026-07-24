import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { FIDE_FEDERATIONS } from "../federations.js";
import "../css/NewTournament.css";

function suggestedRounds(n) {
  if (n < 2) return 1;
  return Math.ceil(Math.log2(n));
}

function roundRobinRounds(n, system) {
  if (n < 2) return 0;
  const single = n % 2 === 0 ? n - 1 : n;
  return system === "double_round_robin" ? single * 2 : single;
}

function eliminationRounds(n, system) {
  if (n < 2) return 0;
  const wbRounds = Math.ceil(Math.log2(n));
  if (system !== "double_elimination") return wbRounds;
  const lbRounds = wbRounds <= 1 ? 0 : 2 * (wbRounds - 1);
  return wbRounds + lbRounds + 1;
}

let uidCounter = 0;
function rowId() {
  return `row-${++uidCounter}`;
}

function emptyPlayer() {
  return { key: rowId(), name: "", rating: "" };
}
function emptyTeam() {
  return { key: rowId(), name: "", players: [emptyPlayer(), emptyPlayer()] };
}

function avgRating(list) {
  const rated = list.filter(
    (p) => p.rating !== "" && !Number.isNaN(Number(p.rating)),
  );
  if (!rated.length) return null;
  return Math.round(
    rated.reduce((s, p) => s + Number(p.rating), 0) / rated.length,
  );
}

// Two-option segmented toggle, styled like the dashboard's filter chips.
function SegmentedToggle({ name, value, onChange, options }) {
  return (
    <div className="nt-toggle">
      {options.map((opt) => (
        <label
          key={String(opt.value)}
          className={value === opt.value ? "checked" : ""}
        >
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default function NewTournament() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [federation, setFederation] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [chiefArbiter, setChiefArbiter] = useState("");
  const [deputyChiefArbiter, setDeputyChiefArbiter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fideRated, setFideRated] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [chess960, setChess960] = useState(false);

  const [format, setFormat] = useState("individual");
  const [variant, setVariant] = useState("standard");
  const [system, setSystem] = useState("swiss");
  const [timeControl, setTimeControl] = useState("");
  const [autoRounds, setAutoRounds] = useState(true);
  const [totalRounds, setTotalRounds] = useState(5);

  const [players, setPlayers] = useState([
    emptyPlayer(),
    emptyPlayer(),
    emptyPlayer(),
    emptyPlayer(),
  ]);
  const [teams, setTeams] = useState([emptyTeam(), emptyTeam()]);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const competitorCount =
    format === "team"
      ? teams.length
      : players.filter((p) => p.name.trim()).length;

  const isRoundRobin =
    system === "round_robin" || system === "double_round_robin";
  const isElimination =
    system === "single_elimination" || system === "double_elimination";
  const isFixedRounds = isRoundRobin || isElimination;

  // Chess960 only hooks into round-by-round pairing generation — brackets
  // are drawn whole at creation, so there's nowhere for a per-round
  // position to attach. Keep the two in sync so a stale "on" value can't
  // ride along if someone toggles Chess960 and then switches systems.
  useEffect(() => {
    if (isElimination && chess960) setChess960(false);
  }, [isElimination, chess960]);

  const rounds = isRoundRobin
    ? roundRobinRounds(Math.max(competitorCount, 2), system)
    : isElimination
      ? eliminationRounds(Math.max(competitorCount, 2), system)
      : autoRounds
        ? suggestedRounds(Math.max(competitorCount, 2))
        : totalRounds;

  function updatePlayer(idx, field, value) {
    setPlayers((ps) =>
      ps.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  }
  function addPlayerRow() {
    setPlayers((ps) => [...ps, emptyPlayer()]);
  }
  function removePlayerRow(idx) {
    setPlayers((ps) => ps.filter((_, i) => i !== idx));
  }

  function updateTeamName(tIdx, value) {
    setTeams((ts) =>
      ts.map((t, i) => (i === tIdx ? { ...t, name: value } : t)),
    );
  }
  function addTeam() {
    setTeams((ts) => [...ts, emptyTeam()]);
  }
  function removeTeam(tIdx) {
    setTeams((ts) => ts.filter((_, i) => i !== tIdx));
  }
  function updateTeamPlayer(tIdx, pIdx, field, value) {
    setTeams((ts) =>
      ts.map((t, i) =>
        i !== tIdx
          ? t
          : {
              ...t,
              players: t.players.map((p, j) =>
                j === pIdx ? { ...p, [field]: value } : p,
              ),
            },
      ),
    );
  }
  function addTeamPlayer(tIdx) {
    setTeams((ts) =>
      ts.map((t, i) =>
        i === tIdx ? { ...t, players: [...t.players, emptyPlayer()] } : t,
      ),
    );
  }
  function removeTeamPlayer(tIdx, pIdx) {
    setTeams((ts) =>
      ts.map((t, i) =>
        i === tIdx
          ? { ...t, players: t.players.filter((_, j) => j !== pIdx) }
          : t,
      ),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Tournament name is required.");
      return;
    }

    const payload = {
      name,
      federation,
      organizerName,
      chiefArbiter,
      deputyChiefArbiter,
      dateFrom,
      dateTo,
      fideRated,
      isTest,
      chess960,
      format,
      variant,
      system,
      timeControl,
      totalRounds:
        isFixedRounds || autoRounds ? undefined : Number(totalRounds),
    };

    if (format === "team") {
      const cleanTeams = teams
        .map((t) => ({
          name: t.name.trim(),
          players: t.players
            .filter((p) => p.name.trim())
            .map((p) => ({ name: p.name.trim(), rating: p.rating })),
        }))
        .filter((t) => t.name);
      if (cleanTeams.length < 2) {
        setError("Add at least 2 teams (with names).");
        return;
      }
      if (cleanTeams.some((t) => t.players.length === 0)) {
        setError("Every team needs at least 1 player.");
        return;
      }
      payload.teams = cleanTeams;
    } else {
      const cleanPlayers = players
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), rating: p.rating }));
      if (cleanPlayers.length < 2) {
        setError("Add at least 2 players.");
        return;
      }
      payload.players = cleanPlayers;
    }

    setSubmitting(true);
    try {
      const t = await api.createTournament(payload);
      navigate(
        isElimination ? `/tournament/${t.id}/module` : `/tournament/${t.id}`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="nt-root">
      <div className="nt-bg" aria-hidden="true">
        <div className="nt-bg-scene" />
        <div className="nt-bg-scene" />
        <div className="nt-bg-scene" />
      </div>

      <div className="container">
        <h1 className="page-title">New Tournament</h1>
        <p className="page-subtitle">
          Set the details, add competitors, and generate Round 1.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="card nt-card">
            <h2>Tournament Details</h2>

            <div className="nt-panels">
              <div className="nt-panel">
                <div className="nt-panel-label">Basics</div>
                <div className="form-grid">
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nyeri Spring Open"
                    />
                  </label>
                  <label className="field">
                    <span>Federation</span>
                    <select
                      value={federation}
                      onChange={(e) => setFederation(e.target.value)}
                    >
                      <option value="">— Select federation —</option>
                      {FIDE_FEDERATIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Time Control</span>
                    <input
                      type="text"
                      value={timeControl}
                      onChange={(e) => setTimeControl(e.target.value)}
                      placeholder="90+30"
                    />
                  </label>
                </div>
              </div>

              <div className="nt-panel">
                <div className="nt-panel-label">Officials</div>
                <div className="form-grid">
                  <label className="field">
                    <span>Organizer</span>
                    <input
                      type="text"
                      value={organizerName}
                      onChange={(e) => setOrganizerName(e.target.value)}
                      placeholder="Gilbert Williams"
                    />
                  </label>
                  <label className="field">
                    <span>Chief Arbiter</span>
                    <input
                      type="text"
                      value={chiefArbiter}
                      onChange={(e) => setChiefArbiter(e.target.value)}
                      placeholder="FA / IA name"
                    />
                  </label>
                  <label className="field">
                    <span>Deputy Chief Arbiter</span>
                    <input
                      type="text"
                      value={deputyChiefArbiter}
                      onChange={(e) => setDeputyChiefArbiter(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>

              <div className="nt-panel">
                <div className="nt-panel-label">Schedule &amp; Status</div>
                <div className="form-grid">
                  <label className="field">
                    <span>Date From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Date To</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>FIDE Rated</span>
                    <SegmentedToggle
                      name="fideRated"
                      value={fideRated}
                      onChange={setFideRated}
                      options={[
                        { value: true, label: "Yes" },
                        { value: false, label: "No" },
                      ]}
                    />
                  </label>
                  <label className="field">
                    <span>Tournament Type</span>
                    <SegmentedToggle
                      name="isTest"
                      value={isTest}
                      onChange={setIsTest}
                      options={[
                        { value: false, label: "Real" },
                        { value: true, label: "Test" },
                      ]}
                    />
                  </label>
                </div>
              </div>

              <div className="nt-panel">
                <div className="nt-panel-label">Format &amp; System</div>
                <div className="form-grid">
                  <label className="field">
                    <span>Format</span>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                    >
                      <option value="individual">Individual</option>
                      <option value="team">
                        Team (league, bughouse, etc.)
                      </option>
                    </select>
                  </label>
                  {format === "team" && (
                    <label className="field">
                      <span>Variant</span>
                      <select
                        value={variant}
                        onChange={(e) => setVariant(e.target.value)}
                      >
                        <option value="league">
                          League (Team A vs Team B)
                        </option>
                        <option value="bughouse">Bughouse</option>
                        <option value="standard">Standard team match</option>
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span>System</span>
                    <select
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                    >
                      <option value="swiss">Swiss</option>
                      <option value="round_robin">Round Robin</option>
                      <option value="double_round_robin">
                        Double Round Robin
                      </option>
                      <option value="single_elimination">
                        Single Elimination
                      </option>
                      <option value="double_elimination">
                        Double Elimination
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Rounds</span>
                    <div className="rounds-row">
                      <input
                        type="number"
                        min="1"
                        value={rounds}
                        disabled={autoRounds || isFixedRounds}
                        onChange={(e) => setTotalRounds(e.target.value)}
                      />
                      {!isFixedRounds && (
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            checked={autoRounds}
                            onChange={(e) => setAutoRounds(e.target.checked)}
                          />
                          Auto
                        </label>
                      )}
                    </div>
                  </label>
                  {!isElimination && (
                    <label className="field">
                      <span>Chess960 (Fischer Random)</span>
                      <SegmentedToggle
                        name="chess960"
                        value={chess960}
                        onChange={setChess960}
                        options={[
                          { value: false, label: "Off" },
                          { value: true, label: "On" },
                        ]}
                      />
                    </label>
                  )}
                </div>
                <p className="hint" style={{ marginTop: 10 }}>
                  {isRoundRobin &&
                    `Every competitor faces every other competitor${
                      system === "double_round_robin"
                        ? ", twice (once per color)."
                        : "."
                    }`}
                  {system === "swiss" &&
                    "Pairings adapt each round based on standings."}
                  {system === "single_elimination" &&
                    "Single loss and you're out. The full bracket is drawn as soon as you create the tournament."}
                  {system === "double_elimination" &&
                    "Lose once and you drop to the losers bracket; lose twice and you're out — unless you beat the winners-bracket champion in the Grand Final, which triggers a bracket reset."}
                  {chess960 &&
                    " A new random Chess960 starting position is drawn each round — check the Chess960 tab before boards start."}
                </p>
              </div>
            </div>
          </div>

          {format === "individual" ? (
            <div className="card nt-card nt-roster-card">
              <div className="nt-section-head">
                <h2>Players</h2>
                <span className="nt-count-badge">
                  {players.filter((p) => p.name.trim()).length} added
                </span>
              </div>

              <div className="nt-roster-legend">
                <span />
                <span>Name</span>
                <span>Rating</span>
                <span />
              </div>

              <div className="nt-roster-list">
                {players.map((p, idx) => (
                  <div className="nt-roster-row" key={p.key}>
                    <span className="nt-roster-idx">{idx + 1}</span>
                    <input
                      type="text"
                      className="nt-roster-name"
                      placeholder="Player name"
                      value={p.name}
                      onChange={(e) =>
                        updatePlayer(idx, "name", e.target.value)
                      }
                    />
                    <input
                      type="number"
                      className="nt-roster-rating"
                      placeholder="—"
                      min="0"
                      max="3500"
                      value={p.rating}
                      onChange={(e) =>
                        updatePlayer(idx, "rating", e.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="nt-row-remove"
                      onClick={() => removePlayerRow(idx)}
                      title="Remove"
                      aria-label={`Remove player ${idx + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="nt-add-row"
                  onClick={addPlayerRow}
                >
                  <span className="nt-add-row-icon">+</span> Add Player
                </button>
              </div>

              {avgRating(players) !== null && (
                <p className="nt-roster-summary">
                  Average rating: {avgRating(players)}
                </p>
              )}
            </div>
          ) : (
            <div className="card nt-card nt-roster-card">
              <div className="nt-section-head">
                <h2>Teams</h2>
                <span className="nt-count-badge">{teams.length} teams</span>
              </div>

              <div className="nt-team-list">
                {teams.map((t, tIdx) => (
                  <div className="nt-team-block" key={t.key}>
                    <div className="nt-team-block-header">
                      <span className="nt-roster-idx nt-team-idx">
                        {tIdx + 1}
                      </span>
                      <input
                        type="text"
                        className="nt-team-name-input"
                        placeholder={`Team ${tIdx + 1} name`}
                        value={t.name}
                        onChange={(e) => updateTeamName(tIdx, e.target.value)}
                      />
                      {avgRating(t.players) !== null && (
                        <span className="nt-team-avg">
                          Avg {avgRating(t.players)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="nt-row-remove"
                        onClick={() => removeTeam(tIdx)}
                        aria-label={`Remove team ${tIdx + 1}`}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="nt-roster-legend nt-roster-legend-nested">
                      <span />
                      <span>Name</span>
                      <span>Rating</span>
                      <span />
                    </div>

                    <div className="nt-roster-list nt-roster-list-nested">
                      {t.players.map((p, pIdx) => (
                        <div className="nt-roster-row" key={p.key}>
                          <span className="nt-roster-idx">{pIdx + 1}</span>
                          <input
                            type="text"
                            className="nt-roster-name"
                            placeholder="Player name"
                            value={p.name}
                            onChange={(e) =>
                              updateTeamPlayer(
                                tIdx,
                                pIdx,
                                "name",
                                e.target.value,
                              )
                            }
                          />
                          <input
                            type="number"
                            className="nt-roster-rating"
                            placeholder="—"
                            min="0"
                            max="3500"
                            value={p.rating}
                            onChange={(e) =>
                              updateTeamPlayer(
                                tIdx,
                                pIdx,
                                "rating",
                                e.target.value,
                              )
                            }
                          />
                          <button
                            type="button"
                            className="nt-row-remove"
                            onClick={() => removeTeamPlayer(tIdx, pIdx)}
                            title="Remove"
                            aria-label={`Remove player ${pIdx + 1} from team ${tIdx + 1}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="nt-add-row nt-add-row-nested"
                        onClick={() => addTeamPlayer(tIdx)}
                      >
                        <span className="nt-add-row-icon">+</span> Add Player to{" "}
                        {t.name || `Team ${tIdx + 1}`}
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="nt-add-row nt-add-team-row"
                  onClick={addTeam}
                >
                  <span className="nt-add-row-icon">+</span> Add Team
                </button>
              </div>
            </div>
          )}

          <div className="card nt-card nt-submit-card">
            <button className="btn-primary" disabled={submitting}>
              {submitting
                ? "Creating…"
                : isElimination
                  ? "Done — Draw Bracket"
                  : "Done — Generate Round 1"}
            </button>
            {error && <span className="inline-error">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
