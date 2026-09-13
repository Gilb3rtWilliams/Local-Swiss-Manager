import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import StandingsTable from "../../components/StandingsTable.jsx";
import TeamStandingsTable from "../../components/TeamStandingsTable.jsx";
import CrossTable from "../../components/CrossTable.jsx";

// Manual escape hatch — lets the organizer settle the decider directly
// (a withdrawal, an agreed result, or just cutting a drawn-out tiebreak
// short) instead of always requiring another recorded game. Collapsed by
// default so it doesn't compete visually with the actual games list, which
// is the normal path.
function DeclareWinnerOverride({ competitors, busy, onDeclare }) {
  const [choice, setChoice] = useState("");
  return (
    <details style={{ marginTop: 16 }}>
      <summary
        style={{
          cursor: "pointer",
          color: "#8a8a9a",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Declare a winner manually
      </summary>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 12,
        }}
      >
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          style={{
            background: "#1a1a24",
            border: "1px solid #353545",
            color: "#e8e8e8",
            padding: "8px 12px",
            borderRadius: 8,
            fontFamily: "inherit",
            fontSize: 12,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">Choose a winner…</option>
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !choice}
          onClick={() => onDeclare(choice)}
          style={{
            background: "#252532",
            border: "1px solid #353545",
            color: "#e8e8e8",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            padding: "8px 16px",
            borderRadius: 8,
            cursor: busy || !choice ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: busy || !choice ? 0.6 : 1,
          }}
        >
          Declare Winner
        </button>
      </div>
    </details>
  );
}

export default function Standings() {
  const { t, setTournament } = useOutletContext();
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [deciderBusy, setDeciderBusy] = useState(false);
  const [deciderError, setDeciderError] = useState("");

  // Every decider mutation (start/record a game/escalate/declare) returns the
  // full updated tournament, same as every other mutating endpoint in this
  // app — applying it directly via setTournament (rather than calling
  // refresh(), which would mean a second round-trip) is what already made
  // t.decider/t.tieForFirst update instantly elsewhere in the app.
  async function runDeciderAction(promiseFn) {
    setDeciderBusy(true);
    setDeciderError("");
    try {
      const updated = await promiseFn();
      setTournament(updated);
    } catch (e) {
      setDeciderError(e.message);
    } finally {
      setDeciderBusy(false);
    }
  }

  function handleStartDecider() {
    runDeciderAction(() => api.startDecider(t.id));
  }
  function handleSubmitGameResult(gameId, result) {
    runDeciderAction(() => api.submitDeciderGameResult(t.id, gameId, result));
  }
  function handleAddDeciderRound() {
    runDeciderAction(() => api.addDeciderRound(t.id));
  }
  function handleDeclareWinner(competitorId) {
    if (!competitorId) return;
    runDeciderAction(() => api.declareDeciderWinner(t.id, competitorId));
  }

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
        <p style={{ margin: 0 }}>{message}</p>
      </div>
    );
  }

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
              color: "#8a8a9a",
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
              color: "#8a8a9a",
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
                background: "#1a1a24",
                border: "1px solid #353545",
                color: "#e8e8e8",
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
              background: "#252532",
              border: "1px solid #353545",
              color: "#e8e8e8",
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
            <span style={{ color: "#ff6b6b", fontSize: 11, fontWeight: 600 }}>
              {exportError}
            </span>
          )}
        </div>
      </div>

      {t.status === "finished" &&
        !isElimination &&
        (t.tieForFirst || t.decider) && (
          <div
            style={{
              background: "#13131a",
              border: "1px solid rgba(212, 168, 83, 0.35)",
              borderRadius: 12,
              padding: "24px",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#e8e8e8",
                marginTop: 0,
                marginBottom: 16,
                borderBottom: "1px solid #252532",
                paddingBottom: 12,
              }}
            >
              🏆 Tie-break Decider
            </h2>

            {!t.decider && t.tieForFirst && (
              <div>
                <p
                  style={{
                    color: "#8a8a9a",
                    fontSize: 13,
                    lineHeight: 1.6,
                    margin: "0 0 16px",
                  }}
                >
                  {t.tieForFirst.competitors.map((c) => c.name).join(" and ")}{" "}
                  are tied for 1st place on every tiebreak. Start a decider to
                  settle it with extra games.
                </p>
                <button
                  type="button"
                  disabled={deciderBusy}
                  onClick={handleStartDecider}
                  style={{
                    background: "#252532",
                    border: "1px solid #d4a853",
                    color: "#d4a853",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    padding: "10px 18px",
                    borderRadius: 8,
                    cursor: deciderBusy ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: deciderBusy ? 0.6 : 1,
                  }}
                >
                  {deciderBusy ? "Starting…" : "Start Decider"}
                </button>
              </div>
            )}

            {t.decider && (
              <div>
                {t.decider.status === "resolved" && t.decider.winner && (
                  <div
                    style={{
                      background: "rgba(212, 168, 83, 0.1)",
                      border: "1px solid rgba(212, 168, 83, 0.3)",
                      borderRadius: 8,
                      padding: "12px 16px",
                      marginBottom: 16,
                      color: "#d4a853",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    🏆 {t.decider.winner.name} wins the decider!
                  </div>
                )}

                {t.decider.status === "unresolved" && (
                  <p
                    style={{
                      color: "#ff6b6b",
                      fontSize: 13,
                      lineHeight: 1.6,
                      margin: "0 0 16px",
                    }}
                  >
                    Still fully tied after every scheduled game — add a
                    sudden-death round, or declare a winner manually below.
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {t.decider.games.map((g, i) => (
                    <div
                      key={g.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 10,
                        padding: "10px 14px",
                        background: "#1a1a24",
                        border: "1px solid #252532",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "#8a8a9a" }}>
                        Game {i + 1}: {g.a.name} vs {g.b.name}
                      </span>
                      {g.result ? (
                        <span style={{ color: "#d4a853", fontWeight: 600 }}>
                          {g.result === "draw"
                            ? "Draw"
                            : g.result === "A"
                            ? `${g.a.name} won`
                            : `${g.b.name} won`}
                        </span>
                      ) : (
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            disabled={deciderBusy}
                            onClick={() => handleSubmitGameResult(g.id, "A")}
                            style={{
                              background: "#252532",
                              border: "1px solid #353545",
                              color: "#e8e8e8",
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "6px 12px",
                              borderRadius: 6,
                              cursor: deciderBusy ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {g.a.name} wins
                          </button>
                          <button
                            type="button"
                            disabled={deciderBusy}
                            onClick={() => handleSubmitGameResult(g.id, "draw")}
                            style={{
                              background: "#252532",
                              border: "1px solid #353545",
                              color: "#e8e8e8",
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "6px 12px",
                              borderRadius: 6,
                              cursor: deciderBusy ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Draw
                          </button>
                          <button
                            type="button"
                            disabled={deciderBusy}
                            onClick={() => handleSubmitGameResult(g.id, "B")}
                            style={{
                              background: "#252532",
                              border: "1px solid #353545",
                              color: "#e8e8e8",
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "6px 12px",
                              borderRadius: 6,
                              cursor: deciderBusy ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {g.b.name} wins
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {t.decider.status === "unresolved" && (
                  <button
                    type="button"
                    disabled={deciderBusy}
                    onClick={handleAddDeciderRound}
                    style={{
                      marginTop: 16,
                      background: "#252532",
                      border: "1px solid #353545",
                      color: "#e8e8e8",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      padding: "10px 18px",
                      borderRadius: 8,
                      cursor: deciderBusy ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      opacity: deciderBusy ? 0.6 : 1,
                    }}
                  >
                    {deciderBusy ? "Adding…" : "Add Sudden-Death Round"}
                  </button>
                )}

                {t.decider.status !== "resolved" && (
                  <DeclareWinnerOverride
                    competitors={t.decider.competitors}
                    busy={deciderBusy}
                    onDeclare={handleDeclareWinner}
                  />
                )}

                {deciderError && (
                  <p
                    style={{
                      color: "#ff6b6b",
                      fontSize: 12,
                      fontWeight: 600,
                      marginTop: 12,
                    }}
                  >
                    {deciderError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

      {isViewingPast && !snapshotError && !snapshotMatchesSelection && (
        <div
          style={{
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: "#8a8a9a",
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
            background: "#13131a",
            border: "1px solid #3a2222",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: "#ff6b6b",
            fontSize: 14,
          }}
        >
          <p style={{ margin: 0 }}>{snapshotError}</p>
        </div>
      )}

      {tablesReady && (
        <>
          {/* Main Tables Grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* Primary Standings Card */}
            <div
              style={{
                background: "#13131a",
                border: "1px solid #252532",
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
                  color: "#e8e8e8",
                  marginTop: 0,
                  marginBottom: 20,
                  borderBottom: "1px solid #252532",
                  paddingBottom: 12,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                Standings
                {isViewingPast && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "none",
                      color: "#d4a853",
                      background: "rgba(212, 168, 83, 0.1)",
                      border: "1px solid rgba(212, 168, 83, 0.25)",
                      padding: "3px 8px",
                      borderRadius: 6,
                    }}
                  >
                    as of Round {viewRound}
                  </span>
                )}
              </h2>
              {isTeam && displayTeamStandings ? (
                <TeamStandingsTable teamStandings={displayTeamStandings} />
              ) : (
                <StandingsTable standings={displayStandings} />
              )}
            </div>

            {/* Cross Table Card */}
            <div
              style={{
                background: "#13131a",
                border: "1px solid #252532",
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
                  color: "#e8e8e8",
                  marginTop: 0,
                  marginBottom: 20,
                  borderBottom: "1px solid #252532",
                  paddingBottom: 12,
                }}
              >
                Cross Table
              </h2>
              <CrossTable crossTable={displayCrossTable} />
            </div>
          </div>

          {/* Individual Board Standings (Team Events Only) */}
          {isTeam && (
            <div
              style={{
                background: "#13131a",
                border: "1px solid #252532",
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
                  color: "#e8e8e8",
                  marginTop: 0,
                  marginBottom: 20,
                  borderBottom: "1px solid #252532",
                  paddingBottom: 12,
                }}
              >
                Individual Board Standings
              </h2>
              <StandingsTable
                standings={displayStandings}
                showTiebreaks={false}
                showTeam
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
