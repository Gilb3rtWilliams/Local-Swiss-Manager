import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import RoundHistory from "../components/RoundHistory.jsx";
import BracketCanvas from "../components/BracketCanvas.jsx";
import ChessBoard from "../components/ChessBoard.jsx";
import Chess960History from "../components/Chess960History.jsx";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "../components/chessThemes.js";
import StandingsTable from "../components/StandingsTable.jsx";
import TeamStandingsTable from "../components/TeamStandingsTable.jsx";
import CrossTable from "../components/CrossTable.jsx";
import "../css/PublicResults.css";
import "../css/Chess960.css";

const PUBLIC_THEME_KEY = "c960-public-board-theme";
const PUBLIC_PIECE_THEME_KEY = "c960-public-piece-theme";

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

// Same experience as the organizer's Chess960 tab (current position + board/
// piece theme pickers + scrollable history), rebuilt read-only for a public
// spectator: no admin chrome, and its own localStorage keys so a theme
// choice made here never collides with the organizer's own preference if
// both happen to be viewed in the same browser.
function Chess960Section({ data }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(PUBLIC_THEME_KEY);
      return saved && BOARD_THEMES[saved] ? saved : DEFAULT_BOARD_THEME;
    } catch {
      return DEFAULT_BOARD_THEME;
    }
  });
  const [pieceTheme, setPieceTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(PUBLIC_PIECE_THEME_KEY);
      return saved && PIECE_THEMES[saved] ? saved : DEFAULT_PIECE_THEME;
    } catch {
      return DEFAULT_PIECE_THEME;
    }
  });
  const [selectedRound, setSelectedRound] = useState(null);

  const history = data.rounds.filter((r) => r.chess960);

  useEffect(() => {
    try {
      localStorage.setItem(PUBLIC_THEME_KEY, theme);
    } catch {
      // Private browsing / storage disabled — theme just won't persist.
    }
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem(PUBLIC_PIECE_THEME_KEY, pieceTheme);
    } catch {
      // Same as above — non-fatal.
    }
  }, [pieceTheme]);
  useEffect(() => {
    if (!history.length) return;
    setSelectedRound((prev) =>
      prev === null ? history[history.length - 1].round : prev,
    );
  }, [history.length]);

  const current =
    history.find((r) => r.round === selectedRound)?.chess960 ??
    data.currentChess960;

  return (
    <>
      <div className="pv-card c960-page">
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
              <span className="pv-status">
                Round {selectedRound ?? data.currentRound}
              </span>
            )}
          </div>
        </div>

        {!current ? (
          <p className="pv-empty">
            A fresh random position is drawn each round — check back once
            pairings are up.
          </p>
        ) : (
          <div className="c960-current-layout">
            <ChessBoard
              backRank={current.backRank}
              size={420}
              theme={theme}
              pieceTheme={pieceTheme}
            />
            <div className="c960-meta">
              {current.id != null && (
                <p className="c960-position-id">Position #{current.id}</p>
              )}
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
                Every board in Round {selectedRound ?? data.currentRound} starts
                from this position.
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
    </>
  );
}

const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};

// Read-only preview for the round that's still in progress — no click
// handlers, no result entry. Deliberately mirrors RoundHistory.jsx's exact
// markup/classes (team-match-card, pairing-table, board-num, color dots,
// bye-result, etc.) re-skinned into the warm palette in PublicResults.css,
// so a live round and a finished round look identical in every way except
// the result column. Once the round is decided it moves into `rounds` and
// the real RoundHistory component takes over — same look, same classes.
function CurrentRoundPreview({ format, pairings }) {
  if (format === "team") {
    return (
      <div className="team-matches">
        {pairings.map((p) => (
          <div className="team-match-card" key={p.idx}>
            {p.type === "bye" ? (
              <div className="team-match-bye">
                <span className="player-name">{p.teamName}</span>
                <span className="bye-result">BYE — full team +1 each</span>
              </div>
            ) : (
              <>
                <div className="team-match-header">
                  <span className="team-tag white">{p.teamWhiteName}</span>
                  <span className="vs">vs</span>
                  <span className="team-tag black">{p.teamBlackName}</span>
                </div>
                <table className="pairing-table board-table">
                  <thead>
                    <tr>
                      <th className="board-num">Bd</th>
                      <th>White</th>
                      <th>Black</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.boards.map((b) => (
                      <tr key={b.boardNum}>
                        <td className="board-num">{b.boardNum}</td>
                        {b.sitOut ? (
                          <td colSpan={3}>
                            <span className="player-name">
                              {(b.white || b.black)?.name}
                            </span>
                            <span className="bye-result"> sits out</span>
                          </td>
                        ) : (
                          <>
                            <td>
                              <span className="color-w" />
                              <span className="player-name">
                                {b.white?.name}
                              </span>
                            </td>
                            <td>
                              <span className="color-b" />
                              <span className="player-name">
                                {b.black?.name}
                              </span>
                            </td>
                            <td>
                              <span className="pv-pending">to be played</span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <table className="pairing-table">
      <thead>
        <tr>
          <th className="board-num">#</th>
          <th>White</th>
          <th>Black</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {pairings.map((p, i) => (
          <tr key={p.idx}>
            {p.type === "bye" ? (
              <>
                <td className="board-num">—</td>
                <td colSpan={2}>
                  <span className="player-name">{p.playerName}</span>
                </td>
                <td>
                  <span className="bye-result">BYE (+1)</span>
                </td>
              </>
            ) : (
              <>
                <td className="board-num">{i + 1}</td>
                <td>
                  <span className="color-w" />
                  <span className="player-name">{p.whiteName}</span>
                </td>
                <td>
                  <span className="color-b" />
                  <span className="player-name">{p.blackName}</span>
                </td>
                <td>
                  <span className="pv-pending">to be played</span>
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PublicResults() {
  const { token } = useParams();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selectedRound, setSelectedRound] = useState(null); // number, or "current"

  useEffect(() => {
    api
      .getPublicResults(token)
      .then((d) => {
        setData(d);
        setSelectedRound(
          d.currentPairings ? "current" : (d.rounds.at(-1)?.round ?? null),
        );
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  if (loadError) {
    return (
      <div className="pv-root">
        <div className="pv-bg" aria-hidden="true">
          <div className="pv-bg-scene" />
          <div className="pv-bg-scene" />
          <div className="pv-bg-scene" />
        </div>
        <div className="pv-shell">
          <div className="pv-closed">
            <h2>Link not found</h2>
            <p>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pv-root">
        <div className="pv-bg" aria-hidden="true">
          <div className="pv-bg-scene" />
          <div className="pv-bg-scene" />
          <div className="pv-bg-scene" />
        </div>
        <div className="pv-shell">
          <p className="pv-meta">Loading…</p>
        </div>
      </div>
    );
  }

  const isTeam = data.format === "team";
  const isElimination =
    data.system === "single_elimination" ||
    data.system === "double_elimination";
  const hasAnyRounds = data.rounds.length > 0 || data.currentPairings;

  return (
    <div className="pv-root">
      <div className="pv-bg" aria-hidden="true">
        <div className="pv-bg-scene" />
        <div className="pv-bg-scene" />
        <div className="pv-bg-scene" />
      </div>

      <div className="pv-shell">
        <span className="pv-eyebrow">
          {SYSTEM_LABEL[data.system] || data.system} · Live Results
        </span>
        <h1 className="pv-title">{data.name}</h1>
        <p className="pv-meta">
          {data.federation && <span>{data.federation}</span>}
          {data.timeControl && <span>{data.timeControl}</span>}
          {data.dateFrom && (
            <span>
              {data.dateFrom}
              {data.dateTo && data.dateTo !== data.dateFrom
                ? ` – ${data.dateTo}`
                : ""}
            </span>
          )}
          {isElimination ? (
            data.bracket && (
              <span>
                Bracket size: {data.bracket.size}
                {data.bracket.champion ? "" : ` · Round ${data.currentRound}`}
              </span>
            )
          ) : (
            <span>
              Round {data.currentRound} / {data.totalRounds}
            </span>
          )}
          <span className={`pv-status pv-status-${data.status}`}>
            {data.status}
          </span>
        </p>

        {data.status === "finished" && data.winner && (
          <div className="pv-champion-banner">
            🏆 <strong>{data.winner}</strong> won this tournament
          </div>
        )}

        {data.chess960 && !isElimination && <Chess960Section data={data} />}

        {isElimination ? (
          data.bracket ? (
            <div className="bx-page">
              <BracketCanvas
                bracket={data.bracket}
                isDouble={data.system === "double_elimination"}
                format={data.format}
                onOpenMatch={() => {}}
              />
            </div>
          ) : (
            <div className="pv-card">
              <p className="pv-empty">The bracket hasn't been drawn yet.</p>
            </div>
          )
        ) : hasAnyRounds ? (
          <div className="pv-card">
            <div className="pv-round-picker">
              {data.currentPairings && (
                <button
                  type="button"
                  className={`pv-round-pill${selectedRound === "current" ? " active" : ""}`}
                  onClick={() => setSelectedRound("current")}
                >
                  <span className="pv-round-pill-label">Round</span>
                  <span className="pv-round-pill-number">
                    {data.currentRound}
                  </span>
                  <span className="pv-round-pill-tag">Live</span>
                </button>
              )}
              {[...data.rounds].reverse().map((r) => (
                <button
                  key={r.round}
                  type="button"
                  className={`pv-round-pill${selectedRound === r.round ? " active" : ""}`}
                  onClick={() => setSelectedRound(r.round)}
                >
                  <span className="pv-round-pill-label">Round</span>
                  <span className="pv-round-pill-number">{r.round}</span>
                </button>
              ))}
            </div>

            {selectedRound === "current" ? (
              <CurrentRoundPreview
                format={data.format}
                pairings={data.currentPairings}
              />
            ) : (
              <RoundHistory
                format={data.format}
                round={data.rounds.find((r) => r.round === selectedRound)}
              />
            )}
          </div>
        ) : (
          <div className="pv-card">
            <p className="pv-empty">
              Pairings will appear here once Round 1 is generated.
            </p>
          </div>
        )}

        {data.standings.length > 0 && (
          <>
            <div className="pv-two-col">
              <div className="pv-card">
                <h2>Standings</h2>
                {isTeam && data.teamStandings ? (
                  <TeamStandingsTable teamStandings={data.teamStandings} />
                ) : (
                  <StandingsTable standings={data.standings} />
                )}
              </div>
              <div className="pv-card pv-cross-card">
                <h2>Cross Table</h2>
                <CrossTable crossTable={data.crossTable} />
              </div>
            </div>

            {isTeam && (
              <div className="pv-card">
                <h2>Individual Board Standings</h2>
                <StandingsTable
                  standings={data.standings}
                  showTiebreaks={false}
                  showTeam
                />
              </div>
            )}
          </>
        )}

        <p className="pv-footnote">Read-only view — shared by the organizer.</p>
      </div>
    </div>
  );
}
