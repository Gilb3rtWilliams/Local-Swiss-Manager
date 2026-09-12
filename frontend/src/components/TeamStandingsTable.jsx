import { Link, useOutletContext } from "react-router-dom";

// See CrossTable.jsx for why this is basePath rather than a bare id, and
// why useOutletContext() is always called unconditionally.
export default function TeamStandingsTable({ teamStandings, basePath }) {
  // Destructured as `outletContext`, not `t` — the .map((t, i) => ...)
  // below already uses `t` for each team row, and shadowing that with the
  // outlet context would silently break every t.* reference in the loop.
  const outletContext = useOutletContext();
  const resolvedBasePath =
    basePath ??
    (outletContext?.t?.id ? `/tournament/${outletContext.t.id}` : null);

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
                      {p.id && resolvedBasePath ? (
                        <Link to={`${resolvedBasePath}/player/${p.id}`}>
                          {p.title ? `${p.title} ${p.name}` : p.name}
                        </Link>
                      ) : p.title ? (
                        `${p.title} ${p.name}`
                      ) : (
                        p.name
                      )}
                      {p.fideId && (
                        <a
                          href={`https://ratings.fide.com/profile/${p.fideId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: "0.85em", marginLeft: 4 }}
                          title={`FIDE ID ${p.fideId}`}
                        >
                          [FIDE]
                        </a>
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
