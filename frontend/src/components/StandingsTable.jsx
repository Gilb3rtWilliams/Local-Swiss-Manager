export default function StandingsTable({ standings, showTiebreaks = true, showTeam = false }) {
  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="rank-col">#</th>
          <th>Player</th>
          {showTeam && <th>Team</th>}
          <th>Score</th>
          {showTiebreaks && <th>Buchholz</th>}
          {showTiebreaks && <th>SB</th>}
        </tr>
      </thead>
      <tbody>
        {standings.map((p, i) => (
          <tr key={p.id}>
            <td className="rank-col">{i + 1}</td>
            <td className="player-name">{p.name} {p.rating != null && <span className="rating-tag">({p.rating})</span>}</td>
            {showTeam && <td>{p.teamName}</td>}
            <td className="score-col">{p.score}</td>
            {showTiebreaks && <td className="tiebreak-col">{p.buchholz}</td>}
            {showTiebreaks && <td className="tiebreak-col">{p.sb}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
