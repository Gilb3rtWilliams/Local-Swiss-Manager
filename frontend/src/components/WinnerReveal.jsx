import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
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

// Dedicated component to handle the specific interaction flow safely
const RevealPrompt = ({ closeToast, onAccept, onDecline }) => {
  const [accepted, setAccepted] = useState(false);

  if (accepted) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "12px 0",
          fontSize: "14px",
          fontWeight: 600,
          color: "#e8e8e8",
        }}
      >
        Okay, let's see who our winners are!
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "4px",
      }}
    >
      {/* The CSS Firework Animation triggers when this mounts */}
      <div className="wr-mini-burst"></div>

      <span style={{ fontSize: "14px", fontWeight: 600, color: "#e8e8e8" }}>
        Play the winner reveal?
      </span>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          className="wr-dismiss"
          style={{ padding: "6px 16px", margin: 0, fontSize: "12px" }}
          onClick={() => {
            onDecline();
            closeToast();
          }}
        >
          No
        </button>
        <button
          className="wr-dismiss"
          style={{
            padding: "6px 16px",
            margin: 0,
            fontSize: "12px",
            background: "#e8e8e8",
            color: "#0a0a0e",
            borderColor: "#e8e8e8",
          }}
          onClick={() => {
            setAccepted(true);
            setTimeout(() => {
              onAccept();
              closeToast();
            }, 1800); // Gives you 1.8s to read the response before it starts
          }}
        >
          Yes
        </button>
      </div>
    </div>
  );
};

export default function WinnerReveal({ t }) {
  // Tracks which tournament id this component last evaluated. WinnerReveal
  // lives inside TournamentLayout, which React Router reuses across every
  // /tournament/:id navigation — clicking a different tournament from the
  // Dashboard does NOT remount this component, it just re-renders it with
  // new props. Without this, celebratedRef below would latch permanently
  // after the very first tournament you ever view in a session, silently
  // breaking the whole feature (no prompt, no auto-play) for every
  // tournament after that.
  const lastTournamentIdRef = useRef(null);
  const celebratedRef = useRef(false);
  const [stage, setStage] = useState("idle");
  const [dismissed, setDismissed] = useState(false);
  const [triggerFlash, setTriggerFlash] = useState(false);

  useEffect(() => {
    if (!t) return;

    // True on the actual first mount, AND every time you navigate to a
    // *different* tournament than the one this component last evaluated —
    // both cases mean "the person just arrived here," which is exactly
    // when a finished tournament should ask before celebrating rather than
    // auto-play.
    const isFreshArrival = t.id !== lastTournamentIdRef.current;
    if (isFreshArrival) {
      lastTournamentIdRef.current = t.id;
      celebratedRef.current = false;
      setStage("idle");
      setDismissed(false);
      setTriggerFlash(false);
    }

    if (t.status === "finished" && !celebratedRef.current) {
      if (isFreshArrival) {
        toast(
          <RevealPrompt
            onAccept={() => {
              celebratedRef.current = true;
              setDismissed(false);
              setStage("suspense");
            }}
            onDecline={() => {
              celebratedRef.current = true;
            }}
          />,
          {
            position: "top-right",
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            className: "wr-toast-custom",
          },
        );
      } else {
        // Not a fresh arrival — this tournament just transitioned to
        // finished while already being viewed (e.g. the last result was
        // just submitted), so celebrate immediately without asking.
        celebratedRef.current = true;
        setDismissed(false);
        setStage("suspense");
      }
    }

    if (t.status !== "finished") {
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
          className={`wr-overlay wr-stage-${stage} ${
            triggerFlash ? "wr-flash" : ""
          }`}
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
