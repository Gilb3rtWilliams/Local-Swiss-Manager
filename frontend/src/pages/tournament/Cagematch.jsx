import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";
import MoveEntryBoard from "../../components/MoveEntryBoard.jsx";
import "../../css/CageMatch.css";

const RESULT_OPTIONS = [
  { value: "", label: "—" },
  { value: "1-0", label: "1–0 (White wins)" },
  { value: "0-1", label: "0–1 (Black wins)" },
  { value: "1/2-1/2", label: "½–½ (Draw)" },
  { value: "1F-0F", label: "1F–0F (Black forfeits)" },
  { value: "0F-1F", label: "0F–1F (White forfeits)" },
  { value: "0F-0F", label: "0F–0F (Double forfeit)" },
];

function resultLabel(result) {
  const opt = RESULT_OPTIONS.find((o) => o.value === result);
  return opt ? opt.label : result;
}

// Shared result dropdown used for section games, mini-match games, and the
// Armageddon result — picking a value sets the result immediately, picking
// "—" clears it (only allowed where `allowClear` is true, since mini-match/
// Armageddon results aren't meant to be un-set once the next stage may
// already depend on them).
function ResultPicker({ value, onSet, onClear, disabled, allowClear = true }) {
  return (
    <select
      value={value || ""}
      disabled={disabled}
      onChange={(e) => {
        const val = e.target.value;
        if (!val) {
          if (allowClear) onClear();
        } else {
          onSet(val);
        }
      }}
    >
      {RESULT_OPTIONS.filter((o) => allowClear || o.value).map((o) => (
        <option key={o.value || "none"} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Avatar({ competitor, onFileSelected, uploading }) {
  return (
    <div className={`cm-avatar-wrap ${uploading ? "uploading" : ""}`}>
      {competitor.pictureUrl ? (
        <img className="cm-avatar" src={competitor.pictureUrl} alt="" />
      ) : (
        <div className="cm-avatar cm-avatar-placeholder">🎓</div>
      )}
      <label className="cm-avatar-edit-label">
        {uploading ? "…" : "Change"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="cm-avatar-edit-input"
          disabled={uploading}
          onChange={(e) => onFileSelected(e.target.files && e.target.files[0])}
        />
      </label>
    </div>
  );
}

function GameRow({
  game,
  isOpen,
  onToggleBoard,
  onSetResult,
  onClearResult,
  onMove,
  onUndo,
  busy,
}) {
  return (
    <div className="cm-game-row-wrap">
      <div className="cm-game-row">
        <span className="cm-game-num">#{game.gameNum}</span>
        <span className="cm-game-players">
          {game.whiteName} <span className="cm-vs-tiny">vs</span>{" "}
          {game.blackName}
        </span>
        <span className={`cm-game-status cm-status-${game.status}`}>
          {game.result
            ? resultLabel(game.result)
            : game.status === "in_progress"
            ? "In progress"
            : "Pending"}
        </span>
        <ResultPicker
          value={game.result}
          disabled={busy}
          onSet={onSetResult}
          onClear={onClearResult}
        />
        <button
          type="button"
          className="cm-toggle-board"
          onClick={onToggleBoard}
        >
          {isOpen ? "Hide Board" : "Open Board"}
        </button>
      </div>

      {isOpen && (
        <div className="cm-board-panel">
          <MoveEntryBoard
            game={game}
            disabled={busy}
            onMove={onMove}
            onUndo={game.moves.length ? onUndo : null}
          />
          {game.suggestedResult && game.status !== "complete" && (
            <div className="cm-suggested-result">
              <span>
                Board shows {game.boardStatus.kind.replace(/_/g, " ")} — confirm
                result?
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => onSetResult(game.suggestedResult)}
              >
                Confirm {game.suggestedResult}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArmageddonPanel({ armageddon, busy, onBid, onResult }) {
  const [bidA, setBidA] = useState("");
  const [bidB, setBidB] = useState("");

  if (
    armageddon.status === "awaiting_bids" ||
    armageddon.status === "bid_tie"
  ) {
    return (
      <div className="cm-armageddon-panel">
        <h4>Armageddon — Collect Bids</h4>
        {armageddon.status === "bid_tie" && (
          <p className="cm-armageddon-tie">
            That pair of bids came out tied — ask both players for a fresh bid.
          </p>
        )}
        <p className="cm-hint">
          Ask each player privately how many seconds they'd accept playing Black
          for. Enter both below — the lower bid gets Black with draw odds; the
          higher bid gets White.
        </p>
        <div className="cm-armageddon-bids">
          <label>
            <span>Competitor A bid (seconds)</span>
            <input
              type="number"
              min="1"
              value={bidA}
              onChange={(e) => setBidA(e.target.value)}
            />
          </label>
          <label>
            <span>Competitor B bid (seconds)</span>
            <input
              type="number"
              min="1"
              value={bidB}
              onChange={(e) => setBidB(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !bidA || !bidB}
            onClick={() => onBid(Number(bidA), Number(bidB))}
          >
            Reveal
          </button>
        </div>
      </div>
    );
  }

  if (armageddon.status === "awaiting_result") {
    return (
      <div className="cm-armageddon-panel">
        <h4>Armageddon</h4>
        <p className="cm-armageddon-reveal">
          <strong>{armageddon.whiteName}</strong> plays White (bid{" "}
          {armageddon.bidA < armageddon.bidB
            ? armageddon.bidB
            : armageddon.bidA}
          s) · <strong>{armageddon.blackName}</strong> plays Black with draw
          odds (bid{" "}
          {armageddon.bidA < armageddon.bidB
            ? armageddon.bidA
            : armageddon.bidB}
          s)
        </p>
        <div className="cm-armageddon-result-row">
          <span>Result:</span>
          <ResultPicker
            value={armageddon.result}
            disabled={busy}
            allowClear={false}
            onSet={onResult}
            onClear={() => {}}
          />
        </div>
      </div>
    );
  }

  // complete
  return (
    <div className="cm-armageddon-panel">
      <h4>Armageddon — Recorded</h4>
      <p>
        {armageddon.whiteName} (White) vs {armageddon.blackName} (Black):{" "}
        {resultLabel(armageddon.result)}
      </p>
    </div>
  );
}

export default function CageMatch() {
  const { t, refresh } = useOutletContext();
  const { id } = useParams();
  const cm = t.cageMatch;

  const [openGameKey, setOpenGameKey] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingSide, setUploadingSide] = useState(null);

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarChange(side, file) {
    if (!file) return;
    setUploadingSide(side);
    setError("");
    try {
      const { url } = await api.uploadImage(file);
      await api.setCageMatchCompetitorPicture(id, side, url);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingSide(null);
    }
  }

  function toggleBoard(key) {
    setOpenGameKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="cm-root">
      <div className="cm-scoreboard">
        <div className="cm-competitor">
          <Avatar
            competitor={cm.competitors.A}
            uploading={uploadingSide === "A"}
            onFileSelected={(f) => handleAvatarChange("A", f)}
          />
          <span className="cm-competitor-name">{cm.competitors.A.name}</span>
        </div>
        <div className="cm-score">
          <span className="cm-score-num">{cm.score.A}</span>
          <span className="cm-score-sep">–</span>
          <span className="cm-score-num">{cm.score.B}</span>
        </div>
        <div className="cm-competitor">
          <Avatar
            competitor={cm.competitors.B}
            uploading={uploadingSide === "B"}
            onFileSelected={(f) => handleAvatarChange("B", f)}
          />
          <span className="cm-competitor-name">{cm.competitors.B.name}</span>
        </div>
      </div>

      {error && <p className="cm-error">{error}</p>}

      {cm.status === "finished" && (
        <div className="cm-winner-banner">
          🏆 {cm.winnerName} wins the match!
        </div>
      )}

      {cm.tieAlert && !cm.tiebreak && (
        <div className="cm-tie-banner">
          <span>
            Scores are level at {cm.tieAlert.scoreA}–{cm.tieAlert.scoreB} across
            every section. Start the tiebreak mini-match?
          </span>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => run(() => api.startCageMatchTiebreak(id))}
          >
            Start Tiebreak
          </button>
        </div>
      )}

      {cm.sections.map((section) => (
        <div className="cm-section-card" key={section.id}>
          <div className="cm-section-head">
            <h3>{section.label}</h3>
            <span className="cm-section-meta">
              {section.variant === "chess960" ? "Chess960" : "Standard"}
              {section.timeControl ? ` · ${section.timeControl}` : ""}
            </span>
          </div>

          <div className="cm-game-list">
            {section.games.map((game) => {
              const key = `${section.id}:${game.id}`;
              return (
                <GameRow
                  key={game.id}
                  game={game}
                  busy={busy}
                  isOpen={openGameKey === key}
                  onToggleBoard={() => toggleBoard(key)}
                  onSetResult={(result) =>
                    run(() =>
                      api.setCageMatchGameResult(
                        id,
                        section.id,
                        game.id,
                        result,
                      ),
                    )
                  }
                  onClearResult={() =>
                    run(() =>
                      api.clearCageMatchGameResult(id, section.id, game.id),
                    )
                  }
                  onMove={(move) =>
                    run(() =>
                      api.recordCageMatchMove(id, section.id, game.id, move),
                    )
                  }
                  onUndo={() =>
                    run(() => api.undoCageMatchMove(id, section.id, game.id))
                  }
                />
              );
            })}
          </div>
        </div>
      ))}

      {cm.tiebreak && (
        <div className="cm-section-card cm-tiebreak-card">
          <div className="cm-section-head">
            <h3>Tiebreak — Mini-Match (first to 2.5)</h3>
            <span className="cm-section-meta">
              {cm.tiebreak.miniMatch.score.A} – {cm.tiebreak.miniMatch.score.B}
            </span>
          </div>

          <div className="cm-game-list">
            {cm.tiebreak.miniMatch.games.map((game) => (
              <div className="cm-game-row" key={game.id}>
                <span className="cm-game-num">#{game.gameNum}</span>
                <span className="cm-game-players">
                  {game.whiteName} <span className="cm-vs-tiny">vs</span>{" "}
                  {game.blackName}
                </span>
                <span className={`cm-game-status cm-status-${game.status}`}>
                  {game.result ? resultLabel(game.result) : "Pending"}
                </span>
                <ResultPicker
                  value={game.result}
                  disabled={busy || !!game.result}
                  allowClear={false}
                  onSet={(result) =>
                    run(() =>
                      api.recordCageMatchTiebreakResult(id, game.id, result),
                    )
                  }
                  onClear={() => {}}
                />
              </div>
            ))}
          </div>
          <p className="cm-hint" style={{ margin: "6px 2px 0" }}>
            Manual move entry isn't available for tiebreak games yet — record
            the final result directly once each game is decided.
          </p>

          {cm.tiebreak.status === "armageddon" && cm.tiebreak.armageddon && (
            <ArmageddonPanel
              armageddon={cm.tiebreak.armageddon}
              busy={busy}
              onBid={(a, b) =>
                run(() => api.recordCageMatchArmageddonBids(id, a, b))
              }
              onResult={(r) =>
                run(() => api.recordCageMatchArmageddonResult(id, r))
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
