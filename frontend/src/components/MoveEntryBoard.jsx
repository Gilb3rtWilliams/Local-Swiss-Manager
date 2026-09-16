import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import "../css/ChessBoard.css";
import "../css/MoveEntryBoard.css";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "./chessThemes.js";

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
 * it tracks a live position (via chess.js) and turns clicks into moves.
 *
 * Props:
 *   game       — serialized Game shape from the backend:
 *                { startFen, moves, fen, boardStatus, suggestedResult,
 *                  result, status }. startFen carries a Chess960 starting
 *                position when relevant; chess.js replays `moves` on top
 *                of it purely for rendering/legality — the backend remains
 *                the source of truth once onMove's result comes back.
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

  const colors = BOARD_THEMES[theme] || BOARD_THEMES[DEFAULT_BOARD_THEME];
  const pieces = PIECE_THEMES[pieceTheme] || PIECE_THEMES[DEFAULT_PIECE_THEME];
  const squareSize = size / 8;

  // Replay the game's moves purely for rendering/legal-move purposes — see
  // the file-level doc comment above. Also captures the last applied move
  // (for the "last move" highlight) since the backend's serialized game
  // only carries the SAN list, not a from/to pair.
  const { chess, lastMove } = useMemo(() => {
    const c = new Chess(game.startFen || undefined, { chess960: true });
    let last = null;
    for (const san of game.moves || []) {
      const r = c.move(san, { strict: false });
      if (!r) break; // shouldn't happen — server data is the source of truth
      last = r;
    }
    return { chess: c, lastMove: last };
  }, [game.startFen, game.moves]);

  const board = chess.board();
  const turn = chess.turn();
  const interactive = !disabled && game.status !== "complete";

  const legalByTarget = useMemo(() => {
    if (!selected) return {};
    const moves = chess.moves({ square: selected, verbose: true });
    const map = {};
    moves.forEach((m) => {
      if (!map[m.to]) map[m.to] = [];
      map[m.to].push(m);
    });
    return map;
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
    const piece = chess.get(square);

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

  const themeVars = {
    "--c960-light": colors.light,
    "--c960-dark": colors.dark,
    "--c960-border": colors.border,
    "--c960-piece-size": `${squareSize * 0.8}px`,
    "--c960-piece-shadow": pieces.shadow || "none",
  };

  return (
    <div className="me-root">
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
                  lastMove &&
                  (lastMove.from === square || lastMove.to === square);

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
          {game.status === "complete"
            ? "Game complete"
            : `${turn === "w" ? "White" : "Black"} to move`}
        </span>
        {onUndo && interactive && game.moves && game.moves.length > 0 && (
          <button type="button" className="me-undo" onClick={onUndo}>
            ↶ Undo last move
          </button>
        )}
      </div>

      {error && <p className="me-error">{error}</p>}
    </div>
  );
}
