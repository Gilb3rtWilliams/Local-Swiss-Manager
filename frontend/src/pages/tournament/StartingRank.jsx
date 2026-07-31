import { useOutletContext } from "react-router-dom";

export default function StartingRank() {
  const { t } = useOutletContext();
  const isTeam = t.format === "team";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        color: "#e8e8e8",
        background:
          "radial-gradient(circle at 50% 0%, #1f1f2e 0%, transparent 70%)",
        padding: "8px 0",
        borderRadius: "16px",
      }}
    >
      <div
        style={{
          background: "#13131a",
          border: "1px solid #252532",
          borderRadius: 12,
          padding: "24px",
        }}
      >
        {/* Section Header */}
        <div
          style={{
            marginBottom: 16,
            borderBottom: "1px solid #252532",
            paddingBottom: 12,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#e8e8e8",
              margin: 0,
            }}
          >
            Starting Rank
          </h2>
        </div>

        <p
          style={{
            color: "#8a8a9a",
            fontSize: 12,
            lineHeight: 1.5,
            marginTop: 0,
            marginBottom: 24,
          }}
        >
          Seed order at the start of the event, highest rating first. This list
          doesn't change once play begins — late joiners are appended to the end
          rather than reshuffling everyone.
        </p>

        {isTeam ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            {t.startingRankList.map((team) => (
              <div
                key={team.id}
                style={{
                  background: "#181822",
                  border: "1px solid #252532",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {/* Team Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 18px",
                    background: "#13131a",
                    borderBottom: "1px solid #252532",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: "#252532",
                        color: "#d4a853",
                        border: "1px solid #353545",
                      }}
                    >
                      Seed {team.rank}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: "#e8e8e8",
                      }}
                    >
                      {team.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#8a8a9a",
                      background: "transparent",
                      border: "1px solid #252532",
                      padding: "3px 8px",
                      borderRadius: 4,
                    }}
                  >
                    avg {team.rating}
                  </span>
                </div>

                {/* Team Players Roster */}
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid #252532",
                          color: "#6b6b7b",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        <th style={{ padding: "10px 18px", width: 60 }}>#</th>
                        <th style={{ padding: "10px 18px" }}>Player</th>
                        <th
                          style={{ padding: "10px 18px", textAlign: "right" }}
                        >
                          Rating
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.players.map((p) => (
                        <tr
                          key={p.id}
                          style={{ borderBottom: "1px solid #1f1f2a" }}
                        >
                          <td
                            style={{ padding: "10px 18px", color: "#6b6b7b" }}
                          >
                            {p.startingRank}
                          </td>
                          <td
                            style={{
                              padding: "10px 18px",
                              fontWeight: 600,
                              color: "#e8e8e8",
                            }}
                          >
                            {p.name}
                          </td>
                          <td
                            style={{
                              padding: "10px 18px",
                              textAlign: "right",
                              color: "#8a8a9a",
                            }}
                          >
                            {p.rating}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Individual Players Starting Rank Table */
          <div
            style={{
              background: "#181822",
              border: "1px solid #252532",
              borderRadius: 10,
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #252532",
                    color: "#6b6b7b",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  <th style={{ padding: "12px 18px", width: 80 }}>Seed</th>
                  <th style={{ padding: "12px 18px" }}>Player</th>
                  <th style={{ padding: "12px 18px", textAlign: "right" }}>
                    Rating
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.startingRankList.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #1f1f2a" }}>
                    <td style={{ padding: "12px 18px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#d4a853",
                          background: "#252532",
                          padding: "3px 8px",
                          borderRadius: 4,
                        }}
                      >
                        #{p.rank}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 18px",
                        fontWeight: 600,
                        color: "#e8e8e8",
                      }}
                    >
                      {p.name}
                    </td>
                    <td
                      style={{
                        padding: "12px 18px",
                        textAlign: "right",
                        color: "#8a8a9a",
                      }}
                    >
                      {p.rating}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
