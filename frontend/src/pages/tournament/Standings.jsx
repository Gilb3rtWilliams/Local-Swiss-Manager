import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../../api.js";
import StandingsTable from "../../components/StandingsTable.jsx";
import TeamStandingsTable from "../../components/TeamStandingsTable.jsx";
import CrossTable from "../../components/CrossTable.jsx";
import DeciderPanel from "../../components/DeciderPanel.jsx";
import "../../css/Standings.css";

// One titled card in the content pane. `badge` is the optional "as of Round N"
// pill shown when a past round is selected.
function Panel({ title, badge, note, children }) {
  return (
    <div
      style={{
        background: "var(--tp-bg, #13131a)",
        border: "1px solid var(--tp-border, #252532)",
        borderRadius: 12,
        padding: "24px",
        overflowX: "auto",
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--tp-text, #e8e8e8)",
          marginTop: 0,
          marginBottom: note ? 8 : 20,
          borderBottom: "1px solid var(--tp-border, #252532)",
          paddingBottom: 12,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {title}
        {badge}
      </h2>
      {note && (
        <p
          style={{
            margin: "0 0 20px",
            color: "var(--tp-muted, #8a8a9a)",
            fontSize: 12,
          }}
        >
          {note}
        </p>
      )}
      {children}
    </div>
  );
}

export default function Standings() {
  const { t, refresh } = useOutletContext();
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // Which view the sidebar is showing. Kept in the URL (?view=…) so a refresh
  // or a shared link opens the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  // Board picker inside "Board Rankings": null = first board.
  const [boardSel, setBoardSel] = useState(null);

  // Elimination brackets don't have a round-by-round standings table (see
  // tournamentService.js's standingsAtRound) — the picker below only makes
  // sense for Swiss/round-robin, and only once at least one round exists.
  const roundsPlayed = isElimination ? 0 : t.rounds?.length || 0;

  // null = always follow the live/current standings (t.standings etc, no
  // fetch needed). A specific number pins the view to that past round,
  // fetched from the standingsAtRound snapshot endpoint, and stays pinned
  // even if more rounds get generated while it's open — picking "Latest"
  // again is what un-pins it.
  const [viewRound, setViewRound] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");

  const isViewingPast = viewRound !== null && viewRound !== roundsPlayed;
  // True only once `snapshot` actually corresponds to `viewRound`. Right
  // after picking a past round, isViewingPast flips to true on the same
  // render the effect below hasn't run yet, so snapshot/snapshotLoading are
  // still whatever they were before — checking snapshot.round here (instead
  // of just !snapshotLoading) is what keeps that transient render from
  // handing StandingsTable an undefined array and crashing.
  const snapshotMatchesSelection =
    snapshot && !snapshotLoading && snapshot.round === viewRound;

  useEffect(() => {
    if (!isViewingPast) {
      setSnapshot(null);
      setSnapshotError("");
      return;
    }
    let cancelled = false;
    setSnapshotLoading(true);
    setSnapshotError("");
    api
      .getStandingsAtRound(t.id, viewRound)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((e) => {
        if (!cancelled) setSnapshotError(e.message);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.id, viewRound, isViewingPast]);

  const tablesReady = !isViewingPast || snapshotMatchesSelection;
  const displayStandings = isViewingPast ? snapshot?.standings : t.standings;
  const displayTeamStandings = isViewingPast
    ? snapshot?.teamStandings
    : t.teamStandings;
  const displayCrossTable = isViewingPast ? snapshot?.crossTable : t.crossTable;

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await api.downloadStandingsExport(t.id);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const hasResults = isElimination
    ? t.bracket &&
      t.bracket.matches.some(
        (m) => m.status === "complete" || m.status === "bye",
      )
    : t.rounds.length > 0;

  if (!hasResults) {
    const message = isElimination
      ? "Standings will appear once the first bracket match is decided."
      : "Standings will appear once Round 1 results are submitted.";
    return (
      <div
        style={{
          background: "var(--tp-bg, #13131a)",
          border: "1px solid var(--tp-border, #252532)",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "var(--tp-muted, #8a8a9a)",
          fontFamily: "'SF Mono', Monaco, monospace",
          fontSize: 14,
        }}
      >
        <p style={{ margin: 0 }}>{message}</p>
      </div>
    );
  }

  // ── Sidebar sections ──────────────────────────────────────────────────
  const boardRankings = t.boardRankings || [];
  const sections = [
    { id: "standings", label: isTeam ? "Team Standings" : "Standings" },
    { id: "cross-table", label: "Cross Table" },
  ];
  if (isTeam) {
    sections.push({ id: "board-standings", label: "Board Standings" });
    if (boardRankings.length > 0) {
      sections.push({
        id: "board-rankings",
        label: "Board Rankings",
        disabled: isViewingPast,
        disabledReason: "Only available for the latest round",
      });
    }
  }
  // Fall back to the first view if the URL names one that doesn't exist here
  // (or that's unavailable for the round being viewed).
  const requestedId = searchParams.get("view");
  const activeSection =
    sections.find((sec) => sec.id === requestedId && !sec.disabled) ||
    sections[0];
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

  const pastBadge = isViewingPast ? (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "none",
        color: "var(--tp-brass, #d4a853)",
        background: "rgba(var(--tp-accent-rgb, 212, 168, 83), 0.1)",
        border: "1px solid rgba(var(--tp-accent-rgb, 212, 168, 83), 0.25)",
        padding: "3px 8px",
        borderRadius: 6,
      }}
    >
      as of Round {viewRound}
    </span>
  ) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        color: "var(--tp-text, #e8e8e8)",
        background:
          "radial-gradient(circle at 50% 0%, var(--tp-surface-2, #1f1f2e) 0%, transparent 70%)",
        padding: "8px 0",
        borderRadius: "16px",
      }}
    >
      {/* Tiebreak decider: tie banner, or the in-progress/complete playoff
          itself. Renders nothing when there's neither a tie nor a decider. */}
      <DeciderPanel t={t} refresh={refresh} />

      {/* Top Bar with Export Action */}
      <div
        style={{
          display: "flex",
          justifyContent:
            isElimination || roundsPlayed > 0 ? "space-between" : "flex-end",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "0 4px",
        }}
      >
        {isElimination && (
          <p
            style={{
              margin: 0,
              color: "var(--tp-muted, #8a8a9a)",
              fontSize: 12,
              maxWidth: 600,
              lineHeight: 1.5,
            }}
          >
            Reflects results recorded so far in the bracket — updated the moment
            each match is decided, independent of any other match. See the
            Bracket tab for who's still alive.
          </p>
        )}
        {!isElimination && roundsPlayed > 0 && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--tp-muted, #8a8a9a)",
            }}
          >
            Viewing
            <select
              value={viewRound === null ? "latest" : String(viewRound)}
              onChange={(e) => {
                const v = e.target.value;
                setViewRound(v === "latest" ? null : Number(v));
              }}
              style={{
                background: "var(--tp-surface, #1a1a24)",
                border: "1px solid var(--tp-border-strong, #353545)",
                color: "var(--tp-text, #e8e8e8)",
                padding: "8px 12px",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
                textTransform: "none",
                letterSpacing: "normal",
              }}
            >
              <option value="latest">Latest (Round {roundsPlayed})</option>
              {Array.from({ length: roundsPlayed }, (_, i) => i + 1).map(
                (r) => (
                  <option key={r} value={r}>
                    After Round {r}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginLeft: "auto",
          }}
        >
          <button
            type="button"
            disabled={exporting}
            onClick={handleExport}
            style={{
              background: "var(--tp-border, #252532)",
              border: "1px solid var(--tp-border-strong, #353545)",
              color: "var(--tp-text, #e8e8e8)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              padding: "10px 18px",
              borderRadius: 8,
              cursor: exporting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s ease",
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? "EXPORTING…" : "⬇ DOWNLOAD AS EXCEL"}
          </button>
          {exportError && (
            <span
              style={{
                color: "var(--tp-danger, #ff6b6b)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {exportError}
            </span>
          )}
        </div>
      </div>

      {isViewingPast && !snapshotError && !snapshotMatchesSelection && (
        <div
          style={{
            background: "var(--tp-bg, #13131a)",
            border: "1px solid var(--tp-border, #252532)",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: "var(--tp-muted, #8a8a9a)",
            fontSize: 14,
          }}
        >
          <p style={{ margin: 0 }}>
            Loading standings after Round {viewRound}…
          </p>
        </div>
      )}

      {isViewingPast && !snapshotLoading && snapshotError && (
        <div
          style={{
            background: "var(--tp-bg, #13131a)",
            border:
              "1px solid color-mix(in srgb, var(--tp-loss, #f44336) 16%, var(--tp-card-solid, #191924))",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: "var(--tp-danger, #ff6b6b)",
            fontSize: 14,
          }}
        >
          <p style={{ margin: 0 }}>{snapshotError}</p>
        </div>
      )}

      {tablesReady && (
        <div className="st-layout">
          <nav className="st-nav" aria-label="Standings views">
            <div className="st-nav-title">View</div>
            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                disabled={sec.disabled}
                title={sec.disabled ? sec.disabledReason : undefined}
                aria-current={sec.id === activeId ? "page" : undefined}
                className={`st-nav-item${
                  sec.id === activeId ? " is-active" : ""
                }`}
                onClick={() => selectSection(sec.id)}
              >
                <span>{sec.label}</span>
                {sec.disabled && <span className="st-nav-tag">Live</span>}
              </button>
            ))}
          </nav>

          <div className="st-pane">
            {activeId === "standings" && (
              <Panel title="Standings" badge={pastBadge}>
                {isTeam && displayTeamStandings ? (
                  <TeamStandingsTable
                    teamStandings={displayTeamStandings}
                    playerStandings={displayStandings}
                    boardRankings={t.boardRankings}
                  />
                ) : (
                  <StandingsTable standings={displayStandings} />
                )}
              </Panel>
            )}

            {activeId === "cross-table" && (
              <Panel title="Cross Table" badge={pastBadge}>
                <CrossTable crossTable={displayCrossTable} isTeam={isTeam} />
              </Panel>
            )}

            {activeId === "board-standings" && (
              <Panel title="Individual Board Standings" badge={pastBadge}>
                <StandingsTable
                  standings={displayStandings}
                  showTiebreaks={false}
                  showTeam
                />
              </Panel>
            )}

            {/* Board Rankings (team events, live view only) — every team's
                Board 1 ranked against every other team's Board 1, then
                Board 2 against Board 2, etc. Different from the flat
                "Individual Board Standings", which mixes every board into
                one list. Historical per-round snapshots don't carry this
                breakdown. */}
            {activeId === "board-rankings" && (
              <Panel
                title="Board Rankings"
                note="Every team's Board 1 ranked against every other team's Board 1, then Board 2 against Board 2, and so on."
              >
                <div className="st-chips" role="tablist" aria-label="Board">
                  {boardRankings.map((board) => (
                    <button
                      key={board.boardNum}
                      type="button"
                      role="tab"
                      aria-selected={board.boardNum === activeBoard}
                      className={`st-chip${
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
                    className={`st-chip${
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
                        <h3
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            color: "var(--tp-brass, #d4a853)",
                            margin: "0 0 10px",
                          }}
                        >
                          Board {board.boardNum}
                        </h3>
                      )}
                      <StandingsTable standings={board.players} showTeam />
                    </div>
                  ))}
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
