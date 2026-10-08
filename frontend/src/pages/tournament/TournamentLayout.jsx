import { useEffect, useState, useCallback } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { api } from "../../api.js";
import WinnerReveal from "../../components/WinnerReveal.jsx";
import ThemePicker from "../../components/ThemePicker.jsx";
import { useTheme } from "../../themes.js";
import "../../css/theme.css";

function isElimination(t) {
  return t.system === "single_elimination" || t.system === "double_elimination";
}

function isCageMatch(t) {
  return t.format === "match" && t.matchType === "cage";
}

function tabsFor(t) {
  if (isCageMatch(t)) {
    const tabs = [{ to: "cage-match", label: "Cage Match" }];
    // Only shown if at least one section actually uses Chess960 — matches
    // the individual/team tabsFor()'s existing "only show what's relevant"
    // pattern below.
    if (t.cageMatch.sections.some((s) => s.variant === "chess960")) {
      tabs.push({ to: "chess960", label: "Chess960" });
    }
    tabs.push({ to: "history", label: "Game History" });
    tabs.push({ to: "performance", label: "Section Performance" });
    return tabs;
  }

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
  if (t.matchPlay) {
    tabs.push({ to: "history", label: "Game History" });
  }
  tabs.push({ to: "standings", label: "Standings" });
  if (t.format === "team") {
    tabs.push({ to: "board-performance", label: "Board Performance" });
  }
  return tabs;
}

export function TournamentIndex() {
  const { t } = useOutletContext();
  const target = isCageMatch(t)
    ? "cage-match"
    : isElimination(t)
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
  const [theme, setTheme] = useTheme();

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
        className="tp-theme"
        data-theme={theme}
        style={{
          minHeight: "100vh",
          background: "var(--tp-bg, #13131a)",
          padding: "40px",
          color: "var(--tp-danger, #ff6b6b)",
          fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
          textAlign: "center",
        }}
      >
        {error}
      </div>
    );

  if (!t)
    return (
      <div
        className="tp-theme"
        data-theme={theme}
        style={{
          minHeight: "100vh",
          background: "var(--tp-bg, #13131a)",
          padding: "40px",
          color: "var(--tp-muted, #8a8a9a)",
          fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
          textAlign: "center",
        }}
      >
        Loading…
      </div>
    );

  return (
    <div
      className="tp-theme"
      data-theme={theme}
      style={{
        minHeight: "100vh",
        background: "var(--tp-bg, #13131a)",
        color: "var(--tp-text, #e8e8e8)",
        fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "100%",
          margin: "0 auto",
          padding: "40px 20px",
        }}
      >
        <WinnerReveal t={t} />

        <div
          style={{
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <Link
            to="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--tp-muted, #8a8a9a)",
              textDecoration: "none",
              border: "1px solid var(--tp-border, #252532)",
              padding: "8px 14px",
              borderRadius: 10,
              background: "var(--tp-bg, #13131a)",
              transition: "all 0.2s ease",
            }}
          >
            ← Back to Dashboard
          </Link>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>

        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "inline-block",
              border: "1px solid var(--tp-border-strong, #353545)",
              padding: "6px 16px",
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontFamily:
                "var(--tp-font-num, 'IBM Plex Mono', ui-monospace, 'SF Mono', Consolas, monospace)",
              color: "var(--tp-muted, #8a8a9a)",
              marginBottom: 16,
            }}
          >
            {t.federation && `${t.federation} · `}
            {isCageMatch(t) ? (
              <>
                Cage Match · {t.cageMatch.competitors.A.name} vs{" "}
                {t.cageMatch.competitors.B.name} · {t.status}
              </>
            ) : (
              <>
                {t.timeControl && `${t.timeControl} · `}
                {t.format === "team" ? "Team" : "Individual"}
                {t.matchPlay && " · Match Play"} · Round {t.currentRound}/
                {t.totalRounds} · {t.status}
              </>
            )}
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "var(--tp-text, #e8e8e8)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              margin: 0,
              textShadow:
                "0 2px 10px color-mix(in srgb, var(--tp-shadow-color, #000) 50%, transparent)",
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
            background: "var(--tp-bg, #13131a)",
            padding: 8,
            borderRadius: 16,
            border: "1px solid var(--tp-border, #252532)",
            boxShadow:
              "0 8px 32px color-mix(in srgb, var(--tp-shadow-color, #000) 40%, transparent)",
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
                color: isActive
                  ? "var(--tp-heading, #ffffff)"
                  : "var(--tp-muted, #8a8a9a)",
                background: isActive
                  ? "var(--tp-border, #252532)"
                  : "transparent",
                border: `1px solid ${
                  isActive ? "var(--tp-border-strong, #353545)" : "transparent"
                }`,
                boxShadow: isActive
                  ? "0 2px 8px color-mix(in srgb, var(--tp-shadow-color, #000) 20%, transparent)"
                  : "none",
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>

        {/* Content Outlet Container */}
        <div
          style={{
            background:
              "color-mix(in srgb, var(--tp-bg, #13131a) 60%, transparent)",
            border: "1px solid var(--tp-border, #252532)",
            borderRadius: 16,
            backdropFilter: "blur(10px)",
            padding: "32px",
          }}
        >
          <Outlet context={{ t, refresh, setTournament: setT }} />
        </div>
      </div>
    </div>
  );
}
