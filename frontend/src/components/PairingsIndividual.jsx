export default function PairingsIndividual({ pairings, results, onSetResult }) {
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
        {pairings.map((p, i) => (
          <tr key={p.idx}>
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
                  <div className="result-btns">
                    {["1-0", "1/2-1/2", "0-1", "1F-0F", "0F-0F", "0F-1F"].map(
                      (r) => (
                        <button
                          type="button"
                          key={r}
                          className={`result-btn ${r === "1-0" ? "white-wins" : r === "0-1" ? "black-wins" : "draw"} ${results[p.idx] === r ? "active" : ""}`}
                          onClick={() => onSetResult(p.idx, r)}
                        >
                          {r}
                        </button>
                      ),
                    )}
                  </div>
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
