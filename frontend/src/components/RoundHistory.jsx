export default function RoundHistory({ format, round }) {
  if (!round) return <p className="muted">No completed rounds yet.</p>;

  if (format === "team") {
    return (
      <div className="team-matches">
        {round.pairings.map((p, i) => (
          <div className="team-match-card" key={i}>
            {p.type === "bye" ? (
              <div className="team-match-bye">
                <span className="player-name">{p.teamName}</span>
                <span className="bye-result">BYE — full team +1 each</span>
              </div>
            ) : (
              <>
                <div className="team-match-header">
                  <span className="team-tag white">{p.teamWhiteName}</span>
                  <span className="vs">
                    {p.whitePoints} – {p.blackPoints}
                  </span>
                  <span className="team-tag black">{p.teamBlackName}</span>
                </div>
                <table className="pairing-table board-table">
                  <thead>
                    <tr>
                      <th className="board-num">Bd</th>
                      <th>White</th>
                      <th>Black</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.boards.map((b) => (
                      <tr key={b.boardNum}>
                        <td className="board-num">{b.boardNum}</td>
                        {b.sitOut ? (
                          <td colSpan={3}>
                            <span className="player-name">{b.playerName}</span>
                            <span className="bye-result"> sat out</span>
                          </td>
                        ) : (
                          <>
                            <td>
                              <span className="color-w" />
                              <span className="player-name">{b.whiteName}</span>
                            </td>
                            <td>
                              <span className="color-b" />
                              <span className="player-name">{b.blackName}</span>
                            </td>
                            <td>
                              <strong>{b.result}</strong>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <table className="pairing-table">
      <thead>
        <tr>
          <th className="board-num">#</th>
          <th>White</th>
          <th>Black</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {round.pairings.map((p, i) => (
          <tr key={i}>
            {p.type === "bye" ? (
              <>
                <td className="board-num">—</td>
                <td colSpan={2}>
                  <span className="player-name">{p.playerName}</span>
                </td>
                <td>
                  <span className="bye-result">BYE (+1)</span>
                </td>
              </>
            ) : (
              <>
                <td className="board-num">{i + 1}</td>
                <td>
                  <span className="color-w" />
                  <span className="player-name">{p.whiteName}</span>
                </td>
                <td>
                  <span className="color-b" />
                  <span className="player-name">{p.blackName}</span>
                </td>
                <td>
                  <strong>{p.result}</strong>
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
