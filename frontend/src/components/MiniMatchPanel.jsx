import { useState } from "react";
import { api } from "../api.js";
import MoveEntryBoard from "./MoveEntryBoard.jsx";
import { DEFAULT_BOARD_THEME, DEFAULT_PIECE_THEME } from "./chessThemes.js";

// Same result-code vocabulary Cage Match and the classical Pairings result
// buttons already use — kept local rather than shared, same convention as
// everywhere else in this app that touches result codes.
const RESULT_OPTIONS = [
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

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
    overflowY: "auto",
  },
  panel: {
    background: "#13131a",
    border: "1px solid #252532",
    borderRadius: 14,
    maxWidth: 760,
    width: "100%",
    maxHeight: "88vh",
    overflowY: "auto",
    padding: 24,
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
    color: "#e8e8e8",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderBottom: "1px solid #252532",
    paddingBottom: 12,
    gap: 12,
  },
  title: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "0.03em" },
  closeBtn: {
    background: "none",
    border: "1px solid #353545",
    color: "#8a8a9a",
    borderRadius: 6,
    width: 28,
    height: 28,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
    flexShrink: 0,
  },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    fontSize: 14,
    fontWeight: 600,
  },
  scoreNums: { fontSize: 22, fontWeight: 800, color: "#d4a853" },
  decidedBanner: {
    background: "rgba(212, 168, 83, 0.12)",
    border: "1px solid rgba(212, 168, 83, 0.4)",
    color: "#d4a853",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 14,
    fontWeight: 700,
    textAlign: "center",
  },
  tieBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    background: "rgba(244, 67, 54, 0.08)",
    border: "1px solid rgba(244, 67, 54, 0.35)",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 14,
    fontSize: 13,
  },
  gamesList: { display: "flex", flexDirection: "column" },
  rowWrap: { borderBottom: "1px solid #252532", padding: "10px 2px" },
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  num: { color: "#8a8a9a", fontSize: 12, minWidth: 22 },
  players: { flex: 1, fontSize: 13, minWidth: 140 },
  vs: {
    color: "#555566",
    fontSize: 10,
    textTransform: "uppercase",
    margin: "0 4px",
  },
  toggleBtn: {
    background: "none",
    border: "1px solid #353545",
    color: "#8a8a9a",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  actionsRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 8,
    alignItems: "center",
  },
  select: {
    background: "#1a1a24",
    border: "1px solid #353545",
    color: "#e8e8e8",
    borderRadius: 8,
    padding: "6px 8px",
    fontFamily: "inherit",
    fontSize: 12,
  },
  primaryBtn: {
    background: "#d4a853",
    border: "1px solid #d4a853",
    color: "#13131a",
    fontWeight: 700,
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  secondaryBtn: {
    background: "#252532",
    border: "1px solid #353545",
    color: "#e8e8e8",
    fontWeight: 600,
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  boardWrap: { marginTop: 12, display: "flex", justifyContent: "center" },
  errorText: { color: "#ff6b6b", fontSize: 12, marginTop: 8 },
  tiebreakSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: "1px solid #252532",
  },
  tiebreakTitle: {
    margin: "0 0 8px",
    fontSize: 13,
    color: "#d4a853",
    fontWeight: 700,
  },
  armageddonBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid #252532",
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 10,
    color: "#8a8a9a",
    textTransform: "uppercase",
  },
  hint: { color: "#8a8a9a", fontSize: 12, margin: 0 },
};

function statusStyle(g) {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: g.result
      ? "#d4a853"
      : g.status === "in_progress"
      ? "#4caf50"
      : "#8a8a9a",
  };
}

// One game — board toggle (view or, when interactive, play out moves) plus
// a quick result picker. clearable=false for tiebreak games, matching Cage
// Match's own scope today (no undo path for those yet). resultFn lets the
// tiebreak block below reuse this same row for its own games, pointed at
// the tiebreak-specific result endpoint instead.
function GameRow({
  game,
  target,
  tournamentId,
  readOnly,
  onChanged,
  clearable = true,
  resultFn = api.setMatchPlayGameResult,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.rowWrap}>
      <div style={S.row}>
        <span style={S.num}>#{game.gameNum}</span>
        <span style={S.players}>
          {game.whiteName} <span style={S.vs}>vs</span> {game.blackName}
        </span>
        <span style={statusStyle(game)}>
          {game.result
            ? resultLabel(game.result)
            : game.status === "in_progress"
            ? "In progress"
            : "Pending"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={S.toggleBtn}
        >
          {open ? "Hide Board" : "Open Board"}
        </button>
      </div>

      {!readOnly && (
        <div style={S.actionsRow}>
          {!game.result ? (
            <>
              <select
                value={pending}
                onChange={(e) => setPending(e.target.value)}
                style={S.select}
                disabled={busy}
              >
                <option value="">Record result…</option>
                {RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !pending}
                onClick={() =>
                  run(() => resultFn(tournamentId, target, game.id, pending))
                }
                style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}
              >
                Set
              </button>
            </>
          ) : (
            clearable && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    api.clearMatchPlayGameResult(tournamentId, target, game.id),
                  )
                }
                style={{ ...S.secondaryBtn, opacity: busy ? 0.6 : 1 }}
              >
                Clear Result
              </button>
            )
          )}
        </div>
      )}

      {open && (
        <div style={S.boardWrap}>
          <MoveEntryBoard
            game={game}
            disabled={readOnly || busy}
            onMove={(move) =>
              run(() =>
                api.recordMatchPlayMove(tournamentId, target, game.id, move),
              )
            }
            onUndo={
              game.moves?.length
                ? () =>
                    run(() =>
                      api.undoMatchPlayMove(tournamentId, target, game.id),
                    )
                : null
            }
            theme={DEFAULT_BOARD_THEME}
            pieceTheme={DEFAULT_PIECE_THEME}
          />
        </div>
      )}

      {error && <p style={S.errorText}>{error}</p>}
    </div>
  );
}

function ArmageddonBlock({
  tournamentId,
  target,
  armageddon,
  readOnly,
  onChanged,
}) {
  const [bidA, setBidA] = useState("");
  const [bidB, setBidB] = useState("");
  const [pendingResult, setPendingResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (
    armageddon.status === "awaiting_bids" ||
    armageddon.status === "bid_tie"
  ) {
    return (
      <div style={S.armageddonBox}>
        <h4 style={S.tiebreakTitle}>
          Armageddon
          {armageddon.status === "bid_tie" ? " — Bids Tied, Re-bid" : ""}
        </h4>
        {!readOnly ? (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <label style={S.fieldLabel}>
              Side A bid (seconds)
              <input
                type="number"
                min="1"
                value={bidA}
                onChange={(e) => setBidA(e.target.value)}
                style={S.select}
              />
            </label>
            <label style={S.fieldLabel}>
              Side B bid (seconds)
              <input
                type="number"
                min="1"
                value={bidB}
                onChange={(e) => setBidB(e.target.value)}
                style={S.select}
              />
            </label>
            <button
              type="button"
              disabled={busy || !bidA || !bidB}
              onClick={() =>
                run(() =>
                  api.recordMatchPlayArmageddonBids(
                    tournamentId,
                    target,
                    bidA,
                    bidB,
                  ),
                )
              }
              style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}
            >
              Submit Bids
            </button>
          </div>
        ) : (
          <p style={S.hint}>Awaiting sealed bids.</p>
        )}
        {error && <p style={S.errorText}>{error}</p>}
      </div>
    );
  }

  if (armageddon.status === "awaiting_result") {
    return (
      <div style={S.armageddonBox}>
        <h4 style={S.tiebreakTitle}>Armageddon</h4>
        <p style={{ margin: "4px 0 10px", fontSize: 13 }}>
          <strong>{armageddon.whiteName}</strong> plays White ·{" "}
          <strong>{armageddon.blackName}</strong> plays Black with draw odds
        </p>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select
              value={pendingResult}
              onChange={(e) => setPendingResult(e.target.value)}
              style={S.select}
            >
              <option value="">Result…</option>
              {RESULT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !pendingResult}
              onClick={() =>
                run(() =>
                  api.recordMatchPlayArmageddonResult(
                    tournamentId,
                    target,
                    pendingResult,
                  ),
                )
              }
              style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}
            >
              Set Result
            </button>
          </div>
        )}
        {error && <p style={S.errorText}>{error}</p>}
      </div>
    );
  }

  // complete
  return (
    <div style={S.armageddonBox}>
      <h4 style={S.tiebreakTitle}>Armageddon — Recorded</h4>
      <p style={{ margin: 0, fontSize: 13 }}>
        {armageddon.whiteName} (White) vs {armageddon.blackName} (Black):{" "}
        {resultLabel(armageddon.result)}
      </p>
    </div>
  );
}

// The shared drill-in for ONE mini-match — a Swiss/RR/DRR pairing (or team
// board), or a bracket match (or its board). `target` is
// { pairIndex, boardNum? } or { matchId, boardNum? } — see api.js's
// matchPlayBase(). `miniMatch` is the serialized object already sitting on
// the pairing/board/bracket-match the caller has in hand (pairing.miniMatch,
// board.miniMatch, m.miniMatch) — this component doesn't fetch it itself.
// `readOnly` disables every mutation (Round History, or a closed/completed
// mini-match) while still letting a board be opened to view moves.
// `onChanged` should trigger the caller's refresh() so the mini-match prop
// reflects the latest state after a mutation.
export default function MiniMatchPanel({
  tournamentId,
  target,
  miniMatch,
  readOnly = false,
  onChanged,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!miniMatch) return null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.header}>
          <h3 style={S.title}>
            {miniMatch.nameA} vs {miniMatch.nameB}
          </h3>
          <button type="button" onClick={onClose} style={S.closeBtn}>
            ✕
          </button>
        </div>

        <div style={S.scoreRow}>
          <span>{miniMatch.nameA}</span>
          <span style={S.scoreNums}>
            {miniMatch.score.A} – {miniMatch.score.B}
          </span>
          <span>{miniMatch.nameB}</span>
        </div>

        {miniMatch.status === "decided" && (
          <div style={S.decidedBanner}>
            {miniMatch.result === "1/2-1/2"
              ? "Drawn"
              : `${miniMatch.winnerName} wins the mini-match`}
          </div>
        )}

        {!readOnly && miniMatch.tieAlert && !miniMatch.tiebreak && (
          <div style={S.tieBanner}>
            <span>
              Scores are level at {miniMatch.tieAlert.scoreA}–
              {miniMatch.tieAlert.scoreB}.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => api.acceptMatchPlayDraw(tournamentId, target))
                }
                style={{ ...S.secondaryBtn, opacity: busy ? 0.6 : 1 }}
              >
                Accept Draw
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => api.startMatchPlayTiebreak(tournamentId, target))
                }
                style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}
              >
                Start Tiebreak
              </button>
            </div>
          </div>
        )}

        <div style={S.gamesList}>
          {miniMatch.games.map((g) => (
            <GameRow
              key={g.id}
              game={g}
              target={target}
              tournamentId={tournamentId}
              readOnly={readOnly}
              onChanged={onChanged}
            />
          ))}
        </div>

        {miniMatch.tiebreak && (
          <div style={S.tiebreakSection}>
            <h4 style={S.tiebreakTitle}>
              Tiebreak — Mini-Match ({miniMatch.tiebreak.miniMatch.score.A}–
              {miniMatch.tiebreak.miniMatch.score.B})
            </h4>
            <div style={S.gamesList}>
              {miniMatch.tiebreak.miniMatch.games.map((g) => (
                <GameRow
                  key={g.id}
                  game={g}
                  target={target}
                  tournamentId={tournamentId}
                  readOnly={readOnly}
                  onChanged={onChanged}
                  clearable={false}
                  resultFn={api.recordMatchPlayTiebreakResult}
                />
              ))}
            </div>

            {miniMatch.tiebreak.status === "armageddon" &&
              miniMatch.tiebreak.armageddon && (
                <ArmageddonBlock
                  tournamentId={tournamentId}
                  target={target}
                  armageddon={miniMatch.tiebreak.armageddon}
                  readOnly={readOnly}
                  onChanged={onChanged}
                />
              )}
          </div>
        )}

        {error && <p style={S.errorText}>{error}</p>}
      </div>
    </div>
  );
}
