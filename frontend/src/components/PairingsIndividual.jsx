import React from "react";

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
            onClick={() => onSetResult(matchKey, r)}
            style={{
              background: isActive ? "#3a3a4a" : "transparent",
              border: `1px solid ${isActive ? "#5a5a6a" : "#2a2a35"}`,
              color: isActive ? "#fff" : "#8a8a9a",
              fontSize: 10,
              padding: "4px 6px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s ease",
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

export default function PairingsIndividual({ pairings, results, onSetResult }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        /* Ambient background effect applied to the parent container */
        background:
          "radial-gradient(circle at 50% 0%, #1f1f2e 0%, transparent 70%)",
        padding: "24px 0",
        borderRadius: "16px",
      }}
    >
      {pairings.map((p, i) => {
        // BYE MATCH
        if (p.type === "bye") {
          return (
            <div
              key={p.idx}
              style={{
                background: "#13131a",
                border: "1px solid #252532",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                color: "#e8e8e8",
              }}
            >
              <div
                style={{
                  color: "#d4a853",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {p.playerName}
              </div>
              <div
                style={{
                  display: "block",
                  marginTop: 8,
                  color: "#8a8a9a",
                  fontSize: 12,
                  letterSpacing: "0.05em",
                }}
              >
                BYE (+1)
              </div>
            </div>
          );
        }

        // STANDARD MATCH
        return (
          <div
            key={p.idx}
            style={{
              background: "#13131a",
              border: "1px solid #252532",
              borderRadius: 12,
              overflow: "hidden",
              color: "#e8e8e8",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 160px 1fr",
                minHeight: 120,
              }}
            >
              {/* White Player Side (Left) */}
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
                    background: "#f0e6d2",
                    color: "#1a1a20",
                    border: "1px solid #e0d5c0",
                  }}
                >
                  ♔
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
                    {p.whiteName}
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
                        background: "#f0e6d2",
                        border: "1px solid #e0d5c0",
                      }}
                    />
                    WHITE
                  </div>
                </div>
              </div>

              {/* Center (Results & Info) */}
              <div
                style={{
                  padding: "16px 12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRight: "1px solid #252532",
                  background: "rgba(25, 25, 34, 0.5)",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "#6b6b7b",
                  }}
                >
                  Board {i + 1}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#4a4a5a",
                    letterSpacing: "0.05em",
                  }}
                >
                  VS
                </div>
                <ResultButtons
                  results={results}
                  matchKey={p.idx}
                  onSetResult={onSetResult}
                />
              </div>

              {/* Black Player Side (Right) */}
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
                    {p.blackName}
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
                        background: "#252532",
                        border: "1px solid #454555",
                      }}
                    />
                    BLACK
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
                    background: "#252532",
                    color: "#e8e8e8",
                    border: "1px solid #353545",
                  }}
                >
                  ♚
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
