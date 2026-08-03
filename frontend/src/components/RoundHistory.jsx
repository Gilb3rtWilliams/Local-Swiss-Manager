const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);

const RESULT_OPTIONS = [
  { value: "1-0", label: "1-0" },
  { value: "0-1", label: "0-1" },
  { value: "1/2-1/2", label: "½-½" },
  { value: "1F-0F", label: "1F-0F" },
  { value: "0F-1F", label: "0F-1F" },
  { value: "0F-0F", label: "0F-0F" },
];

function formatResult(result) {
  return result === "1/2-1/2" ? "½-½" : result;
}

export default function RoundHistory({
  format,
  round,
  variant,
  isEditing = false,
  onResultChange,
  loading = false,
}) {
  if (!round) return <p className="muted">No completed rounds yet.</p>;

  const isBughouse = variant === "bughouse";

  if (format === "team") {
    return (
      <div className="team-matches">
        {round.pairings.map((p, i) => {
          // There's no "abandoned" flag stored on the board that bughouse
          // didn't need — it just never got a result. So a board with no
          // result whose sibling board *did* get a decisive one is read as
          // "the match was already decided," not "someone forgot this one."
          const decisiveBoard = isBughouse
            ? p.boards?.find((b) => !b.sitOut && DECISIVE_RESULTS.has(b.result))
            : null;

          return (
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
                      {p.boards.map((b) => {
                        const lockedByOtherBoard =
                          decisiveBoard &&
                          decisiveBoard.boardNum !== b.boardNum &&
                          !b.result;

                        return (
                          <tr key={b.boardNum}>
                            <td className="board-num">{b.boardNum}</td>
                            {b.sitOut ? (
                              <td colSpan={3}>
                                <span className="player-name">
                                  {b.playerName}
                                </span>
                                <span className="bye-result"> sat out</span>
                              </td>
                            ) : lockedByOtherBoard ? (
                              <td colSpan={3}>
                                <span className="player-name">
                                  {b.whiteName} vs {b.blackName}
                                </span>
                                <span className="bughouse-decided">
                                  {" "}
                                  — match decided on Board{" "}
                                  {decisiveBoard.boardNum}
                                </span>
                              </td>
                            ) : (
                              <>
                                <td>
                                  <span className="color-w" />
                                  <span className="player-name">
                                    {b.whiteName}
                                  </span>
                                </td>
                                <td>
                                  <span className="color-b" />
                                  <span className="player-name">
                                    {b.blackName}
                                  </span>
                                </td>
                                <td>
                                  {isEditing ? (
                                    <select
                                      className="result-select"
                                      value={b.result || ""}
                                      disabled={loading}
                                      onChange={(e) =>
                                        onResultChange?.(
                                          i,
                                          e.target.value,
                                          b.boardNum,
                                        )
                                      }
                                    >
                                      <option value="" disabled>
                                        Select
                                      </option>
                                      {RESULT_OPTIONS.map((opt) => (
                                        <option
                                          key={opt.value}
                                          value={opt.value}
                                        >
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <strong>{formatResult(b.result)}</strong>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          );
        })}
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
                  {isEditing ? (
                    <select
                      className="result-select"
                      value={p.result || ""}
                      disabled={loading}
                      onChange={(e) => onResultChange?.(i, e.target.value)}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {RESULT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <strong>{formatResult(p.result)}</strong>
                  )}
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
