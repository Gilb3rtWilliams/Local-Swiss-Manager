import { Link, useOutletContext } from "react-router-dom";

export default function TeamStandingsTable({ teamStandings }) {
  // Destructured as `tournament`, not `t` — the existing .map((t, i) => ...)
  // below already uses `t` for each team row, and shadowing that with the
  // tournament object would silently break every t.* reference in the loop.
  const { t: tournament } = useOutletContext();

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
            <td className="tiebreak-col">
              {t.players?.length
                ? t.players.map((p, pi) => (
                    <span key={p.id || p.name}>
                      {pi > 0 && ", "}
                      {p.id ? (
                        <Link
                          to={`/tournament/${tournament.id}/player/${p.id}`}
                        >
                          {p.title ? `${p.title} ${p.name}` : p.name}
                        </Link>
                      ) : p.title ? (
                        `${p.title} ${p.name}`
                      ) : (
                        p.name
                      )}
                    </span>
                  ))
                : t.playerCount}
            </td>
            <td className="score-col">{t.score}</td>
            <td className="tiebreak-col">{t.buchholz}</td>
            <td className="tiebreak-col">{t.sb}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
