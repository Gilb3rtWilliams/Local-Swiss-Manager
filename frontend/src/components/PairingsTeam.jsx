import React from "react";
import { useOutletContext } from "react-router-dom";

const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);

function ResultButtons({
  results,
  matchKey,
  onSetResult,
  rOptions = ["1-0", "1/2-1/2", "0-1", "1F-0F", "0F-0F", "0F-1F"],
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        justifyContent: "center",
        marginTop: 8,
      }}
    >
      {rOptions.map((r) => {
        const isActive = results[matchKey] === r;
        return (
          <button
            type="button"
            key={r}
            onClick={() => onSetResult(r)}
            style={{
              background: isActive ? "#3a3a4a" : "transparent",
              border: `1px solid ${isActive ? "#5a5a6a" : "#2a2a35"}`,
              color: isActive ? "#fff" : "#8a8a9a",
              fontSize: 10,
              padding: "4px 6px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

function BughouseMatch({ p, results, onSetBoardResult, livePlayers }) {
  const decisiveBoard = p.boards.find(
    (b) => !b.sitOut && DECISIVE_RESULTS.has(results[`${p.idx}-${b.boardNum}`]),
  );

  function resolveTitle(playerObj) {
    if (!playerObj) return "";
    if (playerObj.title) return playerObj.title;
    if (playerObj.name) {
      const match = livePlayers.find((lp) => lp.name === playerObj.name);
      if (match?.title) return match.title;
    }
    return "";
  }

  return (
    <div
      style={{
        background: "#13131a",
        border: "1px solid #252532",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 24,
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        color: "#e8e8e8",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: "1px solid #252532",
        }}
      >
        <div style={{ padding: "16px 24px", borderRight: "1px solid #252532" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#d4a853",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#d4a853",
                display: "inline-block",
              }}
            />
            {p.teamWhiteName}
          </span>
        </div>
        <div style={{ padding: "16px 24px", textAlign: "right" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#6b9df7",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              flexDirection: "row-reverse",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#6b9df7",
                display: "inline-block",
              }}
            />
            {p.teamBlackName}
          </span>
        </div>
      </div>

      {/* Boards */}
      {p.boards.map((b) => {
        const key = `${p.idx}-${b.boardNum}`;
        const lockedByOtherBoard =
          decisiveBoard && decisiveBoard.boardNum !== b.boardNum;
        const teamAIsWhite = b.boardNum % 2 === 1;
        const teamAPlayer = teamAIsWhite ? b.white : b.black;
        const teamBPlayer = teamAIsWhite ? b.black : b.white;

        const teamAPlayerTitle = resolveTitle(teamAPlayer);
        const teamBPlayerTitle = resolveTitle(teamBPlayer);

        if (b.sitOut) {
          const sitOutPlayer = b.white || b.black;
          const sitOutTitle = resolveTitle(sitOutPlayer);
          return (
            <div
              key={b.boardNum}
              style={{
                padding: "24px",
                textAlign: "center",
                color: "#6b6b7b",
                fontSize: 13,
                borderBottom: "1px solid #252532",
              }}
            >
              <span style={{ color: "#a0a0b0" }}>
                {sitOutTitle && (
                  <span
                    style={{
                      color: "#c25555",
                      marginRight: "4px",
                      fontWeight: 700,
                    }}
                  >
                    {sitOutTitle}
                  </span>
                )}
                {sitOutPlayer?.name}
              </span>{" "}
              sits out this round
            </div>
          );
        }

        return (
          <div
            key={b.boardNum}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 140px 1fr",
              borderBottom:
                b.boardNum === p.boards.length ? "none" : "1px solid #252532",
              minHeight: 120,
            }}
          >
            {/* Team A Side (Left) */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderRight: "1px solid #252532",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  flexShrink: 0,
                  background: teamAIsWhite ? "#f0e6d2" : "#252532",
                  color: teamAIsWhite ? "#1a1a20" : "#e8e8e8",
                  border: `1px solid ${teamAIsWhite ? "#e0d5c0" : "#353545"}`,
                }}
              >
                {teamAIsWhite ? "♔" : "♚"}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#e8e8e8",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  {teamAPlayerTitle && (
                    <span
                      style={{
                        color: "#c25555",
                        marginRight: "6px",
                        fontWeight: 700,
                      }}
                    >
                      {teamAPlayerTitle}
                    </span>
                  )}
                  {teamAPlayer.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#d4a853",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  {p.teamWhiteName}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "transparent",
                    border: "1px solid #353545",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#8a8a9a",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 1,
                      display: "inline-block",
                      background: teamAIsWhite ? "#f0e6d2" : "#252532",
                      border: `1px solid ${teamAIsWhite ? "#e0d5c0" : "#454555"}`,
                    }}
                  />
                  {teamAIsWhite ? "WHITE" : "BLACK"} · BOARD {b.boardNum}
                </div>
              </div>
            </div>

            {/* Center */}
            <div
              style={{
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRight: "1px solid #252532",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#4a4a5a",
                }}
              >
                Board {b.boardNum}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#3a3a4a",
                  letterSpacing: "0.05em",
                }}
              >
                VS
              </div>
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: `linear-gradient(45deg, #2a2a35 25%, transparent 25%), linear-gradient(-45deg, #2a2a35 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a35 75%), linear-gradient(-45deg, transparent 75%, #2a2a35 75%)`,
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                  borderRadius: 4,
                  opacity: 0.6,
                  marginBottom: lockedByOtherBoard ? 0 : 4,
                }}
              />

              {lockedByOtherBoard ? (
                <div
                  style={{
                    fontSize: 9,
                    color: "#6b6b7b",
                    textAlign: "center",
                    lineHeight: 1.4,
                    maxWidth: 120,
                  }}
                >
                  Decided on Board {decisiveBoard.boardNum}
                </div>
              ) : (
                <ResultButtons
                  results={results}
                  matchKey={key}
                  onSetResult={(r) => onSetBoardResult(p.idx, b.boardNum, r)}
                />
              )}
            </div>

            {/* Team B Side (Right) */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                textAlign: "right",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#e8e8e8",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  {teamBPlayerTitle && (
                    <span
                      style={{
                        color: "#c25555",
                        marginRight: "6px",
                        fontWeight: 700,
                      }}
                    >
                      {teamBPlayerTitle}
                    </span>
                  )}
                  {teamBPlayer.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#6b9df7",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  {p.teamBlackName}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "transparent",
                    border: "1px solid #353545",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#8a8a9a",
                    flexDirection: "row-reverse",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 1,
                      display: "inline-block",
                      background: teamAIsWhite ? "#252532" : "#f0e6d2",
                      border: `1px solid ${teamAIsWhite ? "#454555" : "#e0d5c0"}`,
                    }}
                  />
                  {teamAIsWhite ? "BLACK" : "WHITE"} · BOARD {b.boardNum}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  flexShrink: 0,
                  background: teamAIsWhite ? "#252532" : "#f0e6d2",
                  color: teamAIsWhite ? "#e8e8e8" : "#1a1a20",
                  border: `1px solid ${teamAIsWhite ? "#353545" : "#e0d5c0"}`,
                }}
              >
                {teamAIsWhite ? "♚" : "♔"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamMatch({ p, results, onSetBoardResult, isBughouse, livePlayers }) {
  if (isBughouse) {
    return (
      <BughouseMatch
        p={p}
        results={results}
        onSetBoardResult={onSetBoardResult}
        livePlayers={livePlayers}
      />
    );
  }

  function resolveTitle(playerObj) {
    if (!playerObj) return "";
    if (playerObj.title) return playerObj.title;
    if (playerObj.name) {
      const match = livePlayers.find((lp) => lp.name === playerObj.name);
      if (match?.title) return match.title;
    }
    return "";
  }

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
            const whiteTitle = resolveTitle(b.white);
            const blackTitle = resolveTitle(b.black);
            const sitOutPlayer = b.white || b.black;
            const sitOutTitle = resolveTitle(sitOutPlayer);

            return (
              <tr key={b.boardNum}>
                <td className="board-num">{b.boardNum}</td>
                {b.sitOut ? (
                  <td colSpan={3}>
                    <span className="player-name">
                      {sitOutTitle && (
                        <span
                          style={{
                            color: "#c25555",
                            marginRight: "4px",
                            fontWeight: 700,
                          }}
                        >
                          {sitOutTitle}
                        </span>
                      )}
                      {sitOutPlayer?.name}
                    </span>
                    <span className="bye-result"> sits out this round</span>
                  </td>
                ) : (
                  <>
                    <td>
                      <span className="color-w" />
                      <span className="player-name">
                        {whiteTitle && (
                          <span
                            style={{
                              color: "#c25555",
                              marginRight: "4px",
                              fontWeight: 700,
                            }}
                          >
                            {whiteTitle}
                          </span>
                        )}
                        {b.white.name}
                      </span>{" "}
                      <span className="rating-tag">({b.white.rating})</span>
                    </td>
                    <td>
                      <span className="color-b" />
                      <span className="player-name">
                        {blackTitle && (
                          <span
                            style={{
                              color: "#c25555",
                              marginRight: "4px",
                              fontWeight: 700,
                            }}
                          >
                            {blackTitle}
                          </span>
                        )}
                        {b.black.name}
                      </span>{" "}
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
  const outletContext = useOutletContext();
  const t = outletContext?.t;
  const livePlayers = t?.players || [];

  return (
    <div className="team-matches">
      {pairings.map((p) =>
        p.type === "bye" ? (
          <div
            className="team-match-card bughouse-bye"
            key={p.idx}
            style={
              isBughouse
                ? {
                    background: "#13131a",
                    border: "1px solid #252532",
                    borderRadius: 12,
                    padding: 24,
                    textAlign: "center",
                    marginBottom: 24,
                    fontFamily: "'SF Mono', monospace",
                    color: "#e8e8e8",
                  }
                : {}
            }
          >
            <div className="team-match-bye">
              <span
                className="player-name"
                style={
                  isBughouse
                    ? {
                        color: "#d4a853",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }
                    : {}
                }
              >
                {p.teamName}
              </span>
              <span
                className="bye-result"
                style={
                  isBughouse
                    ? {
                        display: "block",
                        marginTop: 8,
                        color: "#8a8a9a",
                        fontSize: 12,
                      }
                    : {}
                }
              >
                BYE — FULL TEAM RECEIVES +1
              </span>
            </div>
          </div>
        ) : (
          <TeamMatch
            key={p.idx}
            p={p}
            results={results}
            onSetBoardResult={onSetBoardResult}
            isBughouse={isBughouse}
            livePlayers={livePlayers}
          />
        ),
      )}
    </div>
  );
}
