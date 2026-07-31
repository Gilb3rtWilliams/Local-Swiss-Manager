import { useEffect, useState, useCallback } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { api } from "../../api.js";
import WinnerReveal from "../../components/WinnerReveal.jsx";
import BackgroundSlideshow from "../../components/BackgroundSlideshow.jsx";

function isElimination(t) {
  return t.system === "single_elimination" || t.system === "double_elimination";
}

function tabsFor(t) {
  const tabs = [
    { to: "starting-rank", label: "Starting Rank" },
    { to: "overview", label: "Tournament" },
  ];
  if (isElimination(t)) {
    tabs.push({ to: "module", label: "Bracket" });
  } else {
    tabs.push({ to: "pairings", label: "Pairings" });
    tabs.push({ to: "rounds", label: "Round History" });
  }
  if (t.chess960) {
    tabs.push({ to: "chess960", label: "Chess960" });
  }
  tabs.push({ to: "standings", label: "Standings" });
  return tabs;
}

export function TournamentIndex() {
  const { t } = useOutletContext();
  const target = isElimination(t)
    ? "module"
    : t.currentPairings
      ? "pairings"
      : "overview";
  return <Navigate to={`/tournament/${t.id}/${target}`} replace />;
}

export default function TournamentLayout() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    api
      .getTournament(id)
      .then(setT)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setT(null);
    refresh();
  }, [id, refresh]);

  if (error)
    return (
      <div
        style={{
          padding: "40px",
          color: "#ff6b6b",
          fontFamily: "'SF Mono', Monaco, monospace",
          textAlign: "center",
        }}
      >
        {error}
      </div>
    );

  if (!t)
    return (
      <div
        style={{
          padding: "40px",
          color: "#8a8a9a",
          fontFamily: "'SF Mono', Monaco, monospace",
          textAlign: "center",
        }}
      >
        Loading…
      </div>
    );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0e",
        color: "#e8e8e8",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient Background Layer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 50% 0%, #1a1a2e 0%, transparent 60%), radial-gradient(circle at 100% 100%, #151520 0%, transparent 50%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <BackgroundSlideshow />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1024,
          margin: "0 auto",
          padding: "40px 20px",
        }}
      >
        <WinnerReveal t={t} />

        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "inline-block",
              border: "1px solid #353545",
              padding: "6px 16px",
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#8a8a9a",
              marginBottom: 16,
            }}
          >
            {t.federation && `${t.federation} · `}
            {t.timeControl && `${t.timeControl} · `}
            {t.format === "team" ? "Team" : "Individual"} · Round{" "}
            {t.currentRound}/{t.totalRounds} · {t.status}
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "#e8e8e8",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              margin: 0,
              textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            {t.name}
          </h1>
        </div>

        {/* Tabbed Navigation Control */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 40,
            background: "#13131a",
            padding: 8,
            borderRadius: 16,
            border: "1px solid #252532",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          {tabsFor(t).map((tab) => (
            <NavLink
              key={tab.to}
              to={`/tournament/${id}/${tab.to}`}
              style={({ isActive }) => ({
                padding: "10px 20px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
                transition: "all 0.2s ease",
                color: isActive ? "#fff" : "#8a8a9a",
                background: isActive ? "#252532" : "transparent",
                border: `1px solid ${isActive ? "#353545" : "transparent"}`,
                boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>

        {/* Content Outlet Container */}
        <div
          style={{
            background: "rgba(19, 19, 26, 0.6)",
            border: "1px solid #252532",
            borderRadius: 16,
            backdropFilter: "blur(10px)",
            padding: "32px",
          }}
        >
          <Outlet context={{ t, refresh }} />
        </div>
      </div>
    </div>
  );
}
