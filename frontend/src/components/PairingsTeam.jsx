import React from "react";
import { Link, useOutletContext } from "react-router-dom";

const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);

// Shared by both match layouts below (previously duplicated as a local
// resolveTitle in each) — resolves title AND id in one lookup, since a
// linkable id needs the same "prefer what's already on the object, fall
// back to a name-based lookup against the live roster" logic title did.
function resolvePlayerMeta(playerObj, livePlayers) {
  if (!playerObj) return { title: "", id: null };
  if (playerObj.title || playerObj.id) {
    return { title: playerObj.title || "", id: playerObj.id || null };
  }
  if (playerObj.name) {
    const match = livePlayers.find((lp) => lp.name === playerObj.name);
    if (match) return { title: match.title || "", id: match.id || null };
  }
  return { title: "", id: null };
}

function PlayerLink({
  basePath,
  id,
  title,
  name,
  titleColor = "var(--tp-loss-soft, #c25555)",
}) {
  const label = (
    <>
      {title && (
        <span
          style={{ color: titleColor, marginRight: "6px", fontWeight: 700 }}
        >
          {title}
        </span>
      )}
      {name}
    </>
  );
  if (!id || !basePath) return label;
  return (
    <Link
      to={`${basePath}/player/${id}`}
      style={{ color: "inherit", textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {label}
    </Link>
  );
}

// Used by both bughouse and standard team events: colors alternate by board,
// so the team on, say, the left side is White on board 1 but Black on board 2 — so generic color-labeled
// buttons ("1-0"/"0-1") silently mean the opposite team on the second board
// unless you re-read the color badge every single click. These buttons are
// labeled by TEAM instead, and translate the click into the correct
// color-coded result string internally based on teamAIsWhite for *this*
// board — the person never has to reason about color at all, only "which
// team's player won," which is what they actually mean to record.
function TeamResultButtons({
  results,
  matchKey,
  onSetResult,
  teamAIsWhite,
  teamAName,
  teamBName,
}) {
  const options = [
    { label: `${teamAName} wins`, result: teamAIsWhite ? "1-0" : "0-1" },
    { label: "Draw", result: "1/2-1/2" },
    { label: `${teamBName} wins`, result: teamAIsWhite ? "0-1" : "1-0" },
    {
      label: `${teamAName} wins (forfeit)`,
      result: teamAIsWhite ? "1F-0F" : "0F-1F",
    },
    { label: "Double forfeit", result: "0F-0F" },
    {
      label: `${teamBName} wins (forfeit)`,
      result: teamAIsWhite ? "0F-1F" : "1F-0F",
    },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        justifyContent: "center",
        marginTop: 8,
        maxWidth: 220,
      }}
    >
      {options.map(({ label, result }) => {
        const isActive = results[matchKey] === result;
        return (
          <button
            type="button"
            key={label}
            onClick={() => onSetResult(result)}
            style={{
              background: isActive
                ? "var(--tp-border-strong, #3a3a4a)"
                : "transparent",
              border: `1px solid ${
                isActive
                  ? "var(--tp-dim, #5a5a6a)"
                  : "var(--tp-border, #2a2a35)"
              }`,
              color: isActive
                ? "var(--tp-heading, #ffffff)"
                : "var(--tp-muted, #8a8a9a)",
              fontSize: 10,
              padding: "4px 6px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s ease",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TeamBoardsMatch({
  p,
  results,
  onSetBoardResult,
  onOpenMiniMatch,
  isMatchPlay,
  isBughouse,
  livePlayers,
  basePath,
}) {
  // Decisive-board locking is a bughouse rule only (one decisive board ends
  // the whole match). Standard team events score every board.
  const decisiveBoard = isBughouse
    ? p.boards.find(
        (b) =>
          !b.sitOut && DECISIVE_RESULTS.has(results[`${p.idx}-${b.boardNum}`]),
      )
    : undefined;

  return (
    <div
      style={{
        background: "var(--tp-bg, #13131a)",
        border: "1px solid var(--tp-border, #252532)",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 24,
        fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
        color: "var(--tp-text, #e8e8e8)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: "1px solid var(--tp-border, #252532)",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderRight: "1px solid var(--tp-border, #252532)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "var(--tp-brass, #d4a853)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--tp-brass, #d4a853)",
                display: "inline-block",
              }}
            />
            {p.teamWhiteName}
          </span>
        </div>
        <div style={{ padding: "16px 24px", textAlign: "right" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#6b9df7",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              flexDirection: "row-reverse",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#6b9df7",
                display: "inline-block",
              }}
            />
            {p.teamBlackName}
          </span>
        </div>
      </div>

      {/* Boards */}
      {p.boards.map((b) => {
        const key = `${p.idx}-${b.boardNum}`;
        const lockedByOtherBoard =
          decisiveBoard && decisiveBoard.boardNum !== b.boardNum;
        const teamAIsWhite = b.boardNum % 2 === 1;
        const teamAPlayer = teamAIsWhite ? b.white : b.black;
        const teamBPlayer = teamAIsWhite ? b.black : b.white;

        const teamAMeta = resolvePlayerMeta(teamAPlayer, livePlayers);
        const teamBMeta = resolvePlayerMeta(teamBPlayer, livePlayers);

        if (b.sitOut) {
          const sitOutPlayer = b.white || b.black;
          const sitOutMeta = resolvePlayerMeta(sitOutPlayer, livePlayers);
          return (
            <div
              key={b.boardNum}
              style={{
                padding: "24px",
                textAlign: "center",
                color: "var(--tp-dim, #6b6b7b)",
                fontSize: 13,
                borderBottom: "1px solid var(--tp-border, #252532)",
              }}
            >
              <span style={{ color: "var(--tp-soft, #a0a0b0)" }}>
                <PlayerLink
                  basePath={basePath}
                  id={sitOutMeta.id}
                  title={sitOutMeta.title}
                  name={sitOutPlayer?.name}
                  titleColor="var(--tp-loss-soft, #c25555)"
                />
              </span>{" "}
              sits out this round
            </div>
          );
        }

        return (
          <div
            key={b.boardNum}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 140px 1fr",
              borderBottom:
                b.boardNum === p.boards.length
                  ? "none"
                  : "1px solid var(--tp-border, #252532)",
              minHeight: 120,
            }}
          >
            {/* Team A Side (Left) */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderRight: "1px solid var(--tp-border, #252532)",
              }}
            >
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
                  background: teamAIsWhite ? "#f0e6d2" : "#252532",
                  color: teamAIsWhite ? "#1a1a20" : "#e8e8e8",
                  border: `1px solid ${teamAIsWhite ? "#e0d5c0" : "#353545"}`,
                }}
              >
                {teamAIsWhite ? "♔" : "♚"}
              </div>
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
                  <PlayerLink
                    basePath={basePath}
                    id={teamAMeta.id}
                    title={teamAMeta.title}
                    name={teamAPlayer.name}
                  />
                  {!isBughouse && teamAPlayer.rating != null && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--tp-muted, #8a8a9a)",
                        marginLeft: 8,
                        letterSpacing: 0,
                      }}
                    >
                      ({teamAPlayer.rating})
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--tp-brass, #d4a853)",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  {p.teamWhiteName}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "transparent",
                    border: "1px solid var(--tp-border-strong, #353545)",
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
                      background: teamAIsWhite ? "#f0e6d2" : "#252532",
                      border: `1px solid ${
                        teamAIsWhite ? "#e0d5c0" : "#454555"
                      }`,
                    }}
                  />
                  {teamAIsWhite ? "WHITE" : "BLACK"} · BOARD {b.boardNum}
                </div>
              </div>
            </div>

            {/* Center */}
            <div
              style={{
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRight: "1px solid var(--tp-border, #252532)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--tp-faint, #4a4a5a)",
                }}
              >
                Board {b.boardNum}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--tp-faint, #3a3a4a)",
                  letterSpacing: "0.05em",
                }}
              >
                VS
              </div>
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: `linear-gradient(45deg, var(--tp-border, #2a2a35) 25%, transparent 25%), linear-gradient(-45deg, var(--tp-border, #2a2a35) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--tp-border, #2a2a35) 75%), linear-gradient(-45deg, transparent 75%, var(--tp-border, #2a2a35) 75%)`,
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                  borderRadius: 4,
                  opacity: 0.6,
                  marginBottom: lockedByOtherBoard ? 0 : 4,
                }}
              />

              {isMatchPlay && !isBughouse && b.miniMatch ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      color: "var(--tp-brass, #d4a853)",
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    {/* score.A / score.B follow White / Black, so flip them
                        when the left-hand team is Black on this board */}
                    {teamAIsWhite ? b.miniMatch.score.A : b.miniMatch.score.B}
                    {" – "}
                    {teamAIsWhite ? b.miniMatch.score.B : b.miniMatch.score.A}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      textAlign: "center",
                      color: b.result
                        ? "var(--tp-win, #4caf50)"
                        : b.miniMatch.tieAlert
                        ? "var(--tp-loss, #f44336)"
                        : "var(--tp-muted, #8a8a9a)",
                    }}
                  >
                    {b.result
                      ? "Decided"
                      : b.miniMatch.tieAlert
                      ? "Level — needs a call"
                      : "In progress"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenMiniMatch(p.idx, b.boardNum)}
                    style={{
                      background: "var(--tp-border, #252532)",
                      border: "1px solid var(--tp-border-strong, #353545)",
                      color: "var(--tp-text, #e8e8e8)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      padding: "5px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      fontFamily: "inherit",
                    }}
                  >
                    Open Mini-Match →
                  </button>
                </div>
              ) : lockedByOtherBoard ? (
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--tp-dim, #6b6b7b)",
                    textAlign: "center",
                    lineHeight: 1.4,
                    maxWidth: 120,
                  }}
                >
                  Decided on Board {decisiveBoard.boardNum}
                </div>
              ) : (
                <TeamResultButtons
                  results={results}
                  matchKey={key}
                  onSetResult={(r) => onSetBoardResult(p.idx, b.boardNum, r)}
                  teamAIsWhite={teamAIsWhite}
                  teamAName={teamAPlayer.name}
                  teamBName={teamBPlayer.name}
                />
              )}
            </div>

            {/* Team B Side (Right) */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                textAlign: "right",
                gap: 16,
              }}
            >
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
                  <PlayerLink
                    basePath={basePath}
                    id={teamBMeta.id}
                    title={teamBMeta.title}
                    name={teamBPlayer.name}
                  />
                  {!isBughouse && teamBPlayer.rating != null && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--tp-muted, #8a8a9a)",
                        marginLeft: 8,
                        letterSpacing: 0,
                      }}
                    >
                      ({teamBPlayer.rating})
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#6b9df7",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  {p.teamBlackName}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "transparent",
                    border: "1px solid var(--tp-border-strong, #353545)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--tp-muted, #8a8a9a)",
                    flexDirection: "row-reverse",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 1,
                      display: "inline-block",
                      background: teamAIsWhite ? "#252532" : "#f0e6d2",
                      border: `1px solid ${
                        teamAIsWhite ? "#454555" : "#e0d5c0"
                      }`,
                    }}
                  />
                  {teamAIsWhite ? "BLACK" : "WHITE"} · BOARD {b.boardNum}
                </div>
              </div>
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
                  background: teamAIsWhite ? "#252532" : "#f0e6d2",
                  color: teamAIsWhite ? "#e8e8e8" : "#1a1a20",
                  border: `1px solid ${teamAIsWhite ? "#353545" : "#e0d5c0"}`,
                }}
              >
                {teamAIsWhite ? "♚" : "♔"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamMatch(props) {
  // Both bughouse and standard team events share one layout now: each team
  // is pinned to its own side for every board, and only the color badges
  // swap. Bughouse-only behavior (decisive-board locking) is gated inside.
  return <TeamBoardsMatch {...props} />;
}

export default function PairingsTeam({
  pairings,
  results,
  onSetBoardResult,
  onOpenMiniMatch,
  isBughouse,
  basePath: basePathProp,
}) {
  const outletContext = useOutletContext();
  const t = outletContext?.t;
  const livePlayers = t?.players || [];
  const basePath = basePathProp ?? (t?.id ? `/tournament/${t.id}` : null);
  const isMatchPlay = !!t?.matchPlay;

  return (
    <div className="team-matches">
      {pairings.map((p) =>
        p.type === "bye" ? (
          <div
            className="team-match-card bughouse-bye"
            key={p.idx}
            style={{
              background: "var(--tp-bg, #13131a)",
              border: "1px solid var(--tp-border, #252532)",
              borderRadius: 12,
              padding: 24,
              textAlign: "center",
              marginBottom: 24,
              fontFamily: "'SF Mono', monospace",
              color: "var(--tp-text, #e8e8e8)",
            }}
          >
            <div className="team-match-bye">
              <span
                className="player-name"
                style={{
                  color: "var(--tp-brass, #d4a853)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {p.teamName}
              </span>
              <span
                className="bye-result"
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
          </div>
        ) : (
          <TeamMatch
            key={p.idx}
            p={p}
            results={results}
            onSetBoardResult={onSetBoardResult}
            onOpenMiniMatch={onOpenMiniMatch}
            isMatchPlay={isMatchPlay}
            isBughouse={isBughouse}
            livePlayers={livePlayers}
            basePath={basePath}
          />
        ),
      )}
    </div>
  );
}
