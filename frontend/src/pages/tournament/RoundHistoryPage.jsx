import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import RoundHistory from "../../components/RoundHistory.jsx";
import "../../css/RoundHistory.css";

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
      <div className="card">
        <p className="muted">
          No rounds completed yet — results will appear here once Round 1 is
          submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-header">
        <h2>Round History</h2>
      </div>
      <div className="round-picker">
        <div className="round-picker-scroll">
          {t.rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              className={`round-pill ${historyRound === r.round ? "active" : ""}`}
              onClick={() => setHistoryRound(r.round)}
            >
              <span className="round-pill-label">ROUND</span>
              <span className="round-pill-number">{r.round}</span>
            </button>
          ))}
        </div>
      </div>

      <RoundHistory
        format={t.format}
        round={t.rounds.find((r) => r.round === historyRound)}
      />
    </div>
  );
}
