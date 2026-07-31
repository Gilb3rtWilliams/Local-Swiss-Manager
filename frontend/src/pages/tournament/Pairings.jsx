import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import PairingsIndividual from "../../components/PairingsIndividual.jsx";
import PairingsTeam from "../../components/PairingsTeam.jsx";

export default function Pairings() {
  const { t, refresh } = useOutletContext();
  const navigate = useNavigate();
  const isTeam = t.format === "team";
  const isBughouse = t.variant === "bughouse";

  const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);
  function boardsNeedingDecision(p) {
    const real = p.boards.filter((b) => !b.sitOut);
    if (!isBughouse) return real;
    const decisive = real.find((b) =>
      DECISIVE_RESULTS.has(results[`${p.idx}-${b.boardNum}`]),
    );
    return decisive ? [decisive] : real;
  }

  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [lateOpen, setLateOpen] = useState(false);
  const [lateName, setLateName] = useState("");
  const [lateRating, setLateRating] = useState("");
  const [lateTeam, setLateTeam] = useState("");
  const [lateError, setLateError] = useState("");

  if (!t.currentPairings) {
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
        <p style={{ margin: "0 0 16px 0" }}>No round is currently open.</p>
        <button
          type="button"
          onClick={() => navigate(`/tournament/${t.id}/overview`)}
          style={{
            background: "#252532",
            border: "1px solid #353545",
            color: "#e8e8e8",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            padding: "10px 18px",
            borderRadius: 8,
            cursor: "pointer",
            textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          Go generate the next round →
        </button>
      </div>
    );
  }

  function setIndividualResult(pairIdx, result) {
    setResults((r) => ({ ...r, [pairIdx]: result }));
  }
  function setBoardResult(pairIdx, boardNum, result) {
    setResults((r) => ({ ...r, [`${pairIdx}-${boardNum}`]: result }));
  }

  const activeGames = t.currentPairings.filter((p) => p.type !== "bye");
  const totalDecisions = isTeam
    ? activeGames.reduce((sum, p) => sum + boardsNeedingDecision(p).length, 0)
    : activeGames.length;
  const decidedCount = isTeam
    ? activeGames.reduce(
        (sum, p) =>
          sum +
          boardsNeedingDecision(p).filter(
            (b) => results[`${p.idx}-${b.boardNum}`],
          ).length,
        0,
      )
    : activeGames.filter((p) => results[p.idx]).length;
  const allSet = totalDecisions === decidedCount;

  async function handleSubmitResults() {
    setBusy(true);
    setError("");
    try {
      const payload = isTeam
        ? Object.entries(results).map(([key, result]) => {
            const [pairIndex, boardNum] = key.split("-").map(Number);
            return { pairIndex, boardNum, result };
          })
        : Object.entries(results).map(([pairIndex, result]) => ({
            pairIndex: Number(pairIndex),
            result,
          }));
      await api.submitResults(t.id, payload);
      setResults({});
      refresh();
      navigate(`/tournament/${t.id}/standings`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddLate(e) {
    e.preventDefault();
    setLateError("");
    if (!lateName.trim()) {
      setLateError("Enter a name.");
      return;
    }
    if (isTeam && !lateTeam) {
      setLateError("Choose a team.");
      return;
    }
    try {
      await api.addLatePlayer(t.id, {
        name: lateName,
        rating: lateRating,
        teamId: isTeam ? lateTeam : undefined,
      });
      setLateName("");
      setLateRating("");
      refresh();
    } catch (err) {
      setLateError(err.message);
    }
  }

  const inputStyle = {
    background: "#1a1a24",
    border: "1px solid #353545",
    color: "#e8e8e8",
    padding: "10px 12px",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const btnStyle = (disabled) => ({
    background: disabled ? "#1a1a24" : "#252532",
    border: `1px solid ${disabled ? "#252532" : "#353545"}`,
    color: disabled ? "#6b6b7b" : "#e8e8e8",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    padding: "10px 18px",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  });

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            borderBottom: "1px solid #252532",
            paddingBottom: 12,
            flexWrap: "wrap",
            gap: 12,
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
            Round {t.currentRound} Pairings
          </h2>
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
            Round {t.currentRound} / {t.totalRounds}
          </span>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(255, 107, 107, 0.1)",
              border: "1px solid rgba(255, 107, 107, 0.3)",
              color: "#ff6b6b",
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {isTeam ? (
          <PairingsTeam
            pairings={t.currentPairings}
            results={results}
            onSetBoardResult={setBoardResult}
            isBughouse={isBughouse}
          />
        ) : (
          <PairingsIndividual
            pairings={t.currentPairings}
            results={results}
            onSetResult={setIndividualResult}
          />
        )}

        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            disabled={!allSet || busy}
            onClick={handleSubmitResults}
            style={btnStyle(!allSet || busy)}
          >
            {busy
              ? "SUBMITTING…"
              : t.currentRound === t.totalRounds
                ? "FINISH TOURNAMENT"
                : "SUBMIT & PAIR NEXT ROUND"}
          </button>
        </div>
      </div>

      {t.currentRound <= 1 && t.status !== "finished" && (
        <div
          style={{
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              marginBottom: lateOpen ? 20 : 0,
              borderBottom: lateOpen ? "1px solid #252532" : "none",
              paddingBottom: lateOpen ? 12 : 0,
            }}
            onClick={() => setLateOpen((o) => !o)}
          >
            <h2
              style={{
                color: "#8a8a9a",
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              Late Registration
            </h2>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLateOpen((o) => !o);
              }}
              style={{
                background: "#252532",
                border: "1px solid #353545",
                color: "#e8e8e8",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                textTransform: "uppercase",
                fontFamily: "inherit",
              }}
            >
              {lateOpen ? "− Late Registration" : "+ Late Registration"}
            </button>
          </div>
          {lateOpen && (
            <form onSubmit={handleAddLate}>
              <p
                style={{
                  color: "#8a8a9a",
                  fontSize: 12,
                  lineHeight: 1.5,
                  marginTop: 0,
                  marginBottom: 16,
                }}
              >
                Add a competitor who missed the start. They receive a BYE (+1)
                if Round 1 is already open, and join from the next round onward.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <input
                  type="text"
                  placeholder="Player name"
                  value={lateName}
                  onChange={(e) => setLateName(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="number"
                  placeholder="Rating"
                  min="0"
                  max="3500"
                  value={lateRating}
                  onChange={(e) => setLateRating(e.target.value)}
                  style={inputStyle}
                />
                {isTeam && (
                  <select
                    value={lateTeam}
                    onChange={(e) => setLateTeam(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Choose team…</option>
                    {t.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  type="submit"
                  style={{
                    background: "#252532",
                    border: "1px solid #353545",
                    color: "#e8e8e8",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    padding: "10px 18px",
                    borderRadius: 8,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    fontFamily: "inherit",
                  }}
                >
                  Add Late Joiner
                </button>
                {lateError && (
                  <span
                    style={{ color: "#ff6b6b", fontSize: 11, fontWeight: 600 }}
                  >
                    {lateError}
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
