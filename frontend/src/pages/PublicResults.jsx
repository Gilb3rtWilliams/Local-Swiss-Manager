import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import RoundHistory from "../components/RoundHistory.jsx";
import StandingsTable from "../components/StandingsTable.jsx";
import TeamStandingsTable from "../components/TeamStandingsTable.jsx";
import CrossTable from "../components/CrossTable.jsx";
import "../css/PublicResults.css";

const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
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
                            <span className="player-name">{b.playerName}</span>
                            <span className="bye-result"> sits out</span>
                          </td>
                        ) : (
                          <>
                            <td>
                              <span className="color-w" />
                              <span className="player-name">{b.whiteName}</span>
                            </td>
                            <td>
                              <span className="color-b" />
                              <span className="player-name">{b.blackName}</span>
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
          <span>
            Round {data.currentRound} / {data.totalRounds}
          </span>
          <span className={`pv-status pv-status-${data.status}`}>
            {data.status}
          </span>
        </p>

        {data.status === "finished" && data.winner && (
          <div className="pv-champion-banner">
            🏆 <strong>{data.winner}</strong> won this tournament
          </div>
        )}

        {hasAnyRounds ? (
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
