import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import RoundHistory from "../../components/RoundHistory.jsx";

export default function RoundHistoryPage() {
  const { t } = useOutletContext();
  const [historyRound, setHistoryRound] = useState(null);

  useEffect(() => {
    if (t.rounds.length === 0) {
      setHistoryRound(null);
      return;
    }
    setHistoryRound((prev) =>
      prev && t.rounds.some((r) => r.round === prev)
        ? prev
        : t.rounds[t.rounds.length - 1].round,
    );
  }, [t.rounds]);

  if (t.rounds.length === 0) {
    return (
      <div
        style={{
          background: "#13131a",
          border: "1px solid #252532",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "#8a8a9a",
          fontFamily: "'SF Mono', Monaco, monospace",
          fontSize: 14,
        }}
      >
        <p style={{ margin: 0 }}>
          No rounds completed yet — results will appear here once Round 1 is
          submitted.
        </p>
      </div>
    );
  }

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
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
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
            Round History
          </h2>
        </div>

        {/* Round Selector Pills */}
        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 12,
            marginBottom: 24,
            scrollbarWidth: "thin",
            scrollbarColor: "#252532 transparent",
          }}
        >
          {t.rounds.map((r) => {
            const isActive = historyRound === r.round;
            return (
              <button
                key={r.round}
                type="button"
                onClick={() => setHistoryRound(r.round)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px 18px",
                  borderRadius: 8,
                  background: isActive ? "#252532" : "transparent",
                  border: `1px solid ${isActive ? "#5a5a6a" : "#252532"}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  minWidth: 72,
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    color: isActive ? "#d4a853" : "#6b6b7b",
                    textTransform: "uppercase",
                  }}
                >
                  ROUND
                </span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: isActive ? "#fff" : "#8a8a9a",
                    marginTop: 2,
                  }}
                >
                  {r.round}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Round Display */}
        <RoundHistory
          format={t.format}
          round={t.rounds.find((r) => r.round === historyRound)}
        />
      </div>
    </div>
  );
}
