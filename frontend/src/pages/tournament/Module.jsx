import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import BracketCanvas from "../../components/BracketCanvas.jsx";
import "../../css/Bracket.css";

const DRAW_VALUE = "1/2-1/2";

function IndividualScoreForm({ match, onSubmit, busy, error }) {
  return (
    <div>
      <p className="bx-modal-hint">Who won this match?</p>
      <div className="bx-modal-buttons">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => onSubmit({ winner: "A" })}
        >
          {match.competitorA.name} wins
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => onSubmit({ winner: "B" })}
        >
          {match.competitorB.name} wins
        </button>
      </div>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}

function TeamScoreForm({ match, onSubmit, busy, error }) {
  const activeBoards = match.boards.filter((b) => !b.sitOut);
  const [results, setResults] = useState(() =>
    Object.fromEntries(activeBoards.map((b) => [b.boardNum, b.result || ""])),
  );
  const [winnerOverride, setWinnerOverride] = useState("");

  function setResult(boardNum, value) {
    setResults((r) => ({ ...r, [boardNum]: value }));
  }

  const allFilled = activeBoards.every((b) => results[b.boardNum]);
  let aPoints = 0,
    bPoints = 0;
  if (allFilled) {
    activeBoards.forEach((b) => {
      const r = results[b.boardNum];
      const wScore = r === "1-0" ? 1 : r === "0-1" ? 0 : 0.5;
      const bScore = r === "0-1" ? 1 : r === "1-0" ? 0 : 0.5;
      if (
        b.white.teamId &&
        match.competitorA &&
        b.white.teamId === match.competitorA.id
      ) {
        aPoints += wScore;
        bPoints += bScore;
      } else {
        aPoints += bScore;
        bPoints += wScore;
      }
    });
  }
  const tied = allFilled && aPoints === bPoints;

  function handleSubmit() {
    const boards = activeBoards.map((b) => ({
      boardNum: b.boardNum,
      result: results[b.boardNum],
    }));
    const payload = { boards };
    if (tied) {
      if (winnerOverride !== "A" && winnerOverride !== "B") return;
      payload.winnerOverride = winnerOverride;
    }
    onSubmit(payload);
  }

  return (
    <div>
      <table className="bx-board-table">
        <thead>
          <tr>
            <th>Bd</th>
            <th>White</th>
            <th></th>
            <th>Black</th>
          </tr>
        </thead>
        <tbody>
          {match.boards.map((b) => (
            <tr key={b.boardNum}>
              <td>{b.boardNum}</td>
              {b.sitOut ? (
                <td colSpan={3} className="muted">
                  {(b.white || b.black)?.name} sits out this board
                </td>
              ) : (
                <>
                  <td>{b.white.name}</td>
                  <td>
                    <select
                      value={results[b.boardNum] || ""}
                      onChange={(e) => setResult(b.boardNum, e.target.value)}
                    >
                      <option value="">–</option>
                      <option value="1-0">1 – 0</option>
                      <option value={DRAW_VALUE}>½ – ½</option>
                      <option value="0-1">0 – 1</option>
                    </select>
                  </td>
                  <td>{b.black.name}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {allFilled && (
        <p className="muted" style={{ margin: "10px 0" }}>
          Score: {match.competitorA.name} {aPoints} – {bPoints}{" "}
          {match.competitorB.name}
        </p>
      )}

      {tied && (
        <div className="bx-tiebreak">
          <p
            className="inline-error"
            style={{ display: "block", marginBottom: 6 }}
          >
            Boards are tied — pick who advances.
          </p>
          <label className="checkbox-inline">
            <input
              type="radio"
              name={`override-${match.id}`}
              checked={winnerOverride === "A"}
              onChange={() => setWinnerOverride("A")}
            />
            {match.competitorA.name}
          </label>
          <label className="checkbox-inline" style={{ marginLeft: 12 }}>
            <input
              type="radio"
              name={`override-${match.id}`}
              checked={winnerOverride === "B"}
              onChange={() => setWinnerOverride("B")}
            />
            {match.competitorB.name}
          </label>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !allFilled || (tied && !winnerOverride)}
          onClick={handleSubmit}
        >
          {busy ? "Saving…" : "Submit Result"}
        </button>
        {error && (
          <span className="inline-error" style={{ marginLeft: 10 }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function ScoreModal({ match, format, onClose, onSubmit, busy, error }) {
  if (!match) return null;
  return (
    <div className="bx-modal-backdrop" onClick={onClose}>
      <div className="bx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bx-modal-header">
          <div>
            <div className="bx-modal-title">
              {match.competitorA.name} <span className="muted">vs</span>{" "}
              {match.competitorB.name}
            </div>
            <div className="bx-modal-subtitle">
              {match.bracket === "W"
                ? "Winners"
                : match.bracket === "L"
                  ? "Losers"
                  : "Grand Final"}{" "}
              · Round {match.round}
            </div>
          </div>
          <button
            type="button"
            className="bx-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {format === "team" ? (
          <TeamScoreForm
            match={match}
            onSubmit={onSubmit}
            busy={busy}
            error={error}
          />
        ) : (
          <IndividualScoreForm
            match={match}
            onSubmit={onSubmit}
            busy={busy}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Module() {
  const { t, refresh } = useOutletContext();
  const b = t.bracket;

  const [openMatchId, setOpenMatchId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!b) {
    return (
      <div className="card">
        <p className="muted">This tournament doesn't use a bracket.</p>
      </div>
    );
  }

  const isDouble = t.system === "double_elimination";
  const openMatch = openMatchId
    ? b.matches.find((m) => m.id === openMatchId)
    : null;

  function openMatchModal(m) {
    setOpenMatchId(m.id);
    setError("");
  }
  function closeModal() {
    setOpenMatchId(null);
    setError("");
  }

  async function handleSubmit(payload) {
    setBusy(true);
    setError("");
    try {
      await api.submitBracketResult(t.id, openMatchId, payload);
      setOpenMatchId(null);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bx-page">
      {b.champion && (
        <div className="bx-champion-banner">
          <span className="bx-champion-icon">🏆</span>
          <div>
            <p className="bx-champion-eyebrow">Tournament Champion</p>
            <h2>{b.champion.name}</h2>
          </div>
        </div>
      )}

      <BracketCanvas
        bracket={b}
        isDouble={isDouble}
        format={t.format}
        onOpenMatch={openMatchModal}
      />

      <ScoreModal
        match={openMatch}
        format={t.format}
        onClose={closeModal}
        onSubmit={handleSubmit}
        busy={busy}
        error={error}
      />
    </div>
  );
}
