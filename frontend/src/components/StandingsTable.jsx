import { Link, useOutletContext } from "react-router-dom";

// See CrossTable.jsx for why this is basePath rather than a bare id, and
// why useOutletContext() is always called unconditionally.
export default function StandingsTable({
  standings,
  showTiebreaks = true,
  showTeam = false,
  basePath,
}) {
  const outletContext = useOutletContext();
  const resolvedBasePath =
    basePath ??
    (outletContext?.t?.id ? `/tournament/${outletContext.t.id}` : null);

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="rank-col">#</th>
          <th className="title-col">Title</th>
          <th>Player</th>
          <th>FIDE ID</th>
          {showTeam && <th>Team</th>}
          <th>Score</th>
          {showTiebreaks && <th>Buchholz</th>}
          {showTiebreaks && <th>Sonneborn-Berger</th>}
        </tr>
      </thead>
      <tbody>
        {standings.map((p, i) => (
          <tr key={p.id}>
            <td className="rank-col">{i + 1}</td>
            <td className="title-col">
              {p.player?.title || p.title || null || ""}
            </td>
            <td className="player-name">
              {p.id && resolvedBasePath ? (
                <Link to={`${resolvedBasePath}/player/${p.id}`}>{p.name}</Link>
              ) : (
                p.name
              )}{" "}
              {p.rating != null && (
                <span className="rating-tag">({p.rating})</span>
              )}
            </td>
            <td className="fide-id-col">
              {p.fideId ? (
                <a
                  href={`https://ratings.fide.com/profile/${p.fideId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {p.fideId}
                </a>
              ) : (
                "—"
              )}
            </td>
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
