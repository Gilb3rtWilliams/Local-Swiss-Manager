import { useState } from "react";
import { api } from "../api.js";

// Shown on the Standings page whenever the tournament finished with a
// genuine tie for 1st (t.tieAlert) or already has a decider in some state
// (t.decider — active/complete/stuck). Renders nothing otherwise. Styling
// deliberately mirrors Standings.jsx's own inline-style dark theme rather
// than a shared stylesheet class, since that's the convention this page
// already uses.

const CARD = {
  background: "#13131a",
  border: "1px solid #252532",
  borderRadius: 12,
  padding: 24,
};
const MUTED = "#8a8a9a";
const GOLD = "#d4a853";
const RED = "#ff6b6b";

const RESULT_OPTIONS = [
  { value: "1-0", label: "1 – 0 (White wins)" },
  { value: "1/2-1/2", label: "½ – ½ (Draw)" },
  { value: "0-1", label: "0 – 1 (Black wins)" },
];

const selectStyle = {
  background: "#1a1a24",
  border: "1px solid #353545",
  color: "#e8e8e8",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  outline: "none",
  cursor: "pointer",
};

const buttonStyle = (disabled, tone = "primary") => ({
  background: tone === "danger" ? "#3a2222" : disabled ? "#1c1c26" : "#252532",
  border: `1px solid ${tone === "danger" ? "#5a3030" : "#353545"}`,
  color: tone === "danger" ? RED : "#e8e8e8",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  padding: "10px 16px",
  borderRadius: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: "inherit",
  opacity: disabled ? 0.5 : 1,
});

function GameRow({ game, editable, busy, onSubmit }) {
  const [result, setResult] = useState("");
  const done = !!game.result;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid #1c1c26",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
        {game.whiteName} <span style={{ color: MUTED }}>(White)</span>
        {"  vs  "}
        {game.blackName} <span style={{ color: MUTED }}>(Black)</span>
      </span>
      {done ? (
        <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>
          {game.result}
        </span>
      ) : editable ? (
        <>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value)}
            disabled={busy}
            style={selectStyle}
          >
            <option value="">– result –</option>
            {RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!result || busy}
            onClick={() => onSubmit(game.id, result)}
            style={buttonStyle(!result || busy)}
          >
            Save
          </button>
        </>
      ) : (
        <span style={{ color: MUTED, fontSize: 12 }}>not yet needed</span>
      )}
    </div>
  );
}

function LegCard({ leg, editable, busy, onGameResult, title }) {
  return (
    <div style={{ marginTop: 16 }}>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {title}
      </p>
      {leg.games.map((g) => (
        <GameRow
          key={g.id}
          game={g}
          editable={editable && !g.result}
          busy={busy}
          onSubmit={onGameResult}
        />
      ))}
    </div>
  );
}

function ArmageddonCard({ leg, editable, busy, onSubmit }) {
  const [white, setWhite] = useState("");
  const [result, setResult] = useState("");
  const done = !!leg.result;

  return (
    <div
      style={{
        marginTop: 16,
        background: "rgba(212, 168, 83, 0.06)",
        border: "1px solid rgba(212, 168, 83, 0.3)",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: GOLD,
        }}
      >
        Armageddon — Black has draw odds
      </p>
      {done ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          {leg.whiteName} (White) vs {leg.blackName} (Black) —{" "}
          <span style={{ color: GOLD, fontWeight: 700 }}>{leg.result}</span>
        </p>
      ) : editable ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: MUTED }}>
            Flip a coin, then set who's White:
          </span>
          <select
            value={white}
            onChange={(e) => setWhite(e.target.value)}
            disabled={busy}
            style={selectStyle}
          >
            <option value="">– White is… –</option>
            {leg.participantNames.map((name, i) => (
              <option key={leg.participants[i]} value={leg.participants[i]}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value)}
            disabled={busy || !white}
            style={selectStyle}
          >
            <option value="">– result –</option>
            {RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!white || !result || busy}
            onClick={() => onSubmit(white, result)}
            style={buttonStyle(!white || !result || busy)}
          >
            Save
          </button>
          <span style={{ fontSize: 11, color: MUTED, width: "100%" }}>
            A draw counts as a win for Black.
          </span>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>not yet needed</p>
      )}
    </div>
  );
}

export default function DeciderPanel({ t, refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bestOf, setBestOf] = useState(4);
  const [manualWinner, setManualWinner] = useState("");

  const tie = t.tieAlert;
  const decider = t.decider;

  if (!tie && !decider) return null;

  async function runAction(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const handleStart = () =>
    runAction(() => api.startDecider(t.id, { bestOf: Number(bestOf) }));
  const handleGameResult = (gameId, result) =>
    runAction(() => api.recordDeciderResult(t.id, { gameId, result }));
  const handleArmageddon = (white, black, result) =>
    runAction(() => api.recordDeciderResult(t.id, { white, black, result }));
  const handleCancel = () => {
    if (
      !window.confirm(
        "Cancel this decider? Its games will be discarded and the tie will need to be resolved again from scratch.",
      )
    )
      return;
    runAction(() => api.cancelDecider(t.id));
  };
  const handleManualResolve = () => {
    if (!manualWinner) return;
    runAction(() => api.resolveDeciderManually(t.id, manualWinner));
  };

  // ── No decider yet: just the tie banner + a way to start one ──
  if (!decider) {
    return (
      <div
        style={{
          ...CARD,
          border: "1px solid rgba(212, 168, 83, 0.35)",
          background: "rgba(212, 168, 83, 0.06)",
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: 14 }}>
          <strong>{tie.names.join(" and ")}</strong> are tied for 1st — same
          score and every tiebreak. Start a decider to crown a sole champion.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: MUTED,
            }}
          >
            Best of
            <select
              value={bestOf}
              onChange={(e) => setBestOf(e.target.value)}
              disabled={busy}
              style={selectStyle}
            >
              {[2, 4, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {tie.ids.length > 2 && (
              <span>(used once it narrows to 2 players)</span>
            )}
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={handleStart}
            style={buttonStyle(busy)}
          >
            {busy ? "Starting…" : "Start Playoff"}
          </button>
        </div>
        {tie.ids.length > 2 && (
          <p style={{ margin: "10px 0 0", fontSize: 11, color: MUTED }}>
            {tie.ids.length} players are tied — they'll play a mini round-robin
            first; if that doesn't produce a sole leader it narrows further from
            there.
          </p>
        )}
        {error && (
          <p style={{ margin: "10px 0 0", color: RED, fontSize: 12 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const currentLeg = decider.legs[decider.legs.length - 1];
  const isComplete = decider.status === "complete";
  const isStuck = decider.status === "stuck";

  return (
    <div style={CARD}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Tiebreak Decider
        </h2>
        <span style={{ fontSize: 11, color: MUTED }}>
          {decider.originalTiedNames.join(", ")}
        </span>
      </div>

      {isComplete && (
        <p style={{ margin: "16px 0 0", fontSize: 14 }}>
          🏆 <strong>{decider.winnerName}</strong> wins the playoff and takes
          1st place.
        </p>
      )}

      {isStuck && (
        <div
          style={{
            marginTop: 16,
            background: "rgba(255, 107, 107, 0.06)",
            border: "1px solid rgba(255, 107, 107, 0.3)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <p style={{ margin: "0 0 10px", fontSize: 13 }}>
            The tied group hasn't shrunk after two round-robin attempts — this
            needs a manual call.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={manualWinner}
              onChange={(e) => setManualWinner(e.target.value)}
              disabled={busy}
              style={selectStyle}
            >
              <option value="">– pick the winner –</option>
              {decider.originalTiedIds.map((id, i) => (
                <option key={id} value={id}>
                  {decider.originalTiedNames[i]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!manualWinner || busy}
              onClick={handleManualResolve}
              style={buttonStyle(!manualWinner || busy)}
            >
              Confirm Winner
            </button>
          </div>
        </div>
      )}

      {decider.legs.map((leg, i) => {
        const isCurrent = leg === currentLeg;
        const editable = isCurrent && !isComplete && !isStuck;
        const title =
          leg.kind === "round_robin"
            ? `Mini Round-Robin (${leg.participantNames.join(", ")})`
            : leg.kind === "match"
            ? `Best of ${decider.bestOf} — ${leg.participantNames.join(" vs ")}`
            : null;

        if (leg.kind === "armageddon") {
          return (
            <ArmageddonCard
              key={i}
              leg={leg}
              editable={editable}
              busy={busy}
              onSubmit={(white, result) => {
                const black = leg.participants.find((id) => id !== white);
                handleArmageddon(white, black, result);
              }}
            />
          );
        }
        return (
          <LegCard
            key={i}
            leg={leg}
            title={title}
            editable={editable}
            busy={busy}
            onGameResult={handleGameResult}
          />
        );
      })}

      {!isComplete && (
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            disabled={busy}
            onClick={handleCancel}
            style={buttonStyle(busy, "danger")}
          >
            Cancel Decider
          </button>
        </div>
      )}

      {error && (
        <p style={{ margin: "12px 0 0", color: RED, fontSize: 12 }}>{error}</p>
      )}
    </div>
  );
}
