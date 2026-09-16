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

function bracketLabel(m) {
  return m.bracket === "W"
    ? "Winners"
    : m.bracket === "L"
    ? "Losers"
    : "Grand Final";
}

function competitorNames(m) {
  const a = m.competitorA?.name || "TBD";
  const b = m.competitorB?.name || "TBD";
  return `${a} vs ${b}`;
}

// Cage Match has no shared "round" the way Swiss/round-robin does, and no
// "match" the way a bracket does — a Chess960-variant section can carry
// several games, and each game gets its own independent random draw (see
// cageMatch.js's chess960PositionFor), so the picker here lists every
// individual chess960 game across every such section.
function CageGamePicker({ games, selectedId, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {games.map((g) => {
        const active = g.id === selectedId;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.id)}
            style={{
              background: active ? "#252532" : "#1a1a24",
              border: `1px solid ${active ? "#d4a853" : "#353545"}`,
              color: active ? "#e8e8e8" : "#8a8a9a",
              fontSize: 11,
              fontWeight: 600,
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              lineHeight: 1.4,
            }}
          >
            <div
              style={{
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontSize: 10,
              }}
            >
              {g.sectionLabel} · Game {g.gameNum}
            </div>
            <div>
              {g.whiteName} vs {g.blackName}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Bracket matches don't share a synchronous "round" the way Swiss/round-robin
// rounds do — a match's Chess960 position is rolled the moment its two sides
// are known (see tournamentService.js's activateMatch), which can happen at
// very different real-world times for different matches. So instead of the
// round picker used for Swiss/round-robin, brackets get a match picker here.
function BracketMatchPicker({ matches, selectedId, onSelect }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {matches.map((m) => {
        const active = m.id === selectedId;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            style={{
              background: active ? "#252532" : "#1a1a24",
              border: `1px solid ${active ? "#d4a853" : "#353545"}`,
              color: active ? "#e8e8e8" : "#8a8a9a",
              fontSize: 11,
              fontWeight: 600,
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              lineHeight: 1.4,
            }}
          >
            <div
              style={{
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontSize: 10,
              }}
            >
              {bracketLabel(m)} · Round {m.round}
            </div>
            <div>{competitorNames(m)}</div>
          </button>
        );
      })}
    </div>
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

  const isCageMatch = t.format === "match" && t.matchType === "cage";
  const isBracket = Boolean(t.bracket);

  // Swiss/round-robin: one position per round, keyed by round number.
  // t.rounds only exists for individual/team tournaments — a Cage Match
  // tournament has neither t.rounds nor t.bracket, so both of these must
  // be skipped rather than attempted for it.
  const roundHistory =
    !isCageMatch && !isBracket ? t.rounds.filter((r) => r.chess960) : [];
  // Elimination brackets: one position per match, keyed by match id.
  const matchHistory = isBracket
    ? (t.bracket.matches || []).filter((m) => m.chess960)
    : [];
  // Cage Match: one position per GAME (not per round or per match) — every
  // chess960-variant section can carry several games, and each gets its
  // own independent random draw (see cageMatch.js), so this flattens every
  // such game across every chess960 section into one flat, pickable list.
  const cageGameHistory = isCageMatch
    ? t.cageMatch.sections.flatMap((s) =>
        s.variant === "chess960"
          ? s.games.map((g) => ({
              id: g.id,
              sectionLabel: s.label,
              gameNum: g.gameNum,
              whiteName: g.whiteName,
              blackName: g.blackName,
              chess960: g.chess960,
            }))
          : [],
      )
    : [];

  const [selectedRound, setSelectedRound] = useState(t.currentRound);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [selectedCageGameId, setSelectedCageGameId] = useState(null);

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

  // Hooks must run every render regardless of t.chess960, so both selection
  // effects live above the early return below (t.chess960 is effectively
  // static per mounted tournament, but this keeps hook order safe either way).
  useEffect(() => {
    if (!roundHistory.length) return;
    setSelectedRound((prev) =>
      prev === null ? roundHistory[roundHistory.length - 1].round : prev,
    );
  }, [roundHistory.length]);

  useEffect(() => {
    if (!matchHistory.length) return;
    setSelectedMatchId((prev) =>
      prev && matchHistory.some((m) => m.id === prev)
        ? prev
        : matchHistory[matchHistory.length - 1].id,
    );
  }, [matchHistory.length]);

  useEffect(() => {
    if (!cageGameHistory.length) return;
    setSelectedCageGameId((prev) =>
      prev && cageGameHistory.some((g) => g.id === prev)
        ? prev
        : cageGameHistory[0].id,
    );
  }, [cageGameHistory.length]);

  const usesChess960 = isCageMatch
    ? t.cageMatch.sections.some((s) => s.variant === "chess960")
    : t.chess960;

  if (!usesChess960) {
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

  const selectedMatch = isBracket
    ? matchHistory.find((m) => m.id === selectedMatchId)
    : null;

  const selectedCageGame = isCageMatch
    ? cageGameHistory.find((g) => g.id === selectedCageGameId)
    : null;

  const current = isCageMatch
    ? selectedCageGame?.chess960 ?? null
    : isBracket
    ? selectedMatch?.chess960 ?? null
    : roundHistory.find((r) => r.round === selectedRound)?.chess960 ??
      t.currentChess960;

  const badgeLabel = isCageMatch
    ? selectedCageGame
      ? `${selectedCageGame.sectionLabel} · Game ${selectedCageGame.gameNum}`
      : null
    : isBracket
    ? selectedMatch
      ? `${bracketLabel(selectedMatch)} · Round ${selectedMatch.round}`
      : null
    : `Round ${selectedRound ?? t.currentRound}`;

  const emptyStateHint = isCageMatch
    ? "Each Chess960 game gets its own random starting position — check back once that section's games are set up."
    : isBracket
    ? "Each match gets its own random position the moment both sides are known — check back once the bracket starts filling in."
    : "A fresh random position is drawn the moment Round 1 is generated — check back once pairings are up.";

  const footerHint = isCageMatch
    ? selectedCageGame
      ? `This board starts from this position for ${selectedCageGame.whiteName} vs ${selectedCageGame.blackName} (${selectedCageGame.sectionLabel}, Game ${selectedCageGame.gameNum}) — set the board up accordingly before play begins.`
      : "This board starts from this position — set it up accordingly before play begins."
    : isBracket
    ? selectedMatch
      ? `Every board in ${competitorNames(
          selectedMatch,
        )} starts from this position — set boards up accordingly before play begins.`
      : "Every board in this match starts from this position — set boards up accordingly before play begins."
    : `Every board in Round ${
        selectedRound ?? t.currentRound
      } starts from this position — set boards up accordingly before play begins.`;

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
            {current && badgeLabel && (
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
                {badgeLabel}
              </span>
            )}
          </div>
        </div>

        {isBracket && matchHistory.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <BracketMatchPicker
              matches={matchHistory}
              selectedId={selectedMatchId}
              onSelect={setSelectedMatchId}
            />
          </div>
        )}

        {isCageMatch && cageGameHistory.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <CageGamePicker
              games={cageGameHistory}
              selectedId={selectedCageGameId}
              onSelect={setSelectedCageGameId}
            />
          </div>
        )}

        {!current ? (
          <p style={{ color: "#8a8a9a", fontSize: 14, margin: 0 }}>
            {emptyStateHint}
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
                    {isBracket ? "This match happens" : "This round happens"} to
                    have drawn the standard chess starting position — Chess960
                    includes it as one of its 960 legal arrangements.
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
                {footerHint}
              </p>
            </div>
          </div>
        )}
      </div>

      {!isBracket && !isCageMatch && (
        <Chess960History
          history={roundHistory}
          selectedRound={selectedRound}
          onSelectRound={setSelectedRound}
          theme={theme}
          pieceTheme={pieceTheme}
        />
      )}
    </div>
  );
}
