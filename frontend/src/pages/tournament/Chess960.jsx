import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import ChessBoard from "../../components/ChessBoard.jsx";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "../../components/chessThemes.js";
import "../../css/Chess960.css";
import Chess960History from "../../components/Chess960History.jsx";

const THEME_STORAGE_KEY = "c960-board-theme";
const PIECE_THEME_STORAGE_KEY = "c960-piece-theme";

function CopyFenButton({ fen }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={() => {
        navigator.clipboard.writeText(fen).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied ✓" : "Copy FEN"}
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
      <div className="card">
        <p className="muted">This tournament isn't using Chess960.</p>
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

  return (
    <div className="c960-page">
      <div className="card">
        <div className="section-header">
          <h2>Chess960 Starting Position</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              aria-label="Board theme"
              style={{ width: "auto" }}
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
              style={{ width: "auto" }}
            >
              {Object.entries(PIECE_THEMES).map(([key, pt]) => (
                <option key={key} value={key}>
                  {pt.label}
                </option>
              ))}
            </select>
            {current && (
              <span className="round-badge">
                Round {selectedRound ?? t.currentRound}
              </span>
            )}
          </div>
        </div>

        {!current ? (
          <p className="muted">
            A fresh random position is drawn the moment Round 1 is generated —
            check back once pairings are up.
          </p>
        ) : (
          <div className="c960-current-layout">
            <ChessBoard
              backRank={current.backRank}
              size={460}
              theme={theme}
              pieceTheme={pieceTheme}
            />
            <div className="c960-meta">
              <p className="c960-position-id">Position #{current.id}</p>
              {current.id === 518 && (
                <p className="c960-note">
                  This round happens to have drawn the standard chess starting
                  position — Chess960 includes it as one of its 960 legal
                  arrangements.
                </p>
              )}
              <label className="field c960-fen-field">
                <span>FEN</span>
                <div className="c960-fen-row">
                  <input
                    type="text"
                    readOnly
                    value={current.fen}
                    onClick={(e) => e.target.select()}
                  />
                  <CopyFenButton fen={current.fen} />
                </div>
              </label>
              <p className="hint">
                Every board in Round {selectedRound ?? t.currentRound}
                starts from this position — set boards up accordingly before
                play begins.
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
