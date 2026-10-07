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
function matchScore(p, isBughouse) {
  if (isBughouse) return { a: p.whitePoints, b: p.blackPoints };
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

const mono = "'SF Mono', Monaco, 'Cascadia Code', monospace";

const ACCENT_WIN = "#4ade80";
const ACCENT_LOSS = "#f87171";
const ACCENT_DRAW = "#fb923c";

// side: "win" | "loss" | "draw" | null (no result / double forfeit)
function PlayerSide({ name, isWhite, teamName, teamColor, align, outcome }) {
  const right = align === "right";
  const accent =
    outcome === "win"
      ? ACCENT_WIN
      : outcome === "loss"
      ? ACCENT_LOSS
      : outcome === "draw"
      ? ACCENT_DRAW
      : null;
  const badge = (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
        flexShrink: 0,
        background: isWhite ? "#f0e6d2" : "#252532",
        color: isWhite ? "#1a1a20" : "#e8e8e8",
        border: `1px solid ${isWhite ? "#e0d5c0" : "#353545"}`,
      }}
    >
      {isWhite ? "♔" : "♚"}
    </div>
  );
  return (
    <div
      style={{
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: right ? "flex-end" : "flex-start",
        textAlign: right ? "right" : "left",
        gap: 16,
        boxShadow: accent
          ? `inset ${right ? "-" : ""}3px 0 0 ${accent}`
          : "none",
      }}
    >
      {!right && badge}
      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--tp-text, #e8e8e8)",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {name}
        </div>
        {teamName && (
          <div
            style={{
              fontSize: 10,
              color: teamColor,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {teamName}
          </div>
        )}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexDirection: right ? "row-reverse" : "row",
            marginTop: 10,
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid var(--tp-border, #353545)",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--tp-muted, #8a8a9a)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 1,
              display: "inline-block",
              background: isWhite ? "#f0e6d2" : "#252532",
              border: `1px solid ${isWhite ? "#e0d5c0" : "#454555"}`,
            }}
          />
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
  onResultChange,
  onOpenMiniMatch,
}) {
  // A bughouse board with no result whose sibling got a decisive one was
  // never played — the match was already decided.
  const decisiveBoard = isBughouse
    ? p.boards?.find((b) => !b.sitOut && DECISIVE_RESULTS.has(b.result))
    : null;
  const score = matchScore(p, isBughouse);

  return (
    <div
      style={{
        background: "var(--tp-bg, #13131a)",
        border: "1px solid var(--tp-border, #252532)",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 24,
        fontFamily: mono,
        color: "var(--tp-text, #e8e8e8)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          borderBottom: "1px solid var(--tp-border, #252532)",
        }}
      >
        <div style={{ padding: "16px 24px" }}>
          <span
            style={{
              color: "var(--tp-brass, #d4a853)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            ● {p.teamWhiteName}
          </span>
        </div>
        <div
          style={{
            padding: "6px 18px",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--tp-brass, #d4a853)",
            background: "var(--tp-card-solid, #1a1a24)",
            borderRadius: 8,
            border: "1px solid var(--tp-border, #353545)",
          }}
        >
          {score.a} – {score.b}
        </div>
        <div style={{ padding: "16px 24px", textAlign: "right" }}>
          <span
            style={{
              color: "#6b9df7",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {p.teamBlackName} ●
          </span>
        </div>
      </div>

      {p.boards.map((b, bi) => {
        const last = bi === p.boards.length - 1;
        const rowBorder = last ? "none" : "1px solid var(--tp-border, #252532)";

        if (b.sitOut) {
          return (
            <div
              key={b.boardNum}
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--tp-muted, #6b6b7b)",
                fontSize: 13,
                borderBottom: rowBorder,
              }}
            >
              <span style={{ color: "var(--tp-muted, #a0a0b0)" }}>
                {b.playerName}
              </span>{" "}
              sat out this round
            </div>
          );
        }

        const teamAIsWhite = teamAIsWhiteOn(b.boardNum);
        const aName = teamAIsWhite ? b.whiteName : b.blackName;
        const bName = teamAIsWhite ? b.blackName : b.whiteName;
        const outcome = outcomeFor(b.result, teamAIsWhite);
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
            : "No result";

        const mmScore = b.miniMatch?.score;

        return (
          <div
            key={b.boardNum}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 160px 1fr",
              borderBottom: rowBorder,
              minHeight: 120,
            }}
          >
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

            <div
              style={{
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderLeft: "1px solid var(--tp-border, #252532)",
                borderRight: "1px solid var(--tp-border, #252532)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--tp-muted, #4a4a5a)",
                }}
              >
                Board {b.boardNum}
              </div>

              {lockedByOtherBoard ? (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--tp-muted, #6b6b7b)",
                    textAlign: "center",
                    lineHeight: 1.4,
                    maxWidth: 120,
                  }}
                >
                  Match decided on Board {decisiveBoard.boardNum}
                </div>
              ) : (
                <>
                  {showMiniMatch && mmScore && (
                    <span
                      style={{
                        color: "var(--tp-brass, #d4a853)",
                        fontWeight: 800,
                        fontSize: 15,
                      }}
                    >
                      {/* score.A follows White, so flip when the left team
                          is Black on this board */}
                      {teamAIsWhite ? mmScore.A : mmScore.B}
                      {" – "}
                      {teamAIsWhite ? mmScore.B : mmScore.A}
                    </span>
                  )}

                  {isEditing && !showMiniMatch ? (
                    <select
                      className="result-select"
                      value={b.result || ""}
                      disabled={loading}
                      onChange={(e) =>
                        onResultChange?.(index, e.target.value, b.boardNum)
                      }
                      style={{ maxWidth: 140, fontSize: 11 }}
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
                    <>
                      <div
                        style={{
                          padding: "4px 12px",
                          borderRadius: 999,
                          background:
                            "rgba(var(--tp-accent-rgb, 184, 134, 58), 0.15)",
                          color: "var(--tp-text, #e8e8e8)",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {b.result ? formatResult(b.result) : "—"}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--tp-muted, #8a8a9a)",
                          textAlign: "center",
                          lineHeight: 1.4,
                          maxWidth: 130,
                        }}
                      >
                        {outcomeText}
                      </div>
                    </>
                  )}

                  {b.derivedFromBoard && (
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--tp-muted, #6b6b7b)",
                        textAlign: "center",
                      }}
                    >
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
  );
}

const COLOR_WHITE_SIDE = "var(--tp-brass, #d4a853)";
const COLOR_BLACK_SIDE = "#6b9df7";

// Individual-event round, drawn with the same card language as a team match:
// White on the left, Black on the right, result in the middle column.
function IndividualRound({
  round,
  isEditing,
  loading,
  matchPlay,
  onResultChange,
  onOpenMiniMatch,
}) {
  const pairings = round.pairings;
  const border = "1px solid var(--tp-border, #252532)";

  return (
    <div
      className="individual-round"
      style={{
        background: "var(--tp-bg, #13131a)",
        border,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 24,
        fontFamily: mono,
        color: "var(--tp-text, #e8e8e8)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 160px 1fr",
          alignItems: "center",
          borderBottom: border,
        }}
      >
        <div style={{ padding: "16px 24px" }}>
          <span
            style={{
              color: COLOR_WHITE_SIDE,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            ● White
          </span>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--tp-muted, #8a8a9a)",
          }}
        >
          Result
        </div>
        <div style={{ padding: "16px 24px", textAlign: "right" }}>
          <span
            style={{
              color: COLOR_BLACK_SIDE,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Black ●
          </span>
        </div>
      </div>

      {pairings.map((p, i) => {
        const last = i === pairings.length - 1;
        const rowBorder = last ? "none" : border;

        if (p.type === "bye") {
          return (
            <div
              key={i}
              style={{
                padding: 24,
                textAlign: "center",
                borderBottom: rowBorder,
              }}
            >
              <span
                style={{
                  color: COLOR_WHITE_SIDE,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                }}
              >
                {p.playerName}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  color: "var(--tp-muted, #8a8a9a)",
                  fontSize: 12,
                }}
              >
                BYE — RECEIVES +1
              </span>
            </div>
          );
        }

        // White is always the left-hand player here.
        const outcome = outcomeFor(p.result, true);
        const outcomeText =
          outcome === "A"
            ? `${p.whiteName} wins`
            : outcome === "B"
            ? `${p.blackName} wins`
            : outcome === "draw"
            ? "Draw"
            : outcome === "double"
            ? "Double forfeit"
            : "No result";
        const showMiniMatch = matchPlay && p.miniMatch;
        const mmScore = p.miniMatch?.score;

        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 160px 1fr",
              borderBottom: rowBorder,
              minHeight: 120,
            }}
          >
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

            <div
              style={{
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderLeft: border,
                borderRight: border,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--tp-muted, #4a4a5a)",
                }}
              >
                Board {i + 1}
              </div>

              {showMiniMatch && mmScore && (
                <span
                  style={{
                    color: "var(--tp-brass, #d4a853)",
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  {mmScore.A} – {mmScore.B}
                </span>
              )}

              {isEditing && !showMiniMatch ? (
                <select
                  className="result-select"
                  value={p.result || ""}
                  disabled={loading}
                  onChange={(e) => onResultChange?.(i, e.target.value)}
                  style={{ maxWidth: 140, fontSize: 11 }}
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
                <>
                  <div
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      background:
                        "rgba(var(--tp-accent-rgb, 184, 134, 58), 0.15)",
                      color: "var(--tp-text, #e8e8e8)",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {p.result ? formatResult(p.result) : "—"}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--tp-muted, #8a8a9a)",
                      textAlign: "center",
                      lineHeight: 1.4,
                      maxWidth: 130,
                    }}
                  >
                    {outcomeText}
                  </div>
                </>
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
  onOpenMiniMatch,
}) {
  if (!round) return <p className="muted">No completed rounds yet.</p>;

  const isBughouse = variant === "bughouse";

  if (format === "team") {
    return (
      <div className="team-matches">
        {round.pairings.map((p, i) =>
          p.type === "bye" ? (
            <div
              key={i}
              style={{
                background: "var(--tp-bg, #13131a)",
                border: "1px solid var(--tp-border, #252532)",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                marginBottom: 24,
                fontFamily: mono,
                color: "var(--tp-text, #e8e8e8)",
              }}
            >
              <span
                style={{
                  color: "var(--tp-brass, #d4a853)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                }}
              >
                {p.teamName}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  color: "var(--tp-muted, #8a8a9a)",
                  fontSize: 12,
                }}
              >
                BYE — FULL TEAM RECEIVES +1
              </span>
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
      onResultChange={onResultChange}
      onOpenMiniMatch={onOpenMiniMatch}
    />
  );
}
