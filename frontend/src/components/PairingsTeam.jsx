export default function PairingsTeam({ pairings, results, onSetBoardResult }) {
  return (
    <div className="team-matches">
      {pairings.map(p => (
        <div className="team-match-card" key={p.idx}>
          {p.type === 'bye' ? (
            <div className="team-match-bye">
              <span className="player-name">{p.teamName}</span>
              <span className="bye-result">BYE — full team +1 each</span>
            </div>
          ) : (
            <>
              <div className="team-match-header">
                <span className="team-tag white">{p.teamWhiteName}</span>
                <span className="vs">vs</span>
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
                  {p.boards.map(b => (
                    <tr key={b.boardNum}>
                      <td className="board-num">{b.boardNum}</td>
                      {b.sitOut ? (
                        <td colSpan={3}>
                          <span className="player-name">{(b.white || b.black)?.name}</span>
                          <span className="bye-result"> sits out this round</span>
                        </td>
                      ) : (
                        <>
                          <td><span className="color-w" /><span className="player-name">{b.white.name}</span> <span className="rating-tag">({b.white.rating})</span></td>
                          <td><span className="color-b" /><span className="player-name">{b.black.name}</span> <span className="rating-tag">({b.black.rating})</span></td>
                          <td>
                            <div className="result-btns">
                              {['1-0', '½-½', '0-1'].map(r => {
                                const key = `${p.idx}-${b.boardNum}`;
                                return (
                                  <button
                                    type="button" key={r}
                                    className={`result-btn ${r === '1-0' ? 'white-wins' : r === '0-1' ? 'black-wins' : 'draw'} ${results[key] === r ? 'active' : ''}`}
                                    onClick={() => onSetBoardResult(p.idx, b.boardNum, r)}
                                  >{r}</button>
                                );
                              })}
                            </div>
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
