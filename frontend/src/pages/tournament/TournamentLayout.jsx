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
import "../../css/TournamentLayout.css";
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
    // Elimination brackets pair themselves from the topology — there's no
    // adaptive "current round" to show, and t.rounds never gets populated
    // (results are recorded match-by-match, not round-by-round), so the
    // Pairings and Round History tabs have nothing to show. The Bracket tab
    // replaces both.
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
      <div className="container tl-root">
        <div className="banner-error">{error}</div>
      </div>
    );
  if (!t)
    return (
      <div className="container tl-root">
        <p className="muted">Loading…</p>
      </div>
    );

  return (
    <div className="container tl-root">
      <div className="tl-bg" aria-hidden="true">
        <div className="tl-bg-scene" />
        <div className="tl-bg-scene" />
        <div className="tl-bg-scene" />
      </div>

      <WinnerReveal t={t} />

      <div className="tourney-header-row">
        <div>
          <h1 className="page-title">{t.name}</h1>
          <p className="page-subtitle">
            {t.federation && `${t.federation} · `}
            {t.timeControl && `${t.timeControl} · `}
            {t.format === "team" ? "Team" : "Individual"} tournament · Round{" "}
            {t.currentRound}/{t.totalRounds} · {t.status}
          </p>
        </div>
      </div>

      <div className="sub-tabs">
        {tabsFor(t).map((tab) => (
          <NavLink
            key={tab.to}
            to={`/tournament/${id}/${tab.to}`}
            className={({ isActive }) => `sub-tab ${isActive ? "active" : ""}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet context={{ t, refresh }} />
    </div>
  );
}
