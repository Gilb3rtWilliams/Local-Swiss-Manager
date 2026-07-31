import { useEffect, useRef, useState } from "react";
import Confetti from "./Confetti.jsx";
import Fireworks from "./Fireworks.jsx";
import { playFanfare } from "../useFanfare.js";
import "../css/WinnerReveal.css";

const MEDALS = [
  { place: "1st", cls: "wr-gold", trophy: "🥇" },
  { place: "2nd", cls: "wr-silver", trophy: "🥈" },
  { place: "3rd", cls: "wr-bronze", trophy: "🥉" },
];

function scoreOf(c) {
  return c.score ?? c.points ?? c.pts ?? 0;
}

export default function WinnerReveal({ t }) {
  const celebratedRef = useRef(false);
  const [stage, setStage] = useState("idle");
  const [dismissed, setDismissed] = useState(false);
  const [triggerFlash, setTriggerFlash] = useState(false);

  useEffect(() => {
    if (t && t.status === "finished" && !celebratedRef.current) {
      celebratedRef.current = true;
      setDismissed(false);
      setStage("suspense");
    }
    if (t && t.status !== "finished") {
      celebratedRef.current = false;
      setStage("idle");
    }
  }, [t]);

  useEffect(() => {
    if (stage !== "suspense") return;
    const timer = setTimeout(() => {
      playFanfare();
      setTriggerFlash(true);
      setStage("reveal");
    }, 1900);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "reveal") return;
    const timer = setTimeout(() => setStage("podium"), 1600);
    return () => clearTimeout(timer);
  }, [stage]);

  if (!t || t.status !== "finished" || stage === "idle") return null;

  const isTeam = t.format === "team";
  const standingsList = isTeam ? t.teamStandings : t.standings;
  const top3 = (standingsList || []).slice(0, 3);
  const winnerName = t.winner || top3[0]?.name || "Champion";
  const showEffects = stage === "reveal" || stage === "podium";

  return (
    <>
      {showEffects && <Confetti duration={20000} />}
      {showEffects && <Fireworks duration={20000} launchInterval={500} />}

      {!dismissed && (
        <div
          className={`wr-overlay wr-stage-${stage} ${triggerFlash ? "wr-flash" : ""}`}
        >
          {stage === "suspense" && (
            <div className="wr-suspense">
              <p className="wr-suspense-text">
                And the winner is
                <span className="wr-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </p>
            </div>
          )}

          {showEffects && (
            <div className="wr-reveal">
              <div className="wr-trophy">🏆</div>
              <h1 className="wr-winner-name">{winnerName}</h1>
              <p className="wr-winner-sub">
                {isTeam ? "Team Champions" : "Tournament Champion"}
              </p>
            </div>
          )}

          {stage === "podium" && top3.length > 0 && (
            <div className="wr-podium">
              {top3.map((c, i) => (
                <div
                  className={`wr-podium-card ${MEDALS[i].cls}`}
                  key={c.id || c.name}
                >
                  <div className="wr-medal">{MEDALS[i].trophy}</div>
                  <div className="wr-podium-place">{MEDALS[i].place}</div>
                  <div className="wr-podium-name">{c.name}</div>
                  <div className="wr-podium-score">{scoreOf(c)} pts</div>
                </div>
              ))}
            </div>
          )}

          {stage === "podium" && (
            <button className="wr-dismiss" onClick={() => setDismissed(true)}>
              View Full Standings ↓
            </button>
          )}
        </div>
      )}
    </>
  );
}
