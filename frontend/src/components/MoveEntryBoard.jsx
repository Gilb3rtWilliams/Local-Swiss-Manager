import { useEffect, useMemo, useState } from "react";
import "../css/ChessBoard.css";
import "../css/MoveEntryBoard.css";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "./chessThemes.js";
import {
  replay,
  turnOf,
  pieceAt,
  boardGrid,
  legalTargets,
  makePgn,
} from "./chessRules.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_NAME = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const PROMOTION_CHOICES = ["q", "r", "b", "n"];

// "BBQNNRKR" for a Chess960 start FEN, or null for a standard game — shown
// as a label so an arbiter can set up the physical board from the header.
function backRankLabel(startFen) {
  if (!startFen) return null;
  const rank8 = startFen.split(" ")[0].split("/")[7];
  return rank8 && /^[KQRBNkqrbn]{8}$/.test(rank8) ? rank8.toUpperCase() : null;
}

// PGN's Result tag only knows 1-0 / 0-1 / 1/2-1/2 / * — forfeits aren't
// standard PGN notation, so they collapse onto whichever side the forfeit
// awarded the point to. A double forfeit has no sensible PGN result, so it
// falls back to "*" (unknown/no result), same as an ongoing game.
const PGN_RESULT = {
  "1-0": "1-0",
  "0-1": "0-1",
  "1/2-1/2": "1/2-1/2",
  "1F-0F": "1-0",
  "0F-1F": "0-1",
  "0F-0F": "*",
};

function safeFileSegment(s) {
  return (s || "player").replace(/[^a-z0-9]+/gi, "_");
}

// Builds a standalone PGN string straight from the same startFen/moves the
// board already replays for rendering — no backend round-trip needed, and
// no risk of drifting from what's actually shown on screen. A Chess960
// starting position (any non-default game.startFen) gets an explicit
// [Variant "Chess960"] header plus [SetUp]/[FEN] for a non-default start
// (see makePgn in chessRules.js).
function buildPgn(game) {
  const headers = [];
  if (game.whiteName) headers.push(["White", game.whiteName]);
  if (game.blackName) headers.push(["Black", game.blackName]);
  return makePgn({
    startFen: game.startFen || undefined,
    moves: game.moves || [],
    headers,
    result: game.result ? PGN_RESULT[game.result] || "*" : "*",
  });
}

function downloadPgn(game) {
  const pgn = buildPgn(game);
  const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileSegment(game.whiteName)}_vs_${safeFileSegment(
    game.blackName,
  )}_game${game.gameNum ?? ""}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Same {color}{TYPE} code convention as ChessBoard.jsx's pieceAt() (e.g.
// "wP", "bN") so both components resolve to the exact same SVG filenames
// under /pieces/{folder}/ — this is what makes a live game board and a
// starting-position diagram look like the same board, not two different
// products glued together.
function codeFor(type, color) {
  return `${color}${type.toUpperCase()}`;
}

/**
 * Interactive, click-to-move chessboard for recording a game in progress —
 * the live counterpart to ChessBoard.jsx's static starting-position
 * diagram. Shares that component's board/piece SVG rendering and theme
 * system (chessThemes.js) so the two look consistent; unlike ChessBoard.jsx
 * it tracks a live position (via chessRules.js / chessops) and turns clicks
 * into moves. Chess960 castling follows the real rules: click the king, then
 * either your rook or the square the king will land on.
 *
 * Props:
 *   game       — serialized Game shape from the backend:
 *                { startFen, moves, fen, boardStatus, suggestedResult,
 *                  result, status }. startFen carries a Chess960 starting
 *                position when relevant; chessops replays `moves` on top
 *                of it purely for rendering/legality — the backend remains
 *                the source of truth once onMove's result comes back.
 *                whiteName/blackName/gameNum (when present on the same
 *                object) are used for the PGN download's headers/filename.
 *   onMove     — called with { from, to, promotion? } once a legal move is
 *                clicked through; the backend validates it again.
 *   onUndo     — optional; removes the most recently recorded move.
 *   disabled   — true once the game has a recorded result, or while a
 *                request is in flight.
 *   orientation — "white" | "black"
 *   size       — rendered width/height in px, same meaning as ChessBoard's.
 *   theme/pieceTheme — same BOARD_THEMES/PIECE_THEMES keys ChessBoard.jsx
 *                takes, so a Cage Match board can match whatever board/piece
 *                skin the rest of the tournament is using.
 *   error      — optional message shown under the board (API errors happen
 *                in the parent's onMove handler, not inside this component).
 *
 * Move browsing: the board can step back through any earlier position via
 * the move-navigation row — this works whether the game is still in
 * progress or already complete, since it's driven by a separate viewIndex
 * rather than by game.status. Only the *live* (full) position is ever
 * editable; stepping away from it disables making new moves until you jump
 * back to the latest position.
 */
export default function MoveEntryBoard({
  game,
  onMove,
  onUndo,
  disabled = false,
  orientation = "white",
  size = 420,
  theme = DEFAULT_BOARD_THEME,
  pieceTheme = DEFAULT_PIECE_THEME,
  error = "",
}) {
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const startFen = game.startFen || undefined;
  const chess960Rank = backRankLabel(startFen);

  const liveMoves = game.moves || [];
  const [viewIndex, setViewIndex] = useState(liveMoves.length);
  // Snap to the latest move whenever the move count changes — a new move
  // just got recorded (or the game loaded for the first time). This is
  // what makes new moves show up immediately without stranding the viewer
  // on a stale position, while still letting them freely step back
  // afterward.
  useEffect(() => {
    setViewIndex(liveMoves.length);
  }, [liveMoves.length]);

  function jumpTo(index) {
    setSelected(null);
    setPendingPromotion(null);
    setViewIndex(Math.max(0, Math.min(liveMoves.length, index)));
  }

  const isLatest = viewIndex === liveMoves.length;

  const colors = BOARD_THEMES[theme] || BOARD_THEMES[DEFAULT_BOARD_THEME];
  const pieces = PIECE_THEMES[pieceTheme] || PIECE_THEMES[DEFAULT_PIECE_THEME];
  const squareSize = size / 8;

  // Replay the game's *full* move list — this is the real, live position:
  // source of truth for whose turn it is and what's legal to play. Kept
  // separate from what's actually rendered (see displayChess below) so
  // browsing history never has to touch turn/legality logic.
  const { chess, lastMove } = useMemo(() => {
    const r = replay(startFen, game.moves);
    return { chess: r.pos, lastMove: r.lastMove }; // chess === null: bad start FEN
  }, [startFen, game.moves]);

  // What's actually drawn on the board. Identical to the live position at
  // viewIndex === liveMoves.length; a fresh, shorter replay otherwise — this
  // is what lets "go back to an earlier move" work regardless of whether
  // the game is complete, since it never touches game.status at all.
  const { displayChess, displayLastMove } = useMemo(() => {
    if (isLatest) return { displayChess: chess, displayLastMove: lastMove };
    const r = replay(startFen, liveMoves, viewIndex);
    return { displayChess: r.pos, displayLastMove: r.lastMove };
  }, [isLatest, chess, lastMove, startFen, liveMoves, viewIndex]);

  const board = displayChess ? boardGrid(displayChess) : null;
  const turn = chess ? turnOf(chess) : "w";
  // Interactive play requires being at the live/latest position — stepping
  // back to review an earlier move (whether the game is complete or still
  // in progress) disables making new moves until you jump back to latest.
  const interactive = !disabled && game.status !== "complete" && isLatest;

  // { clickableSquare: [candidate move, ...] } — includes both squares from
  // which a castle can be played (the rook's, and the king's landing square).
  const legalByTarget = useMemo(() => {
    if (!selected || !chess) return {};
    return legalTargets(chess, selected);
  }, [chess, selected]);

  const ranks =
    orientation === "white"
      ? [8, 7, 6, 5, 4, 3, 2, 1]
      : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? FILES : [...FILES].reverse();

  function pieceAtSquare(file, rank) {
    const rowIdx = 8 - rank;
    const colIdx = FILES.indexOf(file);
    return board[rowIdx][colIdx];
  }

  function handleSquareClick(square) {
    if (!interactive || pendingPromotion) return;
    const piece = pieceAt(chess, square);

    if (selected === square) {
      setSelected(null);
      return;
    }

    if (selected && legalByTarget[square]) {
      const candidates = legalByTarget[square];
      if (candidates.length > 1) {
        setPendingPromotion({ from: selected, to: square });
        return;
      }
      const move = candidates[0];
      setSelected(null);
      onMove(
        move.promotion
          ? { from: move.from, to: move.to, promotion: move.promotion }
          : { from: move.from, to: move.to },
      );
      return;
    }

    if (piece && piece.color === turn) {
      setSelected(square);
    } else {
      setSelected(null);
    }
  }

  function confirmPromotion(pieceType) {
    if (!pendingPromotion) return;
    onMove({
      from: pendingPromotion.from,
      to: pendingPromotion.to,
      promotion: pieceType,
    });
    setPendingPromotion(null);
    setSelected(null);
  }

  // Start position couldn't be parsed (corrupt/unsupported FEN). Say so
  // instead of letting a render error take down the whole page.
  if (!chess) {
    return (
      <div className="me-root">
        <p className="me-error">
          This game's starting position couldn't be loaded, so the board can't
          be shown.
        </p>
      </div>
    );
  }

  const themeVars = {
    "--c960-light": colors.light,
    "--c960-dark": colors.dark,
    "--c960-border": colors.border,
    "--c960-piece-size": `${squareSize * 0.8}px`,
    "--c960-piece-shadow": pieces.shadow || "none",
  };

  return (
    <div className="me-root">
      {chess960Rank && (
        <div
          className="me-960-label"
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#8a8a9a",
            marginBottom: 8,
            letterSpacing: "0.08em",
          }}
        >
          CHESS960 · {chess960Rank}
          {viewIndex === 0 ? " · starting position" : ""}
          {interactive && (
            <div style={{ marginTop: 3, letterSpacing: 0, opacity: 0.8 }}>
              To castle: click the king, then your rook (or the king's landing
              square).
            </div>
          )}
        </div>
      )}
      <div className="c960-board-wrap" style={{ width: size, ...themeVars }}>
        <div className="c960-board-row">
          <div className="c960-rank-labels" style={{ height: size }}>
            {ranks.map((r) => (
              <span key={r} style={{ height: squareSize }}>
                {r}
              </span>
            ))}
          </div>
          <div
            className={`c960-board ${interactive ? "" : "me-board-disabled"}`}
            style={{
              width: size,
              height: size,
              gridTemplateColumns: "repeat(8, 1fr)",
            }}
            role="grid"
            aria-label="Chess board"
          >
            {ranks.map((rank) =>
              files.map((file) => {
                const square = `${file}${rank}`;
                const piece = pieceAtSquare(file, rank);
                const isLight = (FILES.indexOf(file) + rank) % 2 === 0;
                const isSelected = selected === square;
                const isTarget = !!legalByTarget[square];
                const isLastMove =
                  displayLastMove &&
                  (displayLastMove.from === square ||
                    displayLastMove.to === square);

                return (
                  <button
                    type="button"
                    key={square}
                    className={[
                      "c960-sq",
                      isLight ? "c960-light" : "c960-dark",
                      isSelected ? "me-selected" : "",
                      isLastMove ? "me-last-move" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSquareClick(square)}
                    disabled={!interactive}
                    aria-label={square}
                  >
                    {piece && (
                      <img
                        src={`/pieces/${pieces.folder}/${codeFor(
                          piece.type,
                          piece.color,
                        )}.svg`}
                        alt={`${piece.color === "w" ? "White" : "Black"} ${
                          PIECE_NAME[piece.type]
                        }`}
                        className="c960-piece"
                      />
                    )}
                    {isTarget && !piece && <span className="me-dot" />}
                    {isTarget && piece && <span className="me-ring" />}
                  </button>
                );
              }),
            )}
          </div>
        </div>
        <div className="c960-file-labels" style={{ width: size }}>
          {FILES.map((f) => (
            <span key={f} style={{ width: squareSize }}>
              {f}
            </span>
          ))}
        </div>
      </div>

      {liveMoves.length > 0 && (
        <div
          className="me-move-nav"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            onClick={() => jumpTo(0)}
            disabled={viewIndex === 0}
            aria-label="First move"
            style={{
              background: "#1a1a24",
              border: "1px solid #353545",
              color: viewIndex === 0 ? "#4a4a5a" : "#e8e8e8",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: viewIndex === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() => jumpTo(viewIndex - 1)}
            disabled={viewIndex === 0}
            aria-label="Previous move"
            style={{
              background: "#1a1a24",
              border: "1px solid #353545",
              color: viewIndex === 0 ? "#4a4a5a" : "#e8e8e8",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: viewIndex === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            ◀
          </button>
          <span
            style={{
              fontSize: 11,
              color: "#8a8a9a",
              minWidth: 92,
              textAlign: "center",
            }}
          >
            {viewIndex === 0
              ? "Start"
              : `Move ${viewIndex} / ${liveMoves.length}`}
          </span>
          <button
            type="button"
            onClick={() => jumpTo(viewIndex + 1)}
            disabled={isLatest}
            aria-label="Next move"
            style={{
              background: "#1a1a24",
              border: "1px solid #353545",
              color: isLatest ? "#4a4a5a" : "#e8e8e8",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: isLatest ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => jumpTo(liveMoves.length)}
            disabled={isLatest}
            aria-label="Latest move"
            style={{
              background: "#1a1a24",
              border: "1px solid #353545",
              color: isLatest ? "#4a4a5a" : "#e8e8e8",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: isLatest ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            ⏭
          </button>
        </div>
      )}

      {pendingPromotion && (
        <div className="me-promotion-picker">
          <span className="me-promotion-label">Promote to:</span>
          {PROMOTION_CHOICES.map((p) => (
            <button
              type="button"
              key={p}
              className="me-promotion-choice"
              onClick={() => confirmPromotion(p)}
            >
              <img
                src={`/pieces/${pieces.folder}/${codeFor(p, turn)}.svg`}
                alt={PIECE_NAME[p]}
                className="me-promotion-icon"
              />
              {PIECE_NAME[p]}
            </button>
          ))}
          <button
            type="button"
            className="me-promotion-cancel"
            onClick={() => setPendingPromotion(null)}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="me-footer">
        <span className="me-turn-indicator">
          {!isLatest
            ? `Viewing move ${viewIndex} of ${liveMoves.length}`
            : game.status === "complete"
            ? "Game complete"
            : `${turn === "w" ? "White" : "Black"} to move`}
        </span>
        {onUndo && interactive && game.moves && game.moves.length > 0 && (
          <button type="button" className="me-undo" onClick={onUndo}>
            ↶ Undo last move
          </button>
        )}
        {(liveMoves.length > 0 || game.result) && (
          <button
            type="button"
            onClick={() => downloadPgn(game)}
            style={{
              background: "#1a1a24",
              border: "1px solid #353545",
              color: "#e8e8e8",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              marginLeft: 8,
            }}
          >
            ⬇ Download PGN
          </button>
        )}
      </div>

      {error && <p className="me-error">{error}</p>}
    </div>
  );
}
