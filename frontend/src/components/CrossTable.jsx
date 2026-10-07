import { Link, useOutletContext } from "react-router-dom";

// basePath: see existing comment — "/tournament/<id>" admin, "/results/<token>" public.
// isTeam: whether `crossTable` rows represent teams or individual players —
// computeStandingsBlock() in tournamentService.js builds crossTable from
// teams for team-format events and from players otherwise, so the profile
// link segment ("/team/" vs "/player/") has to match whichever one this
// actually is. Same fallback pattern as basePath: explicit prop wins,
// outlet context is the admin-side convenience default, and callers with
// no outlet context (PublicResults.jsx) must pass it explicitly.
export default function CrossTable({ crossTable, basePath, isTeam }) {
  const outletContext = useOutletContext();
  const resolvedBasePath =
    basePath ??
    (outletContext?.t?.id ? `/tournament/${outletContext.t.id}` : null);
  const resolvedIsTeam = isTeam ?? outletContext?.t?.format === "team";
  const linkSegment = resolvedIsTeam ? "team" : "player";

  if (!crossTable || crossTable.length === 0) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="cross-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            {crossTable.map((_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {crossTable.map((row) => (
            <tr key={row.id}>
              <td>{row.rank}</td>
              <td className="name-cell">
                {row.id && resolvedBasePath ? (
                  <Link to={`${resolvedBasePath}/${linkSegment}/${row.id}`}>
                    {row.name}
                  </Link>
                ) : (
                  row.name
                )}
              </td>
              {row.results.map((cell, ci) => (
                <td
                  key={ci}
                  className={
                    cell.self
                      ? "self-cell"
                      : cell.outcome
                      ? cell.outcome === "win"
                        ? "res-w"
                        : cell.outcome === "loss"
                        ? "res-l"
                        : "res-d"
                      : cell.raw === 1
                      ? "res-w"
                      : cell.raw === 0
                      ? "res-l"
                      : cell.value === "½"
                      ? "res-d"
                      : ""
                  }
                >
                  {cell.self ? "—" : cell.value}
                </td>
              ))}
              <td>
                <strong>{row.score}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
