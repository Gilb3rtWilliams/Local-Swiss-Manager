import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api.js";

let uidCounter = 0;
function rowId() {
  return `row-${++uidCounter}`;
}

function competitorLabel(c, isTeam) {
  if (isTeam) {
    const count = c.playerIds?.length ?? c.players?.length ?? 0;
    return `${c.name} (${count})`;
  }
  return c.rating != null ? `${c.name} (${c.rating})` : c.name;
}

// A single draggable competitor chip — used both in the unpaired pool and
// inside a filled slot, so a placed competitor can be re-dragged straight
// to a different slot (or back to the pool) without needing to clear it
// first.
function CompetitorChip({ c, isTeam, onDragStart, dimmed }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        onDragStart?.(c.id);
      }}
      style={{
        background: dimmed ? "#1a1a24" : "#252532",
        border: "1px solid #353545",
        borderRadius: 8,
        padding: "10px 12px",
        color: "#e8e8e8",
        fontSize: 13,
        fontWeight: 600,
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {competitorLabel(c, isTeam)}
    </div>
  );
}

// One White/Black slot within a pairing row. Accepts a drop, shows the
// placed chip (still draggable — dragging it out or onto another slot moves
// it there), or an empty placeholder that highlights while something's
// being dragged over it.
function Slot({ label, competitor, isTeam, onDrop, onClear, onDragStart }) {
  const [over, setOver] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#6b6b7b",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData("text/plain");
          if (id) onDrop(id);
        }}
        style={{
          minHeight: 46,
          border: `1px dashed ${over ? "#d4a853" : "#353545"}`,
          borderRadius: 8,
          background: over ? "rgba(212, 168, 83, 0.08)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: competitor ? "space-between" : "center",
          padding: competitor ? "0 10px" : 0,
          gap: 8,
          transition: "all 0.15s ease",
        }}
      >
        {competitor ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CompetitorChip
                c={competitor}
                isTeam={isTeam}
                onDragStart={onDragStart}
              />
            </div>
            <button
              type="button"
              onClick={onClear}
              aria-label="Remove"
              style={{
                background: "transparent",
                border: "none",
                color: "#6b6b7b",
                cursor: "pointer",
                fontSize: 14,
                padding: 4,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </>
        ) : (
          <span style={{ color: "#4a4a5a", fontSize: 11 }}>Drop here</span>
        )}
      </div>
    </div>
  );
}

export default function ManualPairing() {
  const { t, refresh } = useOutletContext();
  const navigate = useNavigate();
  const isTeam = t.format === "team";

  const pool = useMemo(
    () => (isTeam ? t.teams : t.players),
    [isTeam, t.teams, t.players],
  );
  const byId = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const [rows, setRows] = useState(() =>
    Array.from({ length: Math.floor(pool.length / 2) }, () => ({
      id: rowId(),
      whiteId: null,
      blackId: null,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const placedIds = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => {
      if (r.whiteId) s.add(r.whiteId);
      if (r.blackId) s.add(r.blackId);
    });
    return s;
  }, [rows]);

  const unplaced = pool.filter((c) => !placedIds.has(c.id));
  const isOdd = pool.length % 2 === 1;
  // The bye isn't a drop target — it's just whoever is left over once every
  // pairing row is filled. Nothing to drag, nothing to configure.
  const byeCandidate =
    isOdd && unplaced.length === 1 && rows.every((r) => r.whiteId && r.blackId)
      ? unplaced[0]
      : null;

  const readyToFinish = isOdd
    ? unplaced.length === 1 && Boolean(byeCandidate)
    : unplaced.length === 0 && rows.every((r) => r.whiteId && r.blackId);

  // Places competitorId into (rowId, side), clearing it from wherever it
  // was before (another slot, or nowhere if it came from the pool) —
  // whatever previously occupied the target slot is simply no longer
  // referenced by any row afterward, so it falls back into the unpaired
  // pool automatically.
  function placeInSlot(targetRowId, side, competitorId) {
    setRows((rs) =>
      rs.map((r) => {
        const cleared = {
          ...r,
          whiteId: r.whiteId === competitorId ? null : r.whiteId,
          blackId: r.blackId === competitorId ? null : r.blackId,
        };
        if (r.id !== targetRowId) return cleared;
        return { ...cleared, [side]: competitorId };
      }),
    );
  }

  function clearSlot(targetRowId, side) {
    setRows((rs) =>
      rs.map((r) => (r.id === targetRowId ? { ...r, [side]: null } : r)),
    );
  }

  // Pool itself is a drop target too — dragging a placed competitor back
  // here un-places them.
  function handlePoolDrop(e) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        whiteId: r.whiteId === id ? null : r.whiteId,
        blackId: r.blackId === id ? null : r.blackId,
      })),
    );
  }

  function swapRow(targetRowId) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === targetRowId
          ? { ...r, whiteId: r.blackId, blackId: r.whiteId }
          : r,
      ),
    );
  }

  async function handleFinish() {
    setBusy(true);
    setError("");
    try {
      const pairs = rows.map((r) => ({
        aId: r.whiteId,
        bId: r.blackId,
        color: "aWhite",
      }));
      const payload = { pairs };
      if (byeCandidate) payload.byeId = byeCandidate.id;
      await api.generateManualRound(t.id, payload);
      refresh();
      navigate(`/tournament/${t.id}/pairings`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const nextRoundLabel =
    t.currentRound === 0 ? "Round 1" : `Round ${t.currentRound + 1}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
        color: "#e8e8e8",
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
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 12,
            borderBottom: "1px solid #252532",
            paddingBottom: 12,
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
            Manual Pairing — {nextRoundLabel}
          </h2>
          <button
            type="button"
            onClick={() => navigate(`/tournament/${t.id}/overview`)}
            style={{
              background: "transparent",
              border: "1px solid #353545",
              color: "#8a8a9a",
              fontSize: 11,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
        </div>

        <p
          style={{ color: "#8a8a9a", fontSize: 12, lineHeight: 1.6, margin: 0 }}
        >
          Drag {isTeam ? "teams" : "players"} from the pool into a White or
          Black slot to pair them.{" "}
          {isOdd &&
            "Whoever's left over once every pairing is filled automatically gets the bye."}
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(255, 107, 107, 0.1)",
            border: "1px solid rgba(255, 107, 107, 0.3)",
            color: "#ff6b6b",
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Unpaired pool */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePoolDrop}
          style={{
            background: "#13131a",
            border: "1px solid #252532",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 120,
            position: "sticky",
            top: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#6b6b7b",
            }}
          >
            Unpaired ({unplaced.length})
          </div>
          {unplaced.length === 0 ? (
            <p style={{ color: "#4a4a5a", fontSize: 11, margin: 0 }}>
              Everyone's placed.
            </p>
          ) : (
            unplaced.map((c) => (
              <CompetitorChip key={c.id} c={c} isTeam={isTeam} />
            ))
          )}
          {byeCandidate && (
            <div
              style={{
                marginTop: 4,
                background: "rgba(212, 168, 83, 0.1)",
                border: "1px solid rgba(212, 168, 83, 0.3)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "#d4a853",
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              🕊 {byeCandidate.name} gets the bye (+1) this round
            </div>
          )}
        </div>

        {/* Pairing rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              style={{
                background: "#13131a",
                border: "1px solid #252532",
                borderRadius: 12,
                padding: 16,
                display: "flex",
                alignItems: "flex-end",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#4a4a5a",
                  marginBottom: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {isTeam ? "Match" : "Board"} {i + 1}
              </span>

              <Slot
                label="White"
                competitor={r.whiteId ? byId.get(r.whiteId) : null}
                isTeam={isTeam}
                onDrop={(id) => placeInSlot(r.id, "whiteId", id)}
                onClear={() => clearSlot(r.id, "whiteId")}
              />

              <button
                type="button"
                onClick={() => swapRow(r.id)}
                disabled={!r.whiteId && !r.blackId}
                aria-label="Swap colors"
                style={{
                  background: "#1a1a24",
                  border: "1px solid #353545",
                  color: "#8a8a9a",
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: r.whiteId || r.blackId ? "pointer" : "default",
                  opacity: r.whiteId || r.blackId ? 1 : 0.4,
                  fontFamily: "inherit",
                  marginBottom: 3,
                }}
              >
                ⇄
              </button>

              <Slot
                label="Black"
                competitor={r.blackId ? byId.get(r.blackId) : null}
                isTeam={isTeam}
                onDrop={(id) => placeInSlot(r.id, "blackId", id)}
                onClear={() => clearSlot(r.id, "blackId")}
              />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#13131a",
          border: "1px solid #252532",
          borderRadius: 12,
          padding: "24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <button
          type="button"
          disabled={!readyToFinish || busy}
          onClick={handleFinish}
          style={{
            background: !readyToFinish || busy ? "#1a1a24" : "#252532",
            border: `1px solid ${
              !readyToFinish || busy ? "#252532" : "#d4a853"
            }`,
            color: !readyToFinish || busy ? "#6b6b7b" : "#d4a853",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "12px 22px",
            borderRadius: 8,
            cursor: !readyToFinish || busy ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {busy ? "Pairing…" : "Finish & Start Round"}
        </button>
        {!readyToFinish && (
          <span style={{ color: "#6b6b7b", fontSize: 11 }}>
            {unplaced.length} {isTeam ? "team" : "player"}
            {unplaced.length === 1 ? "" : "s"} still need
            {unplaced.length === 1 ? "s" : ""} a slot.
          </span>
        )}
      </div>
    </div>
  );
}
