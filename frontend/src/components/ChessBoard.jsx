import "../css/ChessBoard.css";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "./chessThemes.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// Returns the two-letter asset code matching your SVG filenames
function pieceAt(backRank, rank, file) {
  const pieceType = backRank[file];
  if (rank === 1) return { code: `w${pieceType}`, name: `White ${pieceType}` };
  if (rank === 8) return { code: `b${pieceType}`, name: `Black ${pieceType}` };
  if (rank === 2) return { code: "wP", name: "White Pawn" };
  if (rank === 7) return { code: "bP", name: "Black Pawn" };
  return null;
}

/**
 * Static, labeled Chess960 starting-position board.
 *
 * Props:
 *   backRank — 8-element array, index 0 = a-file .. index 7 = h-file,
 *              e.g. ["R","N","B","Q","K","B","N","R"] (piece *type* only —
 *              this component mirrors it onto rank 8 for Black itself).
 *   size     — rendered width/height in px (default 480 — was 320; bumped up
 *              since the default rendering is meant to be read at a glance,
 *              not squinted at).
 *   theme    — key into BOARD_THEMES (see chessThemes.js). Defaults to
 *              'walnut', the original look, so existing callers that don't
 *              pass a theme are unaffected.
 *   pieceTheme — key into PIECE_THEMES, independent of the board theme.
 *              Defaults to 'ivory', the original colors.
 *   compact  — hides file/rank labels for small thumbnail use (history strips).
 */
export default function ChessBoard({
  backRank,
  size = 480,
  theme = DEFAULT_BOARD_THEME,
  pieceTheme = DEFAULT_PIECE_THEME,
  compact = false,
}) {
  if (!backRank || backRank.length !== 8) return null;

  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  const files = [0, 1, 2, 3, 4, 5, 6, 7];
  const squareSize = size / 8;
  const colors = BOARD_THEMES[theme] || BOARD_THEMES[DEFAULT_BOARD_THEME];
  const pieces = PIECE_THEMES[pieceTheme] || PIECE_THEMES[DEFAULT_PIECE_THEME];

  // Piece glyphs previously had a fixed font-size regardless of `size`, so a
  // bigger board just got bigger squares with the same small pieces sitting
  // in them. Scale proportionally to the square instead. (Compact mode's own
  // CSS rule — .c960-compact .c960-piece — has higher specificity than this
  // custom property and still wins for thumbnails, so this is safe to always set.)

  // We bump piece size to 80% of the square for SVGs and pass drop-shadow directly
  const themeVars = {
    "--c960-light": colors.light,
    "--c960-dark": colors.dark,
    "--c960-border": colors.border,
    "--c960-piece-size": `${squareSize * 0.8}px`,
    "--c960-piece-shadow": pieces.shadow || "none",
  };

  return (
    <div
      className={`c960-board-wrap${compact ? " c960-compact" : ""}`}
      style={{ width: size, ...themeVars }}
    >
      <div className="c960-board-row">
        {!compact && (
          <div className="c960-rank-labels" style={{ height: size }}>
            {ranks.map((r) => (
              <span key={r} style={{ height: squareSize }}>
                {r}
              </span>
            ))}
          </div>
        )}
        <div
          className="c960-board"
          style={{
            width: size,
            height: size,
            gridTemplateColumns: `repeat(8, 1fr)`,
          }}
        >
          {ranks.map((rank) =>
            files.map((file) => {
              const isLight = (rank + file) % 2 === 0;
              const piece = pieceAt(backRank, rank, file);
              return (
                <div
                  key={`${rank}-${file}`}
                  className={`c960-sq ${isLight ? "c960-light" : "c960-dark"}`}
                >
                  {piece && (
                    <img
                      src={`/pieces/${pieces.folder}/${piece.code}.svg`}
                      alt={piece.name}
                      className="c960-piece"
                      loading="lazy"
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
      {!compact && (
        <div className="c960-file-labels" style={{ width: size }}>
          {FILES.map((f) => (
            <span key={f} style={{ width: squareSize }}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
