import ChessBoard from "./ChessBoard.jsx";
import { DEFAULT_BOARD_THEME, DEFAULT_PIECE_THEME } from "./chessThemes.js";

/**
 * Reusable Horizontal Scrolling Chess960 Position History.
 * Displays every Chess960 position generated during a tournament.
 * Cards are selectable, allowing the parent component to synchronize
 * the currently active round/position.
 */
export default function Chess960History({
  history = [],
  selectedRound = null,
  onSelectRound,
  theme = DEFAULT_BOARD_THEME,
  pieceTheme = DEFAULT_PIECE_THEME,
  size = 180,
  compact = true,
  title = "Position History",
}) {
  if (!history || history.length === 0) return null;

  return (
    <div className="card">
      <div className="section-header">
        <h2>{title}</h2>
      </div>

      {/* Outer wrapper */}
      <div className="c960-history-picker">
        {/* Scroll container */}
        <div className="c960-history-scroll">
          {/* Track */}
          <div className="c960-history-track">
            {history.map((r) => (
              <div
                key={r.round}
                className={`c960-history-card ${
                  selectedRound === r.round ? "active" : ""
                }`}
                onClick={() => onSelectRound?.(r.round)}
              >
                {/* Header */}
                <div className="c960-card-header">
                  <span className="c960-round-tag">ROUND {r.round}</span>

                  <span className="c960-id-tag">#{r.chess960.id}</span>
                </div>

                {/* Chess board */}
                <div className="c960-card-body">
                  <ChessBoard
                    backRank={r.chess960.backRank}
                    size={size}
                    theme={theme}
                    pieceTheme={pieceTheme}
                    compact={compact}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
