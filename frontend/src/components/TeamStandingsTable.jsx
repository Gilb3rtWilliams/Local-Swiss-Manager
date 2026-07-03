export default function TeamStandingsTable({ teamStandings }) {
  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="rank-col">#</th>
          <th>Team</th>
          <th>Players</th>
          <th>Match Pts</th>
          <th>Buchholz</th>
          <th>SB</th>
        </tr>
      </thead>
      <tbody>
        {teamStandings.map((t, i) => (
          <tr key={t.id}>
            <td className="rank-col">{i + 1}</td>
            <td className="player-name">{t.name}</td>
            <td className="tiebreak-col">{t.playerCount}</td>
            <td className="score-col">{t.score}</td>
            <td className="tiebreak-col">{t.buchholz}</td>
            <td className="tiebreak-col">{t.sb}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
