import { useMemo } from "react";
import "../css/Bracket.css";

// Extracted from Module.jsx so both the organizer's interactive bracket page
// and the public read-only view (PublicResults.jsx) render from one source
// of truth — same layout math, same cards, same connector lines. This file
// is purely presentational: it takes a bracket + an onOpenMatch callback and
// draws it. Click handling, the score modal, and result submission all stay
// in Module.jsx, which is the only place that needs them.

// ─── Layout geometry ─────────────────────────────────────────────────────────
// Cards are a fixed size and positioned with plain arithmetic (no DOM
// measuring, no flexbox tricks) so the SVG connector lines and the cards
// always agree, no matter which match is expanded or how the data changes.
const CARD_W = 216;
const CARD_H = 64;
const ROUND_GAP = 64;
const ROW_GAP = 28;
const UNIT = CARD_H + ROW_GAP;
const COLUMN_W = CARD_W + ROUND_GAP;
const SECTION_GAP = UNIT * 1.4;

function byRound(matches) {
  const map = new Map();
  matches.forEach((m) => {
    if (!map.has(m.round)) map.set(m.round, []);
    map.get(m.round).push(m);
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, ms]) => ms);
}

// Positions every match in a single bracket section (all matches sharing one
// `bracket` code) top-to-bottom, round 1 evenly spaced, every later round
// centered on the matches that feed it (falling back to whatever a match's
// slots reference if none of its own bracket's matches are positioned yet —
// this is what seeds a losers-bracket round 1 from winners-bracket losers).
function layoutSection(sectionMatches, byId, centers) {
  const rounds = byRound(sectionMatches);
  if (rounds.length === 0) return { rounds, height: 0 };

  rounds[0].forEach((m, i) => centers.set(m.id, UNIT / 2 + i * UNIT));

  for (let r = 1; r < rounds.length; r++) {
    rounds[r].forEach((m) => {
      const refs = [m.slotA, m.slotB]
        .filter((s) => s && s.matchId)
        .map((s) => byId.get(s.matchId))
        .filter(Boolean);
      const sameSection = refs.filter(
        (src) => src.bracket === m.bracket && centers.has(src.id),
      );
      const pool = sameSection.length
        ? sameSection
        : refs.filter((src) => centers.has(src.id));
      const avg = pool.length
        ? pool.reduce((sum, src) => sum + centers.get(src.id), 0) / pool.length
        : (rounds[r - 1].length ? centers.get(rounds[r - 1][0].id) : 0) || 0;
      centers.set(m.id, avg);
    });
  }

  return { rounds, height: rounds[0].length * UNIT };
}

// Computes { x, y } (card center) for every match, plus the overall canvas
// size and the list of connector edges to draw.
function computeLayout(matches) {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const centers = new Map();

  const wMatches = matches.filter((m) => m.bracket === "W");
  const lMatches = matches.filter((m) => m.bracket === "L");
  const gfMatches = matches
    .filter((m) => m.bracket === "GF")
    .sort((a, b) => a.round - b.round);

  const wSection = layoutSection(wMatches, byId, centers);
  const lSection = layoutSection(lMatches, byId, centers);

  const lOffset = wSection.height > 0 ? wSection.height + SECTION_GAP : 0;
  lSection.rounds
    .flat()
    .forEach((m) => centers.set(m.id, centers.get(m.id) + lOffset));

  const maxRounds = Math.max(wSection.rounds.length, lSection.rounds.length);

  gfMatches.forEach((m) => {
    const refs = [m.slotA, m.slotB]
      .filter((s) => s && s.matchId)
      .map((s) => byId.get(s.matchId))
      .filter((src) => src && centers.has(src.id));
    const y = refs.length
      ? refs.reduce((sum, src) => sum + centers.get(src.id), 0) / refs.length
      : (centers.get(gfMatches[0].id) ??
        (wSection.height + lSection.height) / 2);
    centers.set(m.id, y);
  });

  // x positions
  const xOf = new Map();
  wSection.rounds.forEach((round, ri) =>
    round.forEach((m) => xOf.set(m.id, ri * COLUMN_W)),
  );
  lSection.rounds.forEach((round, ri) =>
    round.forEach((m) => xOf.set(m.id, ri * COLUMN_W)),
  );
  gfMatches.forEach((m, i) => xOf.set(m.id, (maxRounds + i) * COLUMN_W));

  const positions = new Map();
  matches.forEach((m) => {
    if (!centers.has(m.id) || !xOf.has(m.id)) return;
    positions.set(m.id, { x: xOf.get(m.id), y: centers.get(m.id) });
  });

  const totalWidth =
    (maxRounds + gfMatches.length) * COLUMN_W - ROUND_GAP + CARD_W;
  const totalHeight =
    (lSection.height > 0 ? lOffset + lSection.height : wSection.height) || UNIT;

  // Connector edges: same-bracket winner links, plus anything feeding a
  // Grand Final match (cross-bracket by definition), plus GF -> GF-Reset.
  const edges = [];
  matches.forEach((m) => {
    [m.slotA, m.slotB].forEach((slot) => {
      if (!slot || !slot.matchId) return;
      const src = byId.get(slot.matchId);
      if (!src || !positions.has(src.id) || !positions.has(m.id)) return;
      if (
        m.bracket === "GF" ||
        (slot.type === "winner" && src.bracket === m.bracket)
      ) {
        edges.push({ from: src.id, to: m.id });
      }
    });
  });
  const gf = gfMatches[0];
  const gfReset = gfMatches[1];
  if (
    gf &&
    gfReset &&
    positions.has(gf.id) &&
    positions.has(gfReset.id) &&
    gfReset.status !== "skipped"
  ) {
    edges.push({ from: gf.id, to: gfReset.id });
  }

  return {
    positions,
    wRounds: wSection.rounds,
    lRounds: lSection.rounds,
    gfMatches,
    totalWidth: Math.max(totalWidth, CARD_W),
    totalHeight,
    edges,
  };
}

function wbRoundLabel(round, totalRounds, isDouble) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return isDouble ? "Winners Final" : "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Quarterfinal";
  return `Round ${round}`;
}
function lbRoundLabel(round, totalRounds) {
  return round === totalRounds ? "Losers Final" : `Losers Rd ${round}`;
}

// ─── Presentational pieces ───────────────────────────────────────────────────

function statusMeta(status) {
  switch (status) {
    case "ready":
      return { label: "Ready", className: "bx-badge-ready" };
    case "complete":
      return { label: "Final", className: "bx-badge-complete" };
    case "bye":
      return { label: "Bye", className: "bx-badge-bye" };
    case "skipped":
      return { label: "", className: "bx-badge-skipped" };
    default:
      return { label: "", className: "bx-badge-pending" };
  }
}

function seedBadge(seeds, competitor) {
  if (!competitor) return null;
  const s = seeds.find((x) => x.id === competitor.id);
  return s ? s.seed + 1 : null;
}

function MatchNode({ match, seeds, onOpen }) {
  const meta = statusMeta(match.status);
  const clickable = match.status === "ready";
  const a = match.competitorA;
  const b = match.competitorB;
  const aWin = match.status === "complete" && match.winnerId === a?.id;
  const bWin = match.status === "complete" && match.winnerId === b?.id;

  return (
    <div
      className={`bx-card ${meta.className}${clickable ? " bx-card-clickable" : ""}`}
      style={{ width: CARD_W, height: CARD_H }}
      onClick={clickable ? () => onOpen(match) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {meta.label && (
        <span className={`bx-status-tag ${meta.className}`}>{meta.label}</span>
      )}
      <div
        className={`bx-row${aWin ? " bx-row-winner" : ""}${!a ? " bx-row-empty" : ""}`}
      >
        <span className="bx-seed">{seedBadge(seeds, a) ?? ""}</span>
        <span className="bx-name">
          {a
            ? a.name
            : match.status === "bye" || match.status === "skipped"
              ? "Bye"
              : "TBD"}
        </span>
        {aWin && <span className="bx-check">✓</span>}
      </div>
      <div className="bx-divider" />
      <div
        className={`bx-row${bWin ? " bx-row-winner" : ""}${!b ? " bx-row-empty" : ""}`}
      >
        <span className="bx-seed">{seedBadge(seeds, b) ?? ""}</span>
        <span className="bx-name">
          {b
            ? b.name
            : match.status === "bye" || match.status === "skipped"
              ? "Bye"
              : "TBD"}
        </span>
        {bWin && <span className="bx-check">✓</span>}
      </div>
    </div>
  );
}

// ─── The bracket canvas ──────────────────────────────────────────────────────

export default function BracketCanvas({
  bracket,
  isDouble,
  format,
  onOpenMatch,
}) {
  const layout = useMemo(
    () => computeLayout(bracket.matches),
    [bracket.matches],
  );
  const {
    positions,
    wRounds,
    lRounds,
    gfMatches,
    totalWidth,
    totalHeight,
    edges,
  } = layout;
  const byId = useMemo(
    () => new Map(bracket.matches.map((m) => [m.id, m])),
    [bracket.matches],
  );

  const headerY = -40;

  return (
    <div className="bx-scroll">
      <div
        className="bx-canvas"
        style={{ width: totalWidth, height: totalHeight + 56 }}
      >
        <div className="bx-headers" style={{ height: 24 }}>
          {wRounds.map((round, ri) => (
            <div
              key={`wh-${ri}`}
              className="bx-round-header"
              style={{ left: ri * COLUMN_W, width: CARD_W, top: 0 }}
            >
              {wbRoundLabel(round[0].round, wRounds.length, isDouble)}
            </div>
          ))}
          {gfMatches[0] && (
            <div
              className="bx-round-header bx-round-header-gf"
              style={{
                left: positions.get(gfMatches[0].id)?.x ?? 0,
                width: CARD_W,
                top: 0,
              }}
            >
              Grand Final
            </div>
          )}
        </div>

        <svg
          className="bx-lines"
          width={totalWidth}
          height={totalHeight}
          style={{ top: 32 }}
        >
          {edges.map((e, i) => {
            const p1 = positions.get(e.from);
            const p2 = positions.get(e.to);
            if (!p1 || !p2) return null;
            const x1 = p1.x + CARD_W;
            const y1 = p1.y;
            const x2 = p2.x;
            const y2 = p2.y;
            const midX = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                className="bx-edge"
              />
            );
          })}
        </svg>

        <div className="bx-nodes" style={{ top: 32 }}>
          {bracket.matches.map((m) => {
            const p = positions.get(m.id);
            if (!p) return null;
            return (
              <div
                key={m.id}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y - CARD_H / 2,
                }}
              >
                <MatchNode
                  match={m}
                  seeds={bracket.seeds}
                  onOpen={onOpenMatch}
                />
              </div>
            );
          })}
        </div>

        {isDouble && lRounds.length > 0 && (
          <div
            className="bx-section-label"
            style={{
              top:
                32 +
                (positions.get(lRounds[0][0].id)?.y ?? 0) -
                CARD_H / 2 -
                26,
            }}
          >
            Losers Bracket
          </div>
        )}
        {isDouble &&
          lRounds.map((round, ri) => (
            <div
              key={`lh-${ri}`}
              className="bx-round-header bx-round-header-losers"
              style={{
                left: ri * COLUMN_W,
                width: CARD_W,
                top:
                  32 +
                  (positions.get(lRounds[0][0].id)?.y ?? 0) -
                  CARD_H / 2 -
                  4,
              }}
            >
              {lbRoundLabel(round[0].round, lRounds.length)}
            </div>
          ))}
      </div>
    </div>
  );
}
