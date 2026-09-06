import { Link, useOutletContext } from "react-router-dom";

// basePath is the prefix a player-profile link should be built under —
// "/tournament/<id>" on the admin side, "/results/<token>" on the public
// side, since those lead to two different routes (admin id-based vs public
// token-based) that a bare tournament id alone can't distinguish between.
// Always calls useOutletContext() unconditionally (Rules of Hooks — must
// run every render, not skipped based on whether basePath was passed in)
// and only falls back to it when the caller doesn't supply one, which also
// covers the case where an ancestor Outlet exists but its context is null
// rather than absent (both crash on plain destructuring otherwise).
export default function CrossTable({ crossTable, basePath }) {
  const outletContext = useOutletContext();
  const resolvedBasePath =
    basePath ??
    (outletContext?.t?.id ? `/tournament/${outletContext.t.id}` : null);

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
                  <Link to={`${resolvedBasePath}/player/${row.id}`}>
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
