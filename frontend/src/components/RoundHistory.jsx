import { useState } from "react";
import "../css/RoundHistory.css";

const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);

const RESULT_OPTIONS = [
  { value: "1-0", label: "1-0" },
  { value: "0-1", label: "0-1" },
  { value: "1/2-1/2", label: "½-½" },
  { value: "1F-0F", label: "1F-0F" },
  { value: "0F-1F", label: "0F-1F" },
  { value: "0F-0F", label: "0F-0F" },
];

function formatResult(result) {
  return result === "1/2-1/2" ? "½-½" : result;
}

const WHITE_WINS = new Set(["1-0", "1F-0F"]);
const BLACK_WINS = new Set(["0-1", "0F-1F"]);

// Team A = the pairing's teamWhite, which plays White on odd boards (this is
// what buildTeamBoards() does on the server) and sits on the left. Same rule
// as the live pairings view, so a round looks identical before and after it
// is submitted.
const teamAIsWhiteOn = (boardNum) => boardNum % 2 === 1;

// Outcome from the left-hand team's point of view: "A" | "B" | "draw" |
// "double" | null (no result yet).
function outcomeFor(result, teamAIsWhite) {
  if (!result) return null;
  if (result === "0F-0F") return "double";
  if (WHITE_WINS.has(result)) return teamAIsWhite ? "A" : "B";
  if (BLACK_WINS.has(result)) return teamAIsWhite ? "B" : "A";
  return "draw";
}

// Match score derived from the boards, per TEAM. The stored
// p.whitePoints/p.blackPoints are summed per board *color* for standard
// team events, which misattributes points on the boards where teamBlack
// has White — so for those we recompute here. Bughouse's stored values are
// match-level (win = 1) and already correct.
function matchScore(p, isBughouse, partial = false) {
  if (isBughouse && !partial) return { a: p.whitePoints, b: p.blackPoints };
  if (isBughouse) {
    // A round still in progress has no stored match points yet, so derive
    // them from the boards: team A wins on board 1 White (it is White on odd
    // boards) or board 2 Black; one decisive board settles the match.
    const real = (p.boards || []).filter((bd) => !bd.sitOut);
    const [b1, b2] = real;
    const aWon =
      (b1 && WHITE_WINS.has(b1.result)) || (b2 && BLACK_WINS.has(b2.result));
    const bWon =
      (b1 && BLACK_WINS.has(b1.result)) || (b2 && WHITE_WINS.has(b2.result));
    const allIn = real.length > 0 && real.every((bd) => bd.result);
    if (aWon) return { a: 1, b: 0 };
    if (bWon) return { a: 0, b: 1 };
    return allIn ? { a: 0.5, b: 0.5 } : { a: 0, b: 0 };
  }
  let a = 0;
  let b = 0;
  (p.boards || []).forEach((bd) => {
    if (bd.sitOut || !bd.result) return;
    const o = outcomeFor(bd.result, teamAIsWhiteOn(bd.boardNum));
    if (o === "A") a += 1;
    else if (o === "B") b += 1;
    else if (o === "draw") {
      a += 0.5;
      b += 0.5;
    }
  });
  return { a, b };
}

function teamResultOptions(teamAIsWhite, aName, bName) {
  return [
    { value: teamAIsWhite ? "1-0" : "0-1", label: `${aName} wins` },
    { value: "1/2-1/2", label: "Draw" },
    { value: teamAIsWhite ? "0-1" : "1-0", label: `${bName} wins` },
    {
      value: teamAIsWhite ? "1F-0F" : "0F-1F",
      label: `${aName} wins (forfeit)`,
    },
    { value: "0F-0F", label: "Double forfeit" },
    {
      value: teamAIsWhite ? "0F-1F" : "1F-0F",
      label: `${bName} wins (forfeit)`,
    },
  ];
}

// side: "win" | "loss" | "draw" | null (no result / double forfeit)
// Layout lives in RoundHistory.css so it can reflow on phones: three columns
// (A | result | B) on wide screens, the two players stacked under the result
// on narrow ones. `align` picks the grid slot ("left" = first player).
function PlayerSide({ name, isWhite, teamName, teamColor, align, outcome }) {
  const right = align === "right";
  const badge = (
    <div className={`rh-badge ${isWhite ? "is-white" : "is-black"}`}>
      {isWhite ? "♔" : "♚"}
    </div>
  );
  return (
    <div
      className={`rh-side ${right ? "rh-side--right" : "rh-side--left"}${
        outcome ? ` is-${outcome}` : ""
      }`}
    >
      {!right && badge}
      <div className="rh-side-text">
        <div className="rh-name">{name}</div>
        {teamName && (
          <div className="rh-team" style={{ color: teamColor }}>
            {teamName}
          </div>
        )}
        <div className="rh-colortag">
          <span className={`rh-swatch ${isWhite ? "is-white" : "is-black"}`} />
          {isWhite ? "WHITE" : "BLACK"}
        </div>
      </div>
      {right && badge}
    </div>
  );
}

function TeamHistoryMatch({
  p,
  index,
  isBughouse,
  isEditing,
  loading,
  matchPlay,
  pending,
  partial,
  onResultChange,
  onOpenMiniMatch,
}) {
  // A bughouse board with no result whose sibling got a decisive one was
  // never played — the match was already decided.
  const decisiveBoard = isBughouse
    ? p.boards?.find((b) => !b.sitOut && DECISIVE_RESULTS.has(b.result))
    : null;
  const score = matchScore(p, isBughouse, partial);
  // In a round that's still in progress ("partial") each game is its own
  // case: the ones with a saved result show it, the rest show "vs" / "To be
  // played". Otherwise the whole round is either pending or played.
  const anyResult = (p.boards || []).some((bd) => !bd.sitOut && bd.result);
  const matchPending = partial ? !anyResult : pending;

  // Phones: the match is a tap-to-expand row. The CSS only collapses at
  // narrow widths, so desktop always shows every board. The organizer's
  // result-entry view (isEditing) is never collapsed.
  const [open, setOpen] = useState(false);
  const expanded = open || isEditing;
  const toggle = () => setOpen((o) => !o);

  return (
    <div className={`rh-card rh-collapsible${expanded ? " is-open" : ""}`}>
      <div
        className="rh-head rh-head--team"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className="rh-head-side">
          <span
            className="rh-head-team"
            style={{ color: "var(--tp-brass, #d4a853)" }}
          >
            ● {p.teamWhiteName}
          </span>
        </div>
        <div className="rh-score">
          {matchPending ? "vs" : `${score.a} – ${score.b}`}
        </div>
        <div className="rh-head-side rh-head-side--right">
          <span className="rh-head-team" style={{ color: "#6b9df7" }}>
            {p.teamBlackName} ●
          </span>
        </div>
        <span className="rh-chevron" aria-hidden="true">
          ▾
        </span>
      </div>

      <div className="rh-boards">
        {p.boards.map((b) => {
          if (b.sitOut) {
            return (
              <div className="rh-sitout" key={b.boardNum}>
                <span>{b.playerName}</span> sat out this round
              </div>
            );
          }

          const teamAIsWhite = teamAIsWhiteOn(b.boardNum);
          const aName = teamAIsWhite ? b.whiteName : b.blackName;
          const bName = teamAIsWhite ? b.blackName : b.whiteName;
          const outcome = outcomeFor(b.result, teamAIsWhite);
          const boardPending = partial ? !b.result : pending;
          const lockedByOtherBoard =
            decisiveBoard && decisiveBoard.boardNum !== b.boardNum && !b.result;
          const showMiniMatch = matchPlay && !isBughouse && b.miniMatch;

          const outcomeText =
            outcome === "A"
              ? `${aName} wins`
              : outcome === "B"
              ? `${bName} wins`
              : outcome === "draw"
              ? "Draw"
              : outcome === "double"
              ? "Double forfeit"
              : boardPending
              ? "To be played"
              : "No result";

          const mmScore = b.miniMatch?.score;

          return (
            <div className="rh-board" key={b.boardNum}>
              <PlayerSide
                name={aName}
                isWhite={teamAIsWhite}
                teamName={p.teamWhiteName}
                teamColor="var(--tp-brass, #d4a853)"
                align="left"
                outcome={
                  outcome === "A"
                    ? "win"
                    : outcome === "B"
                    ? "loss"
                    : outcome === "draw"
                    ? "draw"
                    : null
                }
              />

              <div className="rh-mid">
                <div className="rh-mid-label">Board {b.boardNum}</div>

                {lockedByOtherBoard ? (
                  <div className="rh-note">
                    Match decided on Board {decisiveBoard.boardNum}
                  </div>
                ) : (
                  <>
                    {showMiniMatch && mmScore && (
                      <span className="rh-mm">
                        {/* score.A follows White, so flip when the left team
                          is Black on this board */}
                        {teamAIsWhite ? mmScore.A : mmScore.B}
                        {" – "}
                        {teamAIsWhite ? mmScore.B : mmScore.A}
                      </span>
                    )}

                    {isEditing && !showMiniMatch ? (
                      <select
                        className="result-select rh-select"
                        value={b.result || ""}
                        disabled={loading}
                        onChange={(e) =>
                          onResultChange?.(index, e.target.value, b.boardNum)
                        }
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {teamResultOptions(teamAIsWhite, aName, bName).map(
                          (opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <div className="rh-result">
                        <div className="rh-chip">
                          {boardPending
                            ? "vs"
                            : b.result
                            ? formatResult(b.result)
                            : "—"}
                        </div>
                        <div className="rh-outcome">{outcomeText}</div>
                      </div>
                    )}

                    {b.derivedFromBoard && (
                      <div className="rh-note">
                        derived from Board {b.derivedFromBoard}
                      </div>
                    )}

                    {showMiniMatch && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => onOpenMiniMatch?.(index, b.boardNum)}
                      >
                        View Mini-Match →
                      </button>
                    )}
                  </>
                )}
              </div>

              <PlayerSide
                name={bName}
                isWhite={!teamAIsWhite}
                teamName={p.teamBlackName}
                teamColor="#6b9df7"
                align="right"
                outcome={
                  outcome === "B"
                    ? "win"
                    : outcome === "A"
                    ? "loss"
                    : outcome === "draw"
                    ? "draw"
                    : null
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Individual-event round, drawn with the same card language as a team match:
// White first, Black second, result in the middle column (or on top when the
// screen is too narrow for three columns).
function IndividualRound({
  round,
  isEditing,
  loading,
  matchPlay,
  pending,
  partial,
  onResultChange,
  onOpenMiniMatch,
}) {
  const pairings = round.pairings;

  return (
    <div className="rh-card individual-round">
      <div className="rh-head rh-head--individual">
        <div className="rh-head-side">
          <span
            className="rh-head-team"
            style={{ color: "var(--tp-brass, #d4a853)" }}
          >
            ● White
          </span>
        </div>
        <div className="rh-head-mid">Result</div>
        <div className="rh-head-side rh-head-side--right">
          <span className="rh-head-team" style={{ color: "#6b9df7" }}>
            Black ●
          </span>
        </div>
      </div>

      {pairings.map((p, i) => {
        if (p.type === "bye") {
          return (
            <div className="rh-bye rh-bye--row" key={i}>
              <span className="rh-bye-name">{p.playerName}</span>
              <span className="rh-bye-text">BYE — RECEIVES +1</span>
            </div>
          );
        }

        // White is always the first player here.
        const outcome = outcomeFor(p.result, true);
        const gamePending = partial ? !p.result : pending;
        const outcomeText =
          outcome === "A"
            ? `${p.whiteName} wins`
            : outcome === "B"
            ? `${p.blackName} wins`
            : outcome === "draw"
            ? "Draw"
            : outcome === "double"
            ? "Double forfeit"
            : gamePending
            ? "To be played"
            : "No result";
        const showMiniMatch = matchPlay && p.miniMatch;
        const mmScore = p.miniMatch?.score;

        return (
          <div className="rh-board" key={i}>
            <PlayerSide
              name={p.whiteName}
              isWhite
              align="left"
              outcome={
                outcome === "A"
                  ? "win"
                  : outcome === "B"
                  ? "loss"
                  : outcome === "draw"
                  ? "draw"
                  : null
              }
            />

            <div className="rh-mid">
              <div className="rh-mid-label">Board {i + 1}</div>

              {showMiniMatch && mmScore && (
                <span className="rh-mm">
                  {mmScore.A} – {mmScore.B}
                </span>
              )}

              {isEditing && !showMiniMatch ? (
                <select
                  className="result-select rh-select"
                  value={p.result || ""}
                  disabled={loading}
                  onChange={(e) => onResultChange?.(i, e.target.value)}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {RESULT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rh-result">
                  <div className="rh-chip">
                    {gamePending
                      ? "vs"
                      : p.result
                      ? formatResult(p.result)
                      : "—"}
                  </div>
                  <div className="rh-outcome">{outcomeText}</div>
                </div>
              )}

              {showMiniMatch && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => onOpenMiniMatch?.(i)}
                >
                  View Mini-Match →
                </button>
              )}
            </div>

            <PlayerSide
              name={p.blackName}
              isWhite={false}
              align="right"
              outcome={
                outcome === "B"
                  ? "win"
                  : outcome === "A"
                  ? "loss"
                  : outcome === "draw"
                  ? "draw"
                  : null
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export default function RoundHistory({
  format,
  round,
  variant,
  isEditing = false,
  onResultChange,
  loading = false,
  matchPlay = false,
  // Round not played yet: same layout, but "vs" / "To be played" in place of
  // a result. Used by the public page for the live round.
  pending = false,
  // Round still in progress (the open round, or one paired in advance): show
  // the result of every game that has one and "vs" / "To be played" for the
  // rest, game by game — unlike `pending`, which treats the whole round alike.
  partial = false,
  onOpenMiniMatch,
}) {
  if (!round) return <p className="muted">No completed rounds yet.</p>;

  const isBughouse = variant === "bughouse";

  if (format === "team") {
    return (
      <div className="team-matches">
        {round.pairings.map((p, i) =>
          p.type === "bye" ? (
            <div className="rh-bye" key={i}>
              <span className="rh-bye-name">{p.teamName}</span>
              <span className="rh-bye-text">BYE — FULL TEAM RECEIVES +1</span>
            </div>
          ) : (
            <TeamHistoryMatch
              key={i}
              p={p}
              index={i}
              isBughouse={isBughouse}
              isEditing={isEditing}
              loading={loading}
              matchPlay={matchPlay}
              pending={pending}
              partial={partial}
              onResultChange={onResultChange}
              onOpenMiniMatch={onOpenMiniMatch}
            />
          ),
        )}
      </div>
    );
  }

  return (
    <IndividualRound
      round={round}
      isEditing={isEditing}
      loading={loading}
      matchPlay={matchPlay}
      pending={pending}
      partial={partial}
      onResultChange={onResultChange}
      onOpenMiniMatch={onOpenMiniMatch}
    />
  );
}
