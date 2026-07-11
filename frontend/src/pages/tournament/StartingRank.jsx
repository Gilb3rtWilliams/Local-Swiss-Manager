import { useOutletContext } from 'react-router-dom';

export default function StartingRank() {
  const { t } = useOutletContext();
  const isTeam = t.format === 'team';

  return (
    <div className="card">
      <div className="section-header">
        <h2>Starting Rank</h2>
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        Seed order at the start of the event, highest rating first. This list doesn't change once
        play begins — late joiners are appended to the end rather than reshuffling everyone.
      </p>

      {isTeam ? (
        <div className="starting-rank-teams">
          {t.startingRankList.map(team => (
            <div className="team-block" key={team.id}>
              <div className="team-block-header">
                <span className="round-badge">Seed {team.rank}</span>
                <span className="team-name-input" style={{ fontWeight: 700 }}>{team.name}</span>
                <span className="rating-tag">avg {team.rating}</span>
              </div>
              <table className="standings-table">
                <thead>
                  <tr><th className="rank-col">#</th><th>Player</th><th>Rating</th></tr>
                </thead>
                <tbody>
                  {team.players.map(p => (
                    <tr key={p.id}>
                      <td className="rank-col">{p.startingRank}</td>
                      <td className="player-name">{p.name}</td>
                      <td>{p.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <table className="standings-table">
          <thead>
            <tr><th className="rank-col">#</th><th>Player</th><th>Rating</th></tr>
          </thead>
          <tbody>
            {t.startingRankList.map(p => (
              <tr key={p.id}>
                <td className="rank-col">{p.rank}</td>
                <td className="player-name">{p.name}</td>
                <td>{p.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
