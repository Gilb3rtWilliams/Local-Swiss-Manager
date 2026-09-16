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

function isCageMatch(t) {
  return t.format === "match" && t.matchType === "cage";
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
        Play the winner reveal animation?
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

    if (t.status === "finished" && t.winner && !celebratedRef.current) {
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
        // Not a fresh arrival — either this tournament just transitioned to
        // finished-with-a-winner while already being viewed (the last
        // result was just submitted), or a tie that was live just got
        // resolved (a decider finished, or was resolved manually) — either
        // way, celebrate immediately without asking.
        celebratedRef.current = true;
        setDismissed(false);
        setStage("suspense");
      }
    }

    // Reset whenever there's no sole winner to celebrate yet — this covers
    // the tournament going back to active, AND a finished tournament that's
    // tied for 1st with no winner decided yet (t.winner is null while a
    // decider is pending/in progress). Resetting celebratedRef here, rather
    // than only checking status, is what lets the celebration correctly
    // fire the moment a tie *does* get resolved, instead of never firing at
    // all because an earlier tied render already latched celebratedRef.
    if (!(t.status === "finished" && t.winner)) {
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

  // stage only ever leaves "idle" once t.status === "finished" && t.winner
  // (see the effect above), so this check is mostly redundant with that —
  // but it's cheap insurance against a stray render slipping through if
  // that invariant ever changes.
  if (!t || t.status !== "finished" || !t.winner || stage === "idle")
    return null;

  const isTeam = t.format === "team";
  const isCage = isCageMatch(t);
  const standingsList = isTeam ? t.teamStandings : t.standings;
  const top3 = (standingsList || []).slice(0, 3);
  const boardMVPs = isTeam ? t.boardMVPs || [] : [];
  const winnerName = t.winner || top3[0]?.name || "Champion";
  const showEffects = stage === "reveal" || stage === "podium";

  // Cage Match has no standings table — the "podium" is just the two
  // competitors, so build that comparison directly off t.cageMatch rather
  // than off top3/boardMVPs (which stay empty for this format).
  let cageWinner = null;
  let cageRunnerUp = null;
  if (isCage && t.cageMatch) {
    const { competitors, winnerId, score } = t.cageMatch;
    const runnerUpId = winnerId === "A" ? "B" : "A";
    cageWinner = { ...competitors[winnerId], score: score[winnerId] };
    cageRunnerUp = { ...competitors[runnerUpId], score: score[runnerUpId] };
  }

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
              {isCage && cageWinner?.pictureUrl ? (
                <img
                  className="wr-cage-winner-photo"
                  src={cageWinner.pictureUrl}
                  alt=""
                />
              ) : (
                <div className="wr-trophy">🏆</div>
              )}
              <h1 className="wr-winner-name">{winnerName}</h1>
              <p className="wr-winner-sub">
                {isCage
                  ? "Cage Match Champion"
                  : isTeam
                  ? "Team Champions"
                  : "Tournament Champion"}
              </p>
              {isCage && cageWinner && (
                <p className="wr-cage-score-line">
                  Final Score: {cageWinner.score} – {cageRunnerUp.score}
                </p>
              )}
            </div>
          )}

          {stage === "podium" && isCage && cageWinner && (
            <div className="wr-cage-scorecard">
              <div className="wr-cage-competitor wr-cage-winner">
                {cageWinner.pictureUrl ? (
                  <img
                    className="wr-cage-avatar-sm"
                    src={cageWinner.pictureUrl}
                    alt=""
                  />
                ) : (
                  <div className="wr-cage-avatar-sm wr-cage-avatar-placeholder">
                    🎓
                  </div>
                )}
                <div className="wr-medal">🥇</div>
                <div className="wr-podium-name">{cageWinner.name}</div>
                <div className="wr-podium-score">{cageWinner.score} pts</div>
              </div>
              <div className="wr-cage-competitor">
                {cageRunnerUp.pictureUrl ? (
                  <img
                    className="wr-cage-avatar-sm"
                    src={cageRunnerUp.pictureUrl}
                    alt=""
                  />
                ) : (
                  <div className="wr-cage-avatar-sm wr-cage-avatar-placeholder">
                    🎓
                  </div>
                )}
                <div className="wr-podium-name">{cageRunnerUp.name}</div>
                <div className="wr-podium-score">{cageRunnerUp.score} pts</div>
              </div>
            </div>
          )}

          {stage === "podium" && (top3.length > 0 || boardMVPs.length > 0) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 32,
                justifyContent: "center",
                alignItems: "flex-start",
              }}
            >
              {top3.length > 0 && (
                <div>
                  {/* Only labeled when there's a second podium (board MVPs)
                      next to it to disambiguate from — the individual-format
                      case keeps its original unlabeled single podium. */}
                  {isTeam && boardMVPs.length > 0 && (
                    <p className="wr-winner-sub" style={{ marginBottom: 8 }}>
                      Team Champions
                    </p>
                  )}
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
                </div>
              )}

              {isTeam && boardMVPs.length > 0 && (
                <div>
                  <p className="wr-winner-sub" style={{ marginBottom: 8 }}>
                    Best Individual Boards
                  </p>
                  <div className="wr-podium">
                    {boardMVPs.map((p, i) => (
                      <div
                        className={`wr-podium-card ${MEDALS[i].cls}`}
                        key={p.id}
                      >
                        <div className="wr-medal">{MEDALS[i].trophy}</div>
                        <div className="wr-podium-place">{MEDALS[i].place}</div>
                        <div className="wr-podium-name">{p.name}</div>
                        <div className="wr-podium-score">{p.score} pts</div>
                        <div
                          style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}
                        >
                          {p.teamName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {stage === "podium" && (
            <button className="wr-dismiss" onClick={() => setDismissed(true)}>
              {isCage ? "Back to Match ↓" : "View Full Standings ↓"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
