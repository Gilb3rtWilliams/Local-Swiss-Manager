import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import StandingsTable from "../../components/StandingsTable.jsx";
import TeamStandingsTable from "../../components/TeamStandingsTable.jsx";
import CrossTable from "../../components/CrossTable.jsx";

export default function Standings() {
  const { t } = useOutletContext();
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      await api.downloadStandingsExport(t.id);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const hasResults = isElimination
    ? t.bracket &&
      t.bracket.matches.some(
        (m) => m.status === "complete" || m.status === "bye",
      )
    : t.rounds.length > 0;

  if (!hasResults) {
    const message = isElimination
      ? "Standings will appear once the first bracket match is decided."
      : "Standings will appear once Round 1 results are submitted.";
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
        <p style={{ margin: 0 }}>{message}</p>
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
      {/* Top Bar with Export Action */}
      <div
        style={{
          display: "flex",
          justifyContent: isElimination ? "space-between" : "flex-end",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "0 4px",
        }}
      >
        {isElimination && (
          <p
            style={{
              margin: 0,
              color: "#8a8a9a",
              fontSize: 12,
              maxWidth: 600,
              lineHeight: 1.5,
            }}
          >
            Reflects results recorded so far in the bracket — updated the moment
            each match is decided, independent of any other match. See the
            Bracket tab for who's still alive.
          </p>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginLeft: "auto",
          }}
        >
          <button
            type="button"
            disabled={exporting}
            onClick={handleExport}
            style={{
              background: "#252532",
              border: "1px solid #353545",
              color: "#e8e8e8",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              padding: "10px 18px",
              borderRadius: 8,
              cursor: exporting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s ease",
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? "EXPORTING…" : "⬇ DOWNLOAD AS EXCEL"}
          </button>
          {exportError && (
            <span style={{ color: "#ff6b6b", fontSize: 11, fontWeight: 600 }}>
              {exportError}
            </span>
          )}
        </div>
      </div>

      {/* Main Tables Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "24px",
        }}
      >
        {/* Primary Standings Card */}
        <div
          style={{
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: "24px",
            overflowX: "auto",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#e8e8e8",
              marginTop: 0,
              marginBottom: 20,
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            Standings
          </h2>
          {isTeam && t.teamStandings ? (
            <TeamStandingsTable teamStandings={t.teamStandings} />
          ) : (
            <StandingsTable standings={t.standings} />
          )}
        </div>

        {/* Cross Table Card */}
        <div
          style={{
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: "24px",
            overflowX: "auto",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#e8e8e8",
              marginTop: 0,
              marginBottom: 20,
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            Cross Table
          </h2>
          <CrossTable crossTable={t.crossTable} />
        </div>
      </div>

      {/* Individual Board Standings (Team Events Only) */}
      {isTeam && (
        <div
          style={{
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: "24px",
            overflowX: "auto",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#e8e8e8",
              marginTop: 0,
              marginBottom: 20,
              borderBottom: "1px solid #252532",
              paddingBottom: 12,
            }}
          >
            Individual Board Standings
          </h2>
          <StandingsTable
            standings={t.standings}
            showTiebreaks={false}
            showTeam
          />
        </div>
      )}
    </div>
  );
}
