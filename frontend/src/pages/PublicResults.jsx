import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import RoundHistory from "../components/RoundHistory.jsx";
import BracketCanvas from "../components/BracketCanvas.jsx";
import ChessBoard from "../components/ChessBoard.jsx";
import MoveEntryBoard from "../components/MoveEntryBoard.jsx";
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
import "../css/CageMatch.css";

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

// ── Cage Match (read-only) ──────────────────────────────────────────────
// Same result-code vocabulary the organizer's Cagematch.jsx uses — kept in
// sync manually since the two pages don't currently share a constants
// module (same convention as CHESS_TITLES elsewhere in this app).
const RESULT_OPTIONS = [
  { value: "", label: "—" },
  { value: "1-0", label: "1–0 (White wins)" },
  { value: "0-1", label: "0–1 (Black wins)" },
  { value: "1/2-1/2", label: "½–½ (Draw)" },
  { value: "1F-0F", label: "1F–0F (Black forfeits)" },
  { value: "0F-1F", label: "0F–1F (White forfeits)" },
  { value: "0F-0F", label: "0F–0F (Double forfeit)" },
];

function resultLabel(result) {
  const opt = RESULT_OPTIONS.find((o) => o.value === result);
  return opt ? opt.label : result;
}

function fideProfileUrl(fideId) {
  return `https://ratings.fide.com/profile/${fideId}`;
}

function CompetitorMeta({ competitor }) {
  const hasRating =
    competitor.rating !== null && competitor.rating !== undefined;
  const hasFideId = Boolean(competitor.fideId);
  if (!hasRating && !hasFideId) return null;

  return (
    <div className="cm-competitor-meta">
      {hasRating && (
        <span className="cm-competitor-rating">{competitor.rating}</span>
      )}
      {hasRating && hasFideId && (
        <span className="cm-competitor-meta-sep">·</span>
      )}
      {hasFideId && (
        <a
          href={fideProfileUrl(competitor.fideId)}
          target="_blank"
          rel="noopener noreferrer"
          className="cm-competitor-fideid-link"
        >
          FIDE {competitor.fideId}
        </a>
      )}
    </div>
  );
}

// No upload affordance — a spectator just sees whatever picture is set.
function PublicAvatar({ competitor }) {
  return (
    <div className="cm-avatar-wrap">
      {competitor.pictureUrl ? (
        <img className="cm-avatar" src={competitor.pictureUrl} alt="" />
      ) : (
        <div className="cm-avatar cm-avatar-placeholder">🎓</div>
      )}
    </div>
  );
}

// Read-only counterpart to Cagematch.jsx's ArmageddonPanel — no bid inputs,
// no result picker. Bids themselves are only ever non-null once the backend
// has moved past "awaiting_bids" (see cageMatch.js's serialize()), so this
// never risks showing one side's bid while the other is still sealed.
function PublicArmageddonPanel({ armageddon }) {
  if (
    armageddon.status === "awaiting_bids" ||
    armageddon.status === "bid_tie"
  ) {
    return (
      <div className="cm-armageddon-panel">
        <h4>Armageddon</h4>
        <p className="cm-hint">
          {armageddon.status === "bid_tie"
            ? "That pair of sealed bids came out tied — the arbiter is collecting a fresh pair."
            : "The arbiter is collecting sealed bids from both players to determine colors — check back shortly."}
        </p>
      </div>
    );
  }

  if (armageddon.status === "awaiting_result") {
    return (
      <div className="cm-armageddon-panel">
        <h4>Armageddon</h4>
        <p className="cm-armageddon-reveal">
          <strong>{armageddon.whiteName}</strong> plays White (bid{" "}
          {armageddon.bidA < armageddon.bidB
            ? armageddon.bidB
            : armageddon.bidA}
          s) · <strong>{armageddon.blackName}</strong> plays Black with draw
          odds (bid{" "}
          {armageddon.bidA < armageddon.bidB
            ? armageddon.bidA
            : armageddon.bidB}
          s)
        </p>
        <p className="cm-hint">Game in progress — result pending.</p>
      </div>
    );
  }

  // complete
  return (
    <div className="cm-armageddon-panel">
      <h4>Armageddon — Recorded</h4>
      <p>
        {armageddon.whiteName} (White) vs {armageddon.blackName} (Black):{" "}
        {resultLabel(armageddon.result)}
      </p>
    </div>
  );
}

// Read-only counterpart to the organizer's Cage Match tab (Cagematch.jsx).
// Reuses that page's exact cm-* classes/CSS (imported above) so a spectator
// sees the identical scoreboard/section/tiebreak look — just without any
// edit affordances: no avatar upload, no competitor-detail editing, no
// result entry. The board is always MoveEntryBoard with disabled — it still
// replays whatever moves the organizer has entered, it just isn't
// clickable. Board/piece theme choice is shared with Chess960Section above
// via the same PUBLIC_THEME_KEY/PUBLIC_PIECE_THEME_KEY — the two sections
// never render for the same tournament, so there's no risk of them
// colliding.
function CageMatchSection({ cm, history, performance, extrasError }) {
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
  const [openGameKey, setOpenGameKey] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(PUBLIC_THEME_KEY, theme);
    } catch {
      // Private browsing / storage disabled — non-fatal.
    }
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem(PUBLIC_PIECE_THEME_KEY, pieceTheme);
    } catch {
      // Same as above.
    }
  }, [pieceTheme]);

  function toggleBoard(key) {
    setOpenGameKey((prev) => (prev === key ? null : key));
  }

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
    <div className="cm-root">
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
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
      </div>

      <div className="cm-scoreboard">
        <div className="cm-competitor">
          <PublicAvatar competitor={cm.competitors.A} />
          <div className="cm-competitor-info">
            <span className="cm-competitor-name">
              {cm.competitors.A.title && (
                <span className="cm-competitor-title-badge">
                  {cm.competitors.A.title}
                </span>
              )}
              {cm.competitors.A.name}
            </span>
            <CompetitorMeta competitor={cm.competitors.A} />
          </div>
        </div>
        <div className="cm-score">
          <span className="cm-score-num">{cm.score.A}</span>
          <span className="cm-score-sep">–</span>
          <span className="cm-score-num">{cm.score.B}</span>
        </div>
        <div className="cm-competitor">
          <PublicAvatar competitor={cm.competitors.B} />
          <div className="cm-competitor-info">
            <span className="cm-competitor-name">
              {cm.competitors.B.title && (
                <span className="cm-competitor-title-badge">
                  {cm.competitors.B.title}
                </span>
              )}
              {cm.competitors.B.name}
            </span>
            <CompetitorMeta competitor={cm.competitors.B} />
          </div>
        </div>
      </div>

      {cm.status === "finished" && (
        <div className="cm-winner-banner">
          🏆 {cm.winnerName} wins the match!
        </div>
      )}

      {cm.tieAlert && !cm.tiebreak && (
        <div className="cm-tie-banner">
          <span>
            Scores are level at {cm.tieAlert.scoreA}–{cm.tieAlert.scoreB} across
            every section. The tiebreak mini-match will begin shortly.
          </span>
        </div>
      )}

      {cm.sections.map((section) => (
        <div className="cm-section-card" key={section.id}>
          <div className="cm-section-head">
            <h3>{section.label}</h3>
            <span className="cm-section-meta">
              {section.variant === "chess960" ? "Chess960" : "Standard"}
              {section.timeControl ? ` · ${section.timeControl}` : ""}
            </span>
          </div>

          <div className="cm-game-list">
            {section.games.map((game) => {
              const key = `${section.id}:${game.id}`;
              const isOpen = openGameKey === key;
              return (
                <div className="cm-game-row-wrap" key={game.id}>
                  <div className="cm-game-row cm-public-row">
                    <span className="cm-game-num">#{game.gameNum}</span>
                    <span className="cm-game-players">
                      {game.whiteName} <span className="cm-vs-tiny">vs</span>{" "}
                      {game.blackName}
                    </span>
                    <span className={`cm-game-status cm-status-${game.status}`}>
                      {game.result
                        ? resultLabel(game.result)
                        : game.status === "in_progress"
                        ? "In progress"
                        : "Pending"}
                    </span>
                    <button
                      type="button"
                      className="cm-toggle-board"
                      onClick={() => toggleBoard(key)}
                    >
                      {isOpen ? "Hide Board" : "Open Board"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="cm-board-panel">
                      <MoveEntryBoard
                        game={game}
                        disabled
                        theme={theme}
                        pieceTheme={pieceTheme}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {cm.tiebreak && (
        <div className="cm-section-card cm-tiebreak-card">
          <div className="cm-section-head">
            <h3>Tiebreak — Mini-Match (first to 2.5 points)</h3>
            <span className="cm-section-meta">
              {cm.tiebreak.miniMatch.score.A} – {cm.tiebreak.miniMatch.score.B}
            </span>
          </div>

          <div className="cm-game-list">
            {cm.tiebreak.miniMatch.games.map((game) => (
              <div className="cm-game-row" key={game.id}>
                <span className="cm-game-num">#{game.gameNum}</span>
                <span className="cm-game-players">
                  {game.whiteName} <span className="cm-vs-tiny">vs</span>{" "}
                  {game.blackName}
                </span>
                <span className={`cm-game-status cm-status-${game.status}`}>
                  {game.result ? resultLabel(game.result) : "Pending"}
                </span>
              </div>
            ))}
          </div>

          {cm.tiebreak.status === "armageddon" && cm.tiebreak.armageddon && (
            <PublicArmageddonPanel armageddon={cm.tiebreak.armageddon} />
          )}
        </div>
      )}

      <div className="cm-section-card">
        <div className="cm-section-head">
          <h3>Game History</h3>
        </div>
        {extrasError ? (
          <p className="cm-error">{extrasError}</p>
        ) : !history ? (
          <p className="cm-hint">Loading…</p>
        ) : history.length === 0 ? (
          <p className="cm-hint">No games played yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>#</th>
                <th>White</th>
                <th>Black</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((g) => (
                <tr key={g.id}>
                  <td>{g.sectionLabel}</td>
                  <td>{g.gameNum}</td>
                  <td>{g.whiteName}</td>
                  <td>{g.blackName}</td>
                  <td>
                    {g.result
                      ? resultLabel(g.result)
                      : g.status === "in_progress"
                      ? "In progress"
                      : "Pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="cm-section-card">
        <div className="cm-section-head">
          <h3>Section Performance</h3>
        </div>
        {extrasError ? (
          <p className="cm-error">{extrasError}</p>
        ) : !performance ? (
          <p className="cm-hint">Loading…</p>
        ) : performance.length === 0 ? (
          <p className="cm-hint">No sections yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>{cm.competitors.A.name}</th>
                <th>{cm.competitors.B.name}</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((s) => (
                <tr key={s.sectionId}>
                  <td>{s.label}</td>
                  <td>
                    {s.A.wins}-{s.A.losses}-{s.A.draws} ({s.A.points} pts)
                  </td>
                  <td>
                    {s.B.wins}-{s.B.losses}-{s.B.draws} ({s.B.points} pts)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
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

  // The pairings pill picker above already lets a spectator jump to any
  // past round — this reuses that exact same selection to drive the
  // standings/cross-table section too, instead of a second independent
  // control. "current" (the in-progress round) and the most recently
  // completed round both just show the live data already in `data` (no
  // fetch needed); only a genuinely earlier round triggers a lookup.
  const latestCompletedRound = data?.rounds?.at(-1)?.round ?? null;
  const isViewingPastRound =
    typeof selectedRound === "number" && selectedRound !== latestCompletedRound;

  const [standingsSnapshot, setStandingsSnapshot] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState("");

  // True only once standingsSnapshot actually corresponds to the round
  // that's currently selected. Right after clicking a past-round pill,
  // isViewingPastRound flips to true on that same render, before this
  // effect has had a chance to run — so standingsSnapshot/standingsLoading
  // are still whatever they were before. Checking .round here (instead of
  // just !standingsLoading) is what keeps that transient render from
  // handing StandingsTable/CrossTable an undefined array and crashing.
  const standingsMatchSelection =
    standingsSnapshot &&
    !standingsLoading &&
    standingsSnapshot.round === selectedRound;

  useEffect(() => {
    if (!isViewingPastRound) {
      setStandingsSnapshot(null);
      setStandingsError("");
      return;
    }
    let cancelled = false;
    setStandingsLoading(true);
    setStandingsError("");
    api
      .getPublicStandingsAtRound(token, selectedRound)
      .then((snap) => {
        if (!cancelled) setStandingsSnapshot(snap);
      })
      .catch((e) => {
        if (!cancelled) setStandingsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setStandingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedRound, isViewingPastRound]);

  const standingsTablesReady = !isViewingPastRound || standingsMatchSelection;

  const [cageHistory, setCageHistory] = useState(null);
  const [cagePerformance, setCagePerformance] = useState(null);
  const [cageExtrasError, setCageExtrasError] = useState("");

  // Game History / Section Performance aren't part of the main
  // getPublicResults payload (same split as the admin side, where they're
  // separate tabs backed by separate routes) — fetch them once we know
  // this is actually a cage match.
  useEffect(() => {
    if (!data || data.format !== "match") return;
    let cancelled = false;
    setCageExtrasError("");
    Promise.all([
      api.getPublicCageMatchHistory(token),
      api.getPublicCageMatchSectionPerformance(token),
    ])
      .then(([history, performance]) => {
        if (cancelled) return;
        setCageHistory(history);
        setCagePerformance(performance);
      })
      .catch((e) => {
        if (!cancelled) setCageExtrasError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [data, token]);

  useEffect(() => {
    api
      .getPublicResults(token)
      .then((d) => {
        setData(d);
        // format === "match" tournaments don't have rounds/currentPairings —
        // see serializeMatchTournament() on the backend — so there's no
        // round to preselect for those.
        setSelectedRound(
          d.currentPairings ? "current" : d.rounds?.at(-1)?.round ?? null,
        );
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  // A cage match is the one format where a spectator expects to see moves
  // land live as the organizer enters them — everything else on this page
  // only changes round-to-round, which a manual refresh already covers
  // fine. Re-fetching `data` here also re-triggers the Game History/Section
  // Performance effect above (it depends on `data`), so both extras stay
  // live too. Stops once the match is finished — nothing left to update.
  useEffect(() => {
    if (!data || data.format !== "match" || data.status === "finished") {
      return;
    }
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      api
        .getPublicResults(token)
        .then(setData)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [token, data?.format, data?.status]);

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
  const isMatch = data.format === "match";
  const isElimination =
    data.system === "single_elimination" ||
    data.system === "double_elimination";
  const hasAnyRounds = (data.rounds?.length ?? 0) > 0 || !!data.currentPairings;

  return (
    <div className="pv-root">
      <div className="pv-bg" aria-hidden="true">
        <div className="pv-bg-scene" />
        <div className="pv-bg-scene" />
        <div className="pv-bg-scene" />
      </div>

      <div className="pv-shell">
        <span className="pv-eyebrow">
          {isMatch ? "Cage Match" : SYSTEM_LABEL[data.system] || data.system} ·
          Live Results
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
          {!isMatch &&
            (isElimination ? (
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
            ))}
          <span className={`pv-status pv-status-${data.status}`}>
            {data.status}
          </span>
        </p>

        {!isMatch && data.status === "finished" && data.winner && (
          <div className="pv-champion-banner">
            🏆 <strong>{data.winner}</strong> won this tournament
          </div>
        )}

        {data.chess960 && !isElimination && <Chess960Section data={data} />}

        {isMatch &&
          (data.cageMatch ? (
            <CageMatchSection
              cm={data.cageMatch}
              history={cageHistory}
              performance={cagePerformance}
              extrasError={cageExtrasError}
            />
          ) : (
            <div className="pv-card">
              <p className="pv-empty">
                This match type isn't supported for public viewing yet.
              </p>
            </div>
          ))}

        {!isMatch &&
          (isElimination ? (
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
                    className={`pv-round-pill${
                      selectedRound === "current" ? " active" : ""
                    }`}
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
                    className={`pv-round-pill${
                      selectedRound === r.round ? " active" : ""
                    }`}
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
          ))}

        {!isMatch &&
          isViewingPastRound &&
          !standingsError &&
          !standingsMatchSelection && (
            <div className="pv-card">
              <p className="pv-empty">
                Loading standings after Round {selectedRound}…
              </p>
            </div>
          )}

        {!isMatch &&
          isViewingPastRound &&
          !standingsLoading &&
          standingsError && (
            <div className="pv-card">
              <p className="pv-empty">{standingsError}</p>
            </div>
          )}

        {!isMatch &&
          (data.standings?.length ?? 0) > 0 &&
          standingsTablesReady && (
            <>
              <div className="pv-two-col">
                <div className="pv-card">
                  <h2>
                    Standings
                    {isViewingPastRound && (
                      <span className="pv-status" style={{ marginLeft: 10 }}>
                        as of Round {selectedRound}
                      </span>
                    )}
                  </h2>
                  {isTeam &&
                  (isViewingPastRound
                    ? standingsSnapshot?.teamStandings
                    : data.teamStandings) ? (
                    <TeamStandingsTable
                      teamStandings={
                        isViewingPastRound
                          ? standingsSnapshot.teamStandings
                          : data.teamStandings
                      }
                      basePath={`/results/${token}`}
                    />
                  ) : (
                    <StandingsTable
                      standings={
                        isViewingPastRound
                          ? standingsSnapshot?.standings
                          : data.standings
                      }
                      basePath={`/results/${token}`}
                    />
                  )}
                </div>
                <div className="pv-card pv-cross-card">
                  <h2>Cross Table</h2>
                  <CrossTable
                    crossTable={
                      isViewingPastRound
                        ? standingsSnapshot?.crossTable
                        : data.crossTable
                    }
                    basePath={`/results/${token}`}
                  />
                </div>
              </div>

              {isTeam && (
                <div className="pv-card">
                  <h2>Individual Board Standings</h2>
                  <StandingsTable
                    standings={
                      isViewingPastRound
                        ? standingsSnapshot?.standings
                        : data.standings
                    }
                    showTiebreaks={false}
                    showTeam
                    basePath={`/results/${token}`}
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
