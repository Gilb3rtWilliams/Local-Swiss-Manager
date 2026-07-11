import { useOutletContext } from "react-router-dom";
import StandingsTable from "../../components/StandingsTable.jsx";
import TeamStandingsTable from "../../components/TeamStandingsTable.jsx";
import CrossTable from "../../components/CrossTable.jsx";

export default function Standings() {
  const { t } = useOutletContext();
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";

  // t.rounds is a Swiss/round-robin concept — bracket results are recorded
  // match-by-match via submitBracketMatchResult(), which updates scores
  // directly and never appends to t.rounds. Gating on t.rounds.length here
  // would show "waiting for Round 1" forever, even after every match in the
  // bracket has been decided.
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
      <div className="card">
        <p className="muted">{message}</p>
      </div>
    );
  }

  return (
    <div>
      {isElimination && (
        <p className="muted" style={{ marginBottom: 16 }}>
          Reflects results recorded so far in the bracket — updated the moment
          each match is decided, independent of any other match. See the Bracket
          tab for who's still alive.
        </p>
      )}
      <div className="two-col">
        <div className="card">
          <h2>Standings</h2>
          {isTeam && t.teamStandings ? (
            <TeamStandingsTable teamStandings={t.teamStandings} />
          ) : (
            <StandingsTable standings={t.standings} />
          )}
        </div>
        <div className="card" style={{ overflowX: "auto" }}>
          <h2>Cross Table</h2>
          <CrossTable crossTable={t.crossTable} />
        </div>
      </div>

      {isTeam && (
        <div className="card">
          <h2>Individual Board Standings</h2>
          <StandingsTable
            standings={t.standings}
            showTiebreaks={false}
            showTeam
          />
        </div>
      )}
    </div>
  );
}
