const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);

function TeamMatch({ p, results, onSetBoardResult, isBughouse }) {
  // Once either board has a decisive result, the match is over for BOTH
  // boards — the other one isn't needed and shouldn't invite a click.
  const decisiveBoard = isBughouse
    ? p.boards.find(
        (b) =>
          !b.sitOut && DECISIVE_RESULTS.has(results[`${p.idx}-${b.boardNum}`]),
      )
    : null;

  return (
    <div className="team-match-card">
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
          {p.boards.map((b) => {
            const key = `${p.idx}-${b.boardNum}`;
            const lockedByOtherBoard =
              decisiveBoard && decisiveBoard.boardNum !== b.boardNum;

            return (
              <tr key={b.boardNum}>
                <td className="board-num">{b.boardNum}</td>
                {b.sitOut ? (
                  <td colSpan={3}>
                    <span className="player-name">
                      {(b.white || b.black)?.name}
                    </span>
                    <span className="bye-result"> sits out this round</span>
                  </td>
                ) : lockedByOtherBoard ? (
                  <td colSpan={3}>
                    <span className="player-name">
                      {b.white.name} vs {b.black.name}
                    </span>
                    <span className="bughouse-decided">
                      {" "}
                      — match decided on Board {decisiveBoard.boardNum}, this
                      board doesn't count
                    </span>
                  </td>
                ) : (
                  <>
                    <td>
                      <span className="color-w" />
                      <span className="player-name">{b.white.name}</span>{" "}
                      <span className="rating-tag">({b.white.rating})</span>
                    </td>
                    <td>
                      <span className="color-b" />
                      <span className="player-name">{b.black.name}</span>{" "}
                      <span className="rating-tag">({b.black.rating})</span>
                    </td>
                    <td>
                      <div className="result-btns">
                        {[
                          "1-0",
                          "1/2-1/2",
                          "0-1",
                          "1F-0F",
                          "0F-0F",
                          "0F-1F",
                        ].map((r) => (
                          <button
                            type="button"
                            key={r}
                            className={`result-btn ${
                              r === "1-0" || r === "1F-0F"
                                ? "white-wins"
                                : r === "0-1" || r === "0F-1F"
                                  ? "black-wins"
                                  : "draw"
                            } ${results[key] === r ? "active" : ""}`}
                            onClick={() =>
                              onSetBoardResult(p.idx, b.boardNum, r)
                            }
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PairingsTeam({
  pairings,
  results,
  onSetBoardResult,
  isBughouse,
}) {
  return (
    <div className="team-matches">
      {pairings.map((p) =>
        p.type === "bye" ? (
          <div className="team-match-card" key={p.idx}>
            <div className="team-match-bye">
              <span className="player-name">{p.teamName}</span>
              <span className="bye-result">BYE — full team +1 each</span>
            </div>
          </div>
        ) : (
          <TeamMatch
            key={p.idx}
            p={p}
            results={results}
            onSetBoardResult={onSetBoardResult}
            isBughouse={isBughouse}
          />
        ),
      )}
    </div>
  );
}
