// ReadOnlyBoard.jsx  (web -- public viewer)
// ─────────────────────────────────────────────────────────────────────────
// Renders a single board from { startFen, moves, lastMove } -- the exact
// shape a published game carries. Uses chessRules.js (the same chessops
// wrapper the desktop app's MoveEntryBoard uses) purely for replay/rendering
// -- there is no click handling here at all; a viewer never moves pieces.
//
// PLACEHOLDER PIECE RENDERING: this uses Unicode chess glyphs (♔♞ etc.)
// rather than your existing chessThemes.js piece images, since I don't have
// access to that file or your asset paths. Swap renderPieceGlyph() below for
// an <img src={...}> using your existing piece theme assets if you'd rather
// match MoveEntryBoard's look exactly -- everything else here (the grid,
// highlighting) is asset-independent.

import { useMemo } from "react";
import { replay, boardGrid, FILES } from "./chessRules";

const GLYPHS = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

export default function ReadOnlyBoard({
  startFen,
  moves,
  lastMove,
  size = 320,
}) {
  const { pos } = useMemo(() => replay(startFen, moves), [startFen, moves]);
  const square = size / 8;

  if (!pos) {
    return (
      <div style={{ ...styles.board, width: size, height: size }}>
        <span style={styles.errorText}>Board unavailable</span>
      </div>
    );
  }

  const grid = boardGrid(pos); // [0][0] = a8 ... [7][7] = h1
  const highlight = new Set([lastMove?.from, lastMove?.to].filter(Boolean));

  return (
    <div style={{ ...styles.board, width: size, height: size }}>
      {grid.map((row, rankIdx) =>
        row.map((piece, fileIdx) => {
          const file = FILES[fileIdx];
          const rank = 8 - rankIdx;
          const squareName = `${file}${rank}`;
          const isDark = (rankIdx + fileIdx) % 2 === 1;
          const isHighlighted = highlight.has(squareName);
          return (
            <div
              key={squareName}
              style={{
                position: "absolute",
                left: fileIdx * square,
                top: rankIdx * square,
                width: square,
                height: square,
                background: isHighlighted
                  ? "#f6f67a"
                  : isDark
                  ? "#7a9b57"
                  : "#eeeed2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: square * 0.72,
                lineHeight: 1,
                userSelect: "none",
              }}
            >
              {piece ? GLYPHS[piece.color][piece.type] : null}
            </div>
          );
        }),
      )}
    </div>
  );
}

const styles = {
  board: { position: "relative", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" },
  errorText: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#888",
    fontSize: 13,
  },
};
