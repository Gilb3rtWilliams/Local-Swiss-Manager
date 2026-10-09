import { useEffect, useRef, useState } from "react";

// Width of an element, capped at `max` — lets the Chess960 board shrink to fit
// a phone instead of overflowing at a fixed 420px.
function useFitWidth(max) {
  const ref = useRef(null);
  const [w, setW] = useState(max);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () =>
      setW(Math.max(200, Math.min(max, Math.floor(el.clientWidth))));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return [ref, w];
}
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import TournamentDetailsCard from "../components/TournamentDetailsCard.jsx";
import StartingRank from "./tournament/StartingRank.jsx";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
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

  const [boardRef, boardSize] = useFitWidth(420);
  const current =
    history.find((r) => r.round === selectedRound)?.chess960 ??
    data.currentChess960;

  return (
    <>
      <div className="pv-card c960-page">
        <div className="section-header">
          <h2>Chess960 Starting Position</h2>
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
          <div className="c960-current-layout" ref={boardRef}>
            <ChessBoard
              backRank={current.backRank}
              size={boardSize}
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
function CageMatchSection({ cm, history, performance, extrasError, view }) {
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
    background: "var(--tp-surface, #1a1a24)",
    border: "1px solid var(--tp-border-strong, #353545)",
    color: "var(--tp-text, #e8e8e8)",
    padding: "6px 12px",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div className="cm-root">
      {view === "match" && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              gap: 10,
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
                Scores are level at {cm.tieAlert.scoreA}–{cm.tieAlert.scoreB}{" "}
                across every section. The tiebreak mini-match will begin
                shortly.
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
                          {game.whiteName}{" "}
                          <span className="cm-vs-tiny">vs</span>{" "}
                          {game.blackName}
                        </span>
                        <span
                          className={`cm-game-status cm-status-${game.status}`}
                        >
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
                  {cm.tiebreak.miniMatch.score.A} –{" "}
                  {cm.tiebreak.miniMatch.score.B}
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

              {cm.tiebreak.status === "armageddon" &&
                cm.tiebreak.armageddon && (
                  <PublicArmageddonPanel armageddon={cm.tiebreak.armageddon} />
                )}
            </div>
          )}
        </>
      )}

      {view === "history" && (
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
      )}

      {view === "performance" && (
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
      )}
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

// The live round's payload (data.currentPairings) names team-board players as
// objects (b.white.name) while completed rounds use flat fields
// (b.whiteName), so reshape it once and let RoundHistory draw both — an
// unfinished round then looks exactly like a finished one. Saved results are
// kept: RoundHistory's `partial` mode shows them game by game.
function toHistoryShape(format, pairings) {
  if (format !== "team") return { pairings };
  return {
    pairings: pairings.map((p) =>
      p.type === "bye"
        ? p
        : {
            ...p,
            boards: (p.boards || []).map((b) => ({
              ...b,
              whiteName: b.whiteName ?? b.white?.name,
              blackName: b.blackName ?? b.black?.name,
              playerName: b.playerName ?? (b.white || b.black)?.name,
              result: b.result ?? null,
            })),
          },
    ),
  };
}

// An open round or one paired in advance: every game that has a saved result
// shows it, the rest show "vs" / "To be played".
function InProgressRound({ format, variant, pairings }) {
  let played = 0;
  let total = 0;
  (pairings || []).forEach((p) => {
    if (format === "team") {
      if (p.type !== "match") return;
      (p.boards || []).forEach((b) => {
        if (b.sitOut) return;
        total += 1;
        if (b.result) played += 1;
      });
    } else if (p.type === "individual") {
      total += 1;
      if (p.result) played += 1;
    }
  });
  return (
    <>
      {total > 0 && (
        <p className="pv-note-lead">
          {played} of {total} game{total === 1 ? "" : "s"} reported
        </p>
      )}
      <RoundHistory
        format={format}
        variant={variant}
        round={toHistoryShape(format, pairings || [])}
        partial
      />
    </>
  );
}

export default function PublicResults() {
  const { token } = useParams();
  const [theme, setTheme] = useTheme();

  // Which view the sidebar is showing. Kept in the URL (?view=…) so a refresh
  // or a shared link opens the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  // Selected board chip in "Board Rankings" (a board number, or "all").
  const [boardSel, setBoardSel] = useState(null);

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
  // A number can also name a round that was paired in advance (it hasn't been
  // played, so there are no standings "as of" it) — only a genuinely earlier
  // COMPLETED round triggers the snapshot lookup.
  const isViewingPastRound =
    typeof selectedRound === "number" &&
    selectedRound !== latestCompletedRound &&
    Boolean(data?.rounds?.some((r) => r.round === selectedRound));

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
      <div className="pv-root tp-theme" data-theme={theme}>
        <div className="pv-shell">
          <div className="pv-closed">
            <h2>Link not found</h2>
            <p>{loadError}</p>
            <Link
              to="/tournaments"
              className="pv-back-link"
              style={{ marginTop: 16 }}
            >
              ← Back to Past &amp; Live Tournaments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pv-root tp-theme" data-theme={theme}>
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
  // Rounds the organizer has already paired ahead of the open one, newest
  // first (the same order the picker lists completed rounds in).
  const queuedRounds = data.queuedRounds || [];
  const selectedQueued =
    typeof selectedRound === "number"
      ? queuedRounds.find((q) => q.round === selectedRound)
      : null;
  const hasStandings = !isMatch && (data.standings?.length ?? 0) > 0;
  const boardRankings = data.boardRankings || [];

  // ── Sidebar sections ──────────────────────────────────────────────────
  // Which views exist depends on the kind of tournament. A section marked
  // `disabled` stays visible (so spectators know it exists) but can't be
  // opened for the round currently being viewed.
  const sections = [];
  if (isMatch) {
    sections.push({ id: "match", label: "Match" });
    sections.push({ id: "history", label: "Game History" });
    sections.push({ id: "performance", label: "Section Performance" });
  } else {
    // Tournament details + starting rank — what the organizer sees on the
    // admin "Tournament" and "Starting Rank" tabs, in one read-only view.
    // Not offered for cage matches: they have no rounds or seeding, so the
    // details card's format/rounds fields don't apply to them.
    sections.push({ id: "overview", label: "Overview" });
    sections.push(
      isElimination
        ? { id: "bracket", label: "Bracket" }
        : { id: "pairings", label: "Pairings" },
    );
    if (data.chess960 && !isElimination) {
      sections.push({ id: "chess960", label: "Chess960" });
    }
    if (hasStandings) {
      sections.push({
        id: "standings",
        label: isTeam ? "Team Standings" : "Standings",
      });
      sections.push({ id: "cross-table", label: "Cross Table" });
      if (isTeam) {
        sections.push({ id: "board-standings", label: "Board Standings" });
        if (boardRankings.length > 0) {
          sections.push({
            id: "board-rankings",
            label: "Board Rankings",
            disabled: isViewingPastRound,
            disabledReason: "Only available for the latest round",
          });
        }
      }
    }
  }

  // Default view: the Overview (tournament details + starting rank) for
  // every tournament that has one; cage matches fall back to their first
  // section. A URL naming a view that doesn't exist here (or that's
  // unavailable for the round being viewed) falls back to the default.
  const requestedId = searchParams.get("view");
  const defaultSection =
    sections.find((sec) => sec.id === "overview") ||
    (data.status === "finished" &&
      sections.find((sec) => sec.id === "standings")) ||
    sections[0];
  const activeSection =
    sections.find((sec) => sec.id === requestedId && !sec.disabled) ||
    defaultSection;
  const activeId = activeSection.id;

  const activeBoard =
    boardSel === "all"
      ? "all"
      : boardRankings.some((b) => b.boardNum === boardSel)
      ? boardSel
      : boardRankings[0]?.boardNum ?? "all";

  function selectSection(id) {
    const next = new URLSearchParams(searchParams);
    next.set("view", id);
    setSearchParams(next, { replace: true });
  }

  // Round picker applies to everything except cage matches (no rounds) and
  // brackets (no round-by-round pairings).
  const showRoundPicker =
    !isMatch && !isElimination && hasAnyRounds && activeId !== "overview";

  const displayStandings = isViewingPastRound
    ? standingsSnapshot?.standings
    : data.standings;
  const displayTeamStandings = isViewingPastRound
    ? standingsSnapshot?.teamStandings
    : data.teamStandings;
  const displayCrossTable = isViewingPastRound
    ? standingsSnapshot?.crossTable
    : data.crossTable;

  const pastBadge = isViewingPastRound ? (
    <span className="pv-status" style={{ marginLeft: 10 }}>
      as of Round {selectedRound}
    </span>
  ) : null;

  const basePath = `/results/${token}`;
  const needsStandingsData = [
    "standings",
    "cross-table",
    "board-standings",
    "board-rankings",
  ].includes(activeId);

  // The standings-backed views all wait on the same past-round fetch.
  let standingsGate = null;
  if (needsStandingsData && isViewingPastRound) {
    if (standingsError && !standingsLoading) {
      standingsGate = <p className="pv-empty">{standingsError}</p>;
    } else if (!standingsTablesReady) {
      standingsGate = (
        <p className="pv-empty">
          Loading standings after Round {selectedRound}…
        </p>
      );
    }
  }

  function renderPane() {
    switch (activeId) {
      case "overview":
        return (
          <>
            <TournamentDetailsCard t={data} />
            <StartingRank t={data} basePath={basePath} />
          </>
        );

      case "match":
      case "history":
      case "performance":
        return data.cageMatch ? (
          <CageMatchSection
            cm={data.cageMatch}
            history={cageHistory}
            performance={cagePerformance}
            extrasError={cageExtrasError}
            view={activeId}
          />
        ) : (
          <Panel title="Match">
            <p className="pv-empty">
              This match type isn't supported for public viewing yet.
            </p>
          </Panel>
        );

      case "bracket":
        return data.bracket ? (
          <div className="bx-page">
            <BracketCanvas
              bracket={data.bracket}
              isDouble={data.system === "double_elimination"}
              format={data.format}
              onOpenMatch={() => {}}
            />
          </div>
        ) : (
          <Panel title="Bracket">
            <p className="pv-empty">The bracket hasn't been drawn yet.</p>
          </Panel>
        );

      case "chess960":
        return <Chess960Section data={data} />;

      case "pairings":
        return hasAnyRounds ? (
          <Panel
            title="Pairings"
            badge={
              <span className="pv-status" style={{ marginLeft: 10 }}>
                Round{" "}
                {selectedRound === "current"
                  ? data.currentRound
                  : selectedRound}
                {selectedQueued ? " · Upcoming" : ""}
              </span>
            }
          >
            {selectedRound === "current" ? (
              <InProgressRound
                format={data.format}
                variant={data.variant}
                pairings={data.currentPairings}
              />
            ) : selectedQueued ? (
              <>
                <p className="pv-note-lead">
                  Round {selectedQueued.round} hasn't started yet — these
                  pairings were made in advance. Results show up as games are
                  reported, and count towards the standings once the round has
                  been played.
                </p>
                <InProgressRound
                  format={data.format}
                  variant={data.variant}
                  pairings={selectedQueued.pairings}
                />
              </>
            ) : (
              <RoundHistory
                format={data.format}
                round={data.rounds.find((r) => r.round === selectedRound)}
              />
            )}
          </Panel>
        ) : (
          <Panel title="Pairings">
            <p className="pv-empty">
              Pairings will appear here once Round 1 is generated.
            </p>
          </Panel>
        );

      case "standings":
        return (
          <Panel
            title={isTeam ? "Team Standings" : "Standings"}
            badge={pastBadge}
          >
            {standingsGate ||
              (isTeam && displayTeamStandings ? (
                <TeamStandingsTable
                  teamStandings={displayTeamStandings}
                  basePath={basePath}
                />
              ) : (
                <StandingsTable
                  standings={displayStandings}
                  basePath={basePath}
                />
              ))}
          </Panel>
        );

      case "cross-table":
        return (
          <Panel title="Cross Table" badge={pastBadge}>
            {standingsGate || (
              <CrossTable
                crossTable={displayCrossTable}
                basePath={basePath}
                isTeam={isTeam}
              />
            )}
          </Panel>
        );

      case "board-standings":
        return (
          <Panel title="Individual Board Standings" badge={pastBadge}>
            {standingsGate || (
              <StandingsTable
                standings={displayStandings}
                showTiebreaks={false}
                showTeam
                basePath={basePath}
              />
            )}
          </Panel>
        );

      case "board-rankings":
        // Every player ranked against only the others who played the same
        // board number, across all teams. Live view only: boardRankings
        // isn't carried by the past-round snapshot endpoint.
        return (
          <Panel
            title="Board Rankings"
            note="Every player ranked against everyone else who played the same board number, across all teams."
          >
            <div className="pv-chips" role="tablist" aria-label="Board">
              {boardRankings.map((board) => (
                <button
                  key={board.boardNum}
                  type="button"
                  role="tab"
                  aria-selected={board.boardNum === activeBoard}
                  className={`pv-chip${
                    board.boardNum === activeBoard ? " is-active" : ""
                  }`}
                  onClick={() => setBoardSel(board.boardNum)}
                >
                  Board {board.boardNum}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={activeBoard === "all"}
                className={`pv-chip${
                  activeBoard === "all" ? " is-active" : ""
                }`}
                onClick={() => setBoardSel("all")}
              >
                All boards
              </button>
            </div>
            {boardRankings
              .filter(
                (board) =>
                  activeBoard === "all" || board.boardNum === activeBoard,
              )
              .map((board, i) => (
                <div
                  key={board.boardNum}
                  style={{ marginTop: i === 0 ? 0 : 28 }}
                >
                  {activeBoard === "all" && (
                    <h3 className="pv-subhead">Board {board.boardNum}</h3>
                  )}
                  <StandingsTable
                    standings={board.players}
                    showTiebreaks={false}
                    showTeam
                    basePath={basePath}
                  />
                </div>
              ))}
          </Panel>
        );

      default:
        return null;
    }
  }

  return (
    <div className="pv-root tp-theme" data-theme={theme}>
      <div className="pv-shell">
        <div className="pv-topbar">
          <Link to="/tournaments" className="pv-back-link">
            ← Back to Past &amp; Live Tournaments
          </Link>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>

        {/* Header — tournament identity. The full details live in the
            Overview view below. */}
        <header className="pv-header">
          <span className="pv-eyebrow">
            {isMatch ? "Cage Match" : SYSTEM_LABEL[data.system] || data.system}{" "}
            · Live Results
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
                    {data.bracket.champion
                      ? ""
                      : ` · Round ${data.currentRound}`}
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
        </header>

        {showRoundPicker && (
          <div className="pv-toolbar">
            <span className="pv-toolbar-label">Viewing</span>
            <div className="pv-round-picker">
              {/* Rounds paired ahead of time — only meaningful for the
                  Pairings view, so they're left out of the standings tabs. */}
              {activeId === "pairings" &&
                [...queuedRounds].reverse().map((q) => (
                  <button
                    key={q.round}
                    type="button"
                    className={`pv-round-pill${
                      selectedRound === q.round ? " active" : ""
                    }`}
                    onClick={() => setSelectedRound(q.round)}
                  >
                    <span className="pv-round-pill-label">Round</span>
                    <span className="pv-round-pill-number">{q.round}</span>
                    <span className="pv-round-pill-tag">Upcoming</span>
                  </button>
                ))}
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
          </div>
        )}

        <div className="pv-layout">
          <nav className="pv-nav" aria-label="Results views">
            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                disabled={sec.disabled}
                title={sec.disabled ? sec.disabledReason : undefined}
                aria-current={sec.id === activeId ? "page" : undefined}
                className={`pv-nav-item${
                  sec.id === activeId ? " is-active" : ""
                }`}
                onClick={() => selectSection(sec.id)}
              >
                <span>{sec.label}</span>
                {sec.disabled && <span className="pv-nav-tag">Live</span>}
              </button>
            ))}
          </nav>

          <main className="pv-pane">{renderPane()}</main>
        </div>

        <p className="pv-footnote">Read-only view — shared by the organizer.</p>
      </div>
    </div>
  );
}

// One titled card in the content pane. `badge` is the optional round pill
// shown next to the title; `note` is a one-line explainer under it.
function Panel({ title, badge, note, children }) {
  return (
    <section className="pv-card">
      <h2>
        {title}
        {badge}
      </h2>
      {note && <p className="pv-note-lead">{note}</p>}
      {children}
    </section>
  );
}
