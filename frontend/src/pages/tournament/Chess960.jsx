import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import ChessBoard from "../../components/ChessBoard.jsx";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "../../components/chessThemes.js";
import Chess960History from "../../components/Chess960History.jsx";

const THEME_STORAGE_KEY = "c960-board-theme";
const PIECE_THEME_STORAGE_KEY = "c960-piece-theme";

function CopyFenButton({ fen }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(fen).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{
        background: "#252532",
        border: "1px solid #353545",
        color: "#e8e8e8",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        padding: "10px 18px",
        borderRadius: 8,
        cursor: "pointer",
        textTransform: "uppercase",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
      }}
    >
      {copied ? "COPIED ✓" : "COPY FEN"}
    </button>
  );
}

export default function Chess960() {
  const { t } = useOutletContext();

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved && BOARD_THEMES[saved] ? saved : DEFAULT_BOARD_THEME;
    } catch {
      return DEFAULT_BOARD_THEME;
    }
  });

  const [pieceTheme, setPieceTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(PIECE_THEME_STORAGE_KEY);
      return saved && PIECE_THEMES[saved] ? saved : DEFAULT_PIECE_THEME;
    } catch {
      return DEFAULT_PIECE_THEME;
    }
  });

  const [selectedRound, setSelectedRound] = useState(t.currentRound);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled — theme just won't persist, no big deal.
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(PIECE_THEME_STORAGE_KEY, pieceTheme);
    } catch {
      // Same as above — non-fatal.
    }
  }, [pieceTheme]);

  if (!t.chess960) {
    return (
      <div
        style={{
          background: "#13131a",
          border: "1px solid #252532",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "#8a8a9a",
          fontFamily: "'SF Mono', Monaco, monospace",
          fontSize: 14,
        }}
      >
        <p style={{ margin: 0 }}>This tournament isn't using Chess960.</p>
      </div>
    );
  }

  const history = t.rounds.filter((r) => r.chess960);

  const current =
    history.find((r) => r.round === selectedRound)?.chess960 ??
    t.currentChess960;

  useEffect(() => {
    if (!history.length) return;

    setSelectedRound((prev) =>
      prev === null ? history[history.length - 1].round : prev,
    );
  }, [history]);

  const selectStyle = {
    background: "#1a1a24",
    border: "1px solid #353545",
    color: "#e8e8e8",
    padding: "6px 12px",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        color: "#e8e8e8",
        background:
          "radial-gradient(circle at 50% 0%, #1f1f2e 0%, transparent 70%)",
        padding: "8px 0",
        borderRadius: "16px",
      }}
    >
      <div
        style={{
          background: "#13131a",
          border: "1px solid #252532",
          borderRadius: 12,
          padding: "24px",
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            borderBottom: "1px solid #252532",
            paddingBottom: 12,
            gap: 16,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#e8e8e8",
              margin: 0,
            }}
          >
            Chess960 Starting Position
          </h2>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              aria-label="Board theme"
              style={selectStyle}
            >
              {Object.entries(BOARD_THEMES).map(([key, th]) => (
                <option key={key} value={key}>
                  {th.label}
                </option>
              ))}
            </select>
            <select
              value={pieceTheme}
              onChange={(e) => setPieceTheme(e.target.value)}
              aria-label="Piece theme"
              style={selectStyle}
            >
              {Object.entries(PIECE_THEMES).map(([key, pt]) => (
                <option key={key} value={key}>
                  {pt.label}
                </option>
              ))}
            </select>
            {current && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "#252532",
                  color: "#d4a853",
                  border: "1px solid #353545",
                }}
              >
                Round {selectedRound ?? t.currentRound}
              </span>
            )}
          </div>
        </div>

        {!current ? (
          <p style={{ color: "#8a8a9a", fontSize: 14, margin: 0 }}>
            A fresh random position is drawn the moment Round 1 is generated —
            check back once pairings are up.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "32px",
              alignItems: "flex-start",
            }}
          >
            {/* Chessboard */}
            <div
              style={{
                flexShrink: 0,
                overflow: "hidden",
                borderRadius: 8,
                border: "1px solid #252532",
              }}
            >
              <ChessBoard
                backRank={current.backRank}
                size={460}
                theme={theme}
                pieceTheme={pieceTheme}
              />
            </div>

            {/* Meta Data & FEN */}
            <div
              style={{
                flex: "1 1 300px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#e8e8e8",
                    margin: "0 0 8px 0",
                  }}
                >
                  Position #{current.id}
                </p>
                {current.id === 518 && (
                  <p
                    style={{
                      color: "#d4a853",
                      fontSize: 12,
                      background: "rgba(212, 168, 83, 0.1)",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(212, 168, 83, 0.2)",
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    This round happens to have drawn the standard chess starting
                    position — Chess960 includes it as one of its 960 legal
                    arrangements.
                  </p>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#8a8a9a",
                  }}
                >
                  FEN String
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <input
                    type="text"
                    readOnly
                    value={current.fen}
                    onClick={(e) => e.target.select()}
                    style={{
                      flex: 1,
                      background: "#1a1a24",
                      border: "1px solid #353545",
                      color: "#e8e8e8",
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <CopyFenButton fen={current.fen} />
                </div>
              </div>

              <p
                style={{
                  color: "#6b6b7b",
                  fontSize: 12,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Every board in Round {selectedRound ?? t.currentRound} starts
                from this position — set boards up accordingly before play
                begins.
              </p>
            </div>
          </div>
        )}
      </div>

      <Chess960History
        history={history}
        selectedRound={selectedRound}
        onSelectRound={setSelectedRound}
        theme={theme}
        pieceTheme={pieceTheme}
      />
    </div>
  );
}
