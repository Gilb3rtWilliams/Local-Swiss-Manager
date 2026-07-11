import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import PairingsIndividual from "../components/PairingsIndividual.jsx";
import PairingsTeam from "../components/PairingsTeam.jsx";
import StandingsTable from "../components/StandingsTable.jsx";
import TeamStandingsTable from "../components/TeamStandingsTable.jsx";
import CrossTable from "../components/CrossTable.jsx";
import WinnerReveal from "../components/WinnerReveal.jsx";
import RoundHistory from "../components/RoundHistory.jsx";
import "../css/Tournament.css";

const SYSTEM_LABELS = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
};

export default function Tournament() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState({});
  const [lateOpen, setLateOpen] = useState(false);
  const [lateName, setLateName] = useState("");
  const [lateRating, setLateRating] = useState("");
  const [lateTeam, setLateTeam] = useState("");
  const [lateError, setLateError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFederation, setEditFederation] = useState("");
  const [editTimeControl, setEditTimeControl] = useState("");
  const [editVariant, setEditVariant] = useState("");
  const [editTotalRounds, setEditTotalRounds] = useState(1);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [historyRound, setHistoryRound] = useState(null);

  useEffect(() => {
    refresh();
  }, [id]);

  function refresh() {
    api
      .getTournament(id)
      .then((data) => {
        setT(data);
        setResults({});
        setHistoryRound((prev) => {
          if (data.rounds.length === 0) return null;
          if (prev && data.rounds.some((r) => r.round === prev)) return prev;
          return data.rounds[data.rounds.length - 1].round;
        });
      })
      .catch((e) => setError(e.message));
  }

  function openEdit() {
    setEditName(t.name);
    setEditFederation(t.federation || "");
    setEditTimeControl(t.timeControl || "");
    setEditVariant(t.variant || "standard");
    setEditTotalRounds(t.totalRounds);
    setEditError("");
    setEditOpen(true);
  }

  if (error)
    return (
      <div className="container tp-root">
        <div className="banner-error">{error}</div>
      </div>
    );
  if (!t)
    return (
      <div className="container tp-root">
        <p className="muted">Loading…</p>
      </div>
    );

  const isTeam = t.format === "team";
  const isSwiss = t.system === "swiss";
  const systemLabel = SYSTEM_LABELS[t.system] || t.system;

  async function handleGenerateRound() {
    setBusy(true);
    setError("");
    try {
      await api.generateRound(id);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function setIndividualResult(pairIdx, result) {
    setResults((r) => ({ ...r, [pairIdx]: result }));
  }
  function setBoardResult(pairIdx, boardNum, result) {
    setResults((r) => ({ ...r, [`${pairIdx}-${boardNum}`]: result }));
  }

  const activeGames = t.currentPairings
    ? t.currentPairings.filter((p) => p.type !== "bye")
    : [];
  const totalDecisions = isTeam
    ? activeGames.reduce(
        (sum, p) => sum + p.boards.filter((b) => !b.sitOut).length,
        0,
      )
    : activeGames.length;
  const decidedCount = isTeam
    ? activeGames.reduce(
        (sum, p) =>
          sum +
          p.boards.filter((b) => !b.sitOut && results[`${p.idx}-${b.boardNum}`])
            .length,
        0,
      )
    : activeGames.filter((p) => results[p.idx]).length;
  const allSet = totalDecisions === decidedCount;

  async function handleSubmitResults() {
    setBusy(true);
    setError("");
    try {
      const payload = isTeam
        ? Object.entries(results).map(([key, result]) => {
            const [pairIndex, boardNum] = key.split("-").map(Number);
            return { pairIndex, boardNum, result };
          })
        : Object.entries(results).map(([pairIndex, result]) => ({
            pairIndex: Number(pairIndex),
            result,
          }));
      await api.submitResults(id, payload);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddLate(e) {
    e.preventDefault();
    setLateError("");
    if (!lateName.trim()) {
      setLateError("Enter a name.");
      return;
    }
    if (isTeam && !lateTeam) {
      setLateError("Choose a team.");
      return;
    }
    try {
      await api.addLatePlayer(id, {
        name: lateName,
        rating: lateRating,
        teamId: isTeam ? lateTeam : undefined,
      });
      setLateName("");
      setLateRating("");
      refresh();
    } catch (err) {
      setLateError(err.message);
    }
  }

  async function handleExtend() {
    setBusy(true);
    setError("");
    try {
      await api.extendTournament(id);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditError("");
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    setEditBusy(true);
    try {
      const updates = {
        name: editName,
        federation: editFederation,
        timeControl: editTimeControl,
      };
      if (isTeam) updates.variant = editVariant;
      if (t.status !== "finished" && isSwiss)
        updates.totalRounds = Number(editTotalRounds);
      await api.updateTournamentDetails(id, updates);
      setEditOpen(false);
      refresh();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditBusy(false);
    }
  }

  const showTables = t.currentRound > 1 || t.status === "finished";

  return (
    <div className="container tp-root">
      <div className="tp-bg" aria-hidden="true">
        <div className="tp-bg-scene" />
        <div className="tp-bg-scene" />
        <div className="tp-bg-scene" />
      </div>

      <WinnerReveal t={t} />

      <div className="tourney-header-row">
        <div>
          <h1 className="page-title">{t.name}</h1>
          <p className="page-subtitle">
            {t.federation && `${t.federation} · `}
            {t.timeControl && `${t.timeControl} · `}
            {isTeam ? "Team" : "Individual"} tournament
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary btn-sm" onClick={openEdit}>
            ✎ Edit Details
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>
        </div>
      </div>

      {editOpen && (
        <div className="card">
          <div className="section-header">
            <h2>Edit Tournament Details</h2>
          </div>
          <form onSubmit={handleSaveEdit}>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Federation / Club</span>
                <input
                  type="text"
                  value={editFederation}
                  onChange={(e) => setEditFederation(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Time Control</span>
                <input
                  type="text"
                  value={editTimeControl}
                  onChange={(e) => setEditTimeControl(e.target.value)}
                />
              </label>
              {isTeam && (
                <label className="field">
                  <span>Variant</span>
                  <select
                    value={editVariant}
                    onChange={(e) => setEditVariant(e.target.value)}
                  >
                    <option value="league">League (Team A vs Team B)</option>
                    <option value="bughouse">Bughouse</option>
                    <option value="standard">Standard team match</option>
                  </select>
                </label>
              )}
              <label className="field">
                <span>Total Rounds</span>
                <input
                  type="number"
                  min={t.currentRound || 1}
                  value={editTotalRounds}
                  disabled={t.status === "finished" || !isSwiss}
                  onChange={(e) => setEditTotalRounds(e.target.value)}
                />
                {t.status === "finished" && (
                  <span className="hint">
                    Finished — use "Add Extra Round" instead.
                  </span>
                )}
                {t.status !== "finished" && !isSwiss && (
                  <span className="hint">
                    Fixed by the {systemLabel.toLowerCase()} schedule.
                  </span>
                )}
              </label>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 14,
              }}
            >
              <button className="btn-primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              {editError && <span className="inline-error">{editError}</span>}
            </div>
          </form>
        </div>
      )}

      <div className="info-bar">
        <div>
          {isTeam ? "Teams" : "Players"}:{" "}
          <span>{isTeam ? t.teams.length : t.players.length}</span>
        </div>
        <div>
          System: <span>{systemLabel}</span>
        </div>
        <div>
          Total rounds: <span>{t.totalRounds}</span>
        </div>
        <div>
          Current round: <span>{t.currentRound}</span>
        </div>
        <div>
          Status: <span>{t.status}</span>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {t.status === "finished" && (
        <div className="card finished-banner">
          <h2>🏆 Tournament Complete!</h2>
          <p>
            {t.winner
              ? `Congratulations, ${t.winner}!`
              : "Final standings below."}
          </p>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={handleExtend}
          >
            {isSwiss
              ? "+ Add Extra Round (e.g. playoff / tiebreak)"
              : "+ Add Playoff Round"}
          </button>
        </div>
      )}

      {t.status !== "finished" && !t.currentPairings && (
        <div className="card">
          <h2>
            {t.currentRound === 0
              ? "Ready to begin"
              : `Round ${t.currentRound + 1}`}
          </h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {t.currentRound === 0
              ? "Generate Round 1 pairings to start the tournament."
              : "Generate pairings for the next round."}
          </p>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={handleGenerateRound}
          >
            {busy
              ? "Generating…"
              : `Generate ${t.currentRound === 0 ? "Round 1" : `Round ${t.currentRound + 1}`} Pairings`}
          </button>
        </div>
      )}

      {t.currentPairings && (
        <div className="card">
          <div className="section-header">
            <h2>Round {t.currentRound} Pairings</h2>
            <span className="round-badge">
              Round {t.currentRound} / {t.totalRounds}
            </span>
          </div>

          {isTeam ? (
            <PairingsTeam
              pairings={t.currentPairings}
              results={results}
              onSetBoardResult={setBoardResult}
            />
          ) : (
            <PairingsIndividual
              pairings={t.currentPairings}
              results={results}
              onSetResult={setIndividualResult}
            />
          )}

          <div style={{ marginTop: 16 }}>
            <button
              className="btn-primary"
              disabled={!allSet || busy}
              onClick={handleSubmitResults}
            >
              {busy
                ? "Submitting…"
                : t.currentRound === t.totalRounds
                  ? "Finish Tournament"
                  : "Submit & Pair Next Round"}
            </button>
          </div>
        </div>
      )}

      {t.rounds.length > 0 && (
        <div className="card">
          <div className="section-header">
            <h2>Round History</h2>
          </div>
          <div className="round-tabs">
            {t.rounds.map((r) => (
              <button
                type="button"
                key={r.round}
                className={`round-tab ${historyRound === r.round ? "active" : ""}`}
                onClick={() => setHistoryRound(r.round)}
              >
                Round {r.round}
              </button>
            ))}
          </div>
          <RoundHistory
            format={t.format}
            round={t.rounds.find((r) => r.round === historyRound)}
          />
        </div>
      )}

      {t.currentRound <= 1 && t.status !== "finished" && isSwiss && (
        <div className="card" id="late-join-card">
          <div
            className="section-header"
            style={{ cursor: "pointer" }}
            onClick={() => setLateOpen((o) => !o)}
          >
            <h2 style={{ color: "var(--muted)", fontSize: "1rem" }}>
              Late Registration
            </h2>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setLateOpen((o) => !o);
              }}
            >
              {lateOpen ? "− Late Registration" : "+ Late Registration"}
            </button>
          </div>
          {lateOpen && (
            <form onSubmit={handleAddLate}>
              <p
                className="muted"
                style={{ marginBottom: 12, fontSize: "0.88rem" }}
              >
                Add a competitor who missed the start. They receive a BYE (+1)
                if Round 1 is already open, and join from the next round onward.
              </p>
              <div className="player-row" style={{ marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Player name"
                  value={lateName}
                  onChange={(e) => setLateName(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Rating"
                  min="0"
                  max="3500"
                  value={lateRating}
                  onChange={(e) => setLateRating(e.target.value)}
                />
                {isTeam && (
                  <select
                    value={lateTeam}
                    onChange={(e) => setLateTeam(e.target.value)}
                  >
                    <option value="">Choose team…</option>
                    {t.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-secondary">Add Late Joiner</button>
                {lateError && <span className="inline-error">{lateError}</span>}
              </div>
            </form>
          )}
        </div>
      )}

      {t.currentRound <= 1 && t.status !== "finished" && !isSwiss && (
        <div className="card" id="late-join-card">
          <h2 style={{ color: "var(--muted)", fontSize: "1rem" }}>
            Late Registration
          </h2>
          <p className="muted" style={{ fontSize: "0.88rem" }}>
            Not available for {systemLabel} — the schedule is fixed for the full
            field before Round 1 starts.
          </p>
        </div>
      )}

      {showTables && (
        <div className="two-col">
          <div className="card">
            <h2>Standings</h2>
            {isTeam && t.teamStandings ? (
              <TeamStandingsTable teamStandings={t.teamStandings} />
            ) : (
              <StandingsTable standings={t.standings} />
            )}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h2>Cross Table</h2>
            <CrossTable crossTable={t.crossTable} />
          </div>
        </div>
      )}

      {isTeam && t.status !== "setup" && (
        <div className="card">
          <h2>Individual Board Standings</h2>
          <StandingsTable
            standings={t.standings}
            showTiebreaks={false}
            showTeam
          />
        </div>
      )}
    </div>
  );
}
