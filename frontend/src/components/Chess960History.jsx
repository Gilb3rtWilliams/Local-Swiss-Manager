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
    <div
      style={{
        background: "var(--tp-bg, #13131a)",
        border: "1px solid var(--tp-border, #252532)",
        borderRadius: 12,
        padding: "24px",
        fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: 20,
          borderBottom: "1px solid var(--tp-border, #252532)",
          paddingBottom: 12,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--tp-text, #e8e8e8)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>

      {/* Scroll container */}
      <div
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          paddingBottom: 16,
          scrollbarWidth: "thin",
          scrollbarColor: "var(--tp-border, #252532) transparent",
        }}
      >
        {/* Track */}
        {history.map((r) => {
          const isActive = selectedRound === r.round;
          return (
            <div
              key={r.round}
              onClick={() => onSelectRound?.(r.round)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                background: isActive
                  ? "var(--tp-surface, #1a1a24)"
                  : "transparent",
                border: `1px solid ${
                  isActive
                    ? "var(--tp-dim, #5a5a6a)"
                    : "var(--tp-border, #252532)"
                }`,
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
                transition: "all 0.2s ease",
                flexShrink: 0,
                boxShadow: isActive
                  ? "0 4px 12px color-mix(in srgb, var(--tp-shadow-color, #000) 20%, transparent)"
                  : "none",
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: isActive
                      ? "var(--tp-brass, #d4a853)"
                      : "var(--tp-dim, #6b6b7b)",
                    textTransform: "uppercase",
                  }}
                >
                  ROUND {r.round}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isActive
                      ? "var(--tp-text, #e8e8e8)"
                      : "var(--tp-muted, #8a8a9a)",
                  }}
                >
                  #{r.chess960.id}
                </span>
              </div>

              {/* Chess board */}
              <div
                style={{
                  borderRadius: 6,
                  overflow: "hidden",
                  opacity: isActive ? 1 : 0.6,
                  transition: "opacity 0.2s ease",
                  border: "1px solid var(--tp-surface, #1a1a24)",
                  pointerEvents: "none",
                }}
              >
                <ChessBoard
                  backRank={r.chess960.backRank}
                  size={size}
                  theme={theme}
                  pieceTheme={pieceTheme}
                  compact={compact}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
