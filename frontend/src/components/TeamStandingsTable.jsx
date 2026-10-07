import { Link, useOutletContext } from "react-router-dom";
import RankCell from "./RankCell.jsx";

// See CrossTable.jsx for why this is basePath rather than a bare id, and
// why useOutletContext() is always called unconditionally.
//
// Each team's players are listed vertically, one per board, with their
// individual points. Board and points are read from the team's own player
// objects when the server provides them (`boardNum`, `score`); otherwise they
// are filled in from the optional `playerStandings` (individual standings,
// matched by player id) and `boardRankings` (matched by player id) props.
export default function TeamStandingsTable({
  teamStandings,
  basePath,
  playerStandings,
  boardRankings,
}) {
  // Destructured as `outletContext`, not `t` — the .map((t, i) => ...)
  // below already uses `t` for each team row, and shadowing that with the
  // outlet context would silently break every t.* reference in the loop.
  const outletContext = useOutletContext();
  const resolvedBasePath =
    basePath ??
    (outletContext?.t?.id ? `/tournament/${outletContext.t.id}` : null);

  const scoreById = new Map();
  const boardById = new Map();
  (playerStandings || []).forEach((ps) => {
    if (ps.id == null) return;
    if (ps.score != null) scoreById.set(ps.id, ps.score);
    if (ps.boardNum != null) boardById.set(ps.id, ps.boardNum);
  });
  (boardRankings || []).forEach((board) =>
    (board.players || []).forEach((bp) => {
      if (bp.id != null && !boardById.has(bp.id)) {
        boardById.set(bp.id, board.boardNum);
      }
    }),
  );

  // Resolve board + points for one player and order the roster by board.
  function rosterFor(team) {
    const rows = (team.players || []).map((p, idx) => ({
      p,
      board: p.boardNum ?? boardById.get(p.id) ?? null,
      points: p.score ?? p.points ?? scoreById.get(p.id) ?? null,
      idx,
    }));
    rows.sort((a, b) =>
      a.board != null && b.board != null
        ? a.board - b.board
        : a.board != null
        ? -1
        : b.board != null
        ? 1
        : a.idx - b.idx,
    );
    return rows;
  }

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="rank-col">#</th>
          <th>Team</th>
          <th>Players (board · points)</th>
          <th>Match Pts</th>
          <th>Buchholz Cut-1</th>
          <th>Buchholz</th>
          <th>SB</th>
          <th>Wins</th>
        </tr>
      </thead>
      <tbody>
        {teamStandings.map((t, i) => (
          <tr key={t.id}>
            <td className="rank-col">
              <RankCell rank={i + 1} />
            </td>
            <td className="player-name">{t.name}</td>
            <td>
              {t.players?.length ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {rosterFor(t).map(({ p, board, points }) => (
                    <div
                      key={p.id || p.name}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <span
                        title={board != null ? `Board ${board}` : undefined}
                        style={{
                          flex: "0 0 auto",
                          minWidth: 26,
                          fontSize: "0.78em",
                          color: "var(--tp-dim, #6b6b7b)",
                        }}
                      >
                        {board != null ? `Bd ${board}` : "—"}
                      </span>
                      <span style={{ flex: "1 1 auto" }}>
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
                      <span
                        title="Individual points"
                        style={{
                          flex: "0 0 auto",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--tp-text, #e8e8e8)",
                        }}
                      >
                        {points != null ? points : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                t.playerCount
              )}
            </td>
            <td className="score-col">{t.score}</td>
            <td className="tiebreak-col">{t.buchholzCut1}</td>
            <td className="tiebreak-col">{t.buchholz}</td>
            <td className="tiebreak-col">{t.sb}</td>
            <td className="tiebreak-col">{t.wins}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
