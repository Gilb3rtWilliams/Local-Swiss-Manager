import { useOutletContext } from "react-router-dom";
import StandingsTable from "../../components/StandingsTable.jsx";

// Standalone board-by-board breakdown for team events — one table per
// board number, each ranked by the same score+tiebreak cascade as every
// other standings view (see computeBoardRankings() in tournamentService.js).
// Deliberately split out from Standings.jsx rather than folded into its
// "Board Rankings" section, so this can be reused as-is on the public side
// and eventually inside WinnerReveal, without carrying along the decider
// panel, export button, or round picker that only make sense on the full
// admin Standings tab.
export default function IndividualBoardPerformance() {
  const { t } = useOutletContext();
  const isTeam = t.format === "team";
  const boardRankings = t.boardRankings || [];

  if (!isTeam) {
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
        <p style={{ margin: 0 }}>
          Individual board performance only applies to team-format events.
        </p>
      </div>
    );
  }

  if (boardRankings.length === 0) {
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
        <p style={{ margin: 0 }}>
          Board performance will appear once Round 1 results are submitted.
        </p>
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
        padding: "8px 0",
      }}
    >
      <p style={{ margin: "0 0 4px", color: "#8a8a9a", fontSize: 12 }}>
        Every player ranked against everyone else who played the same board
        number, across all teams.
      </p>

      {boardRankings.map((board) => (
        <div
          key={board.boardNum}
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
              color: "#d4a853",
              marginTop: 0,
              marginBottom: 20,
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            Board {board.boardNum}
          </h2>
          <StandingsTable
            standings={board.players}
            showTiebreaks={false}
            showTeam
            basePath={`/tournament/${t.id}`}
          />
        </div>
      ))}
    </div>
  );
}
