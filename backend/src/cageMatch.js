// cageMatch.js
// ─────────────────────────────────────────────────────────────────────────
// Engine module for the Cage Match feature (1 vs 1), in the same spirit as
// bracket.js / bughouse.js / chess960.js: pure-ish functions that take and
// mutate a plain state object, with tournamentService.js doing the thin
// HTTP-facing wrapping (assertTournament, persist(), error status codes).
//
// This module is required by tournamentService.js, so it must NOT require
// tournamentService.js back (would be circular). Any tiny helpers it needs
// (result validation, scoring) are defined locally rather than imported.
//
// State shape — this whole object lives at `t.cageMatch` on a tournament
// whose `format === "match"` and `matchType === "cage"`:
//
// {
//   id,
//   competitors: {
//     A: { id, name, pictureUrl },
//     B: { id, name, pictureUrl },
//   },
//   sections: [
//     {
//       id, label, timeControl, variant: "standard" | "chess960",
//       numberOfGames,
//       games: [ Game, ... ],
//     },
//   ],
//   tiebreak: null | {
//     status: "miniMatch" | "armageddon" | "complete",
//     miniMatch: { bestOf: 4, games: [ Game, ... ] },
//     armageddon: null | {
//       status: "awaiting_bids" | "bid_tie" | "awaiting_result" | "complete",
//       bidA: number | null, bidB: number | null,      // seconds, lower wins the bid
//       whiteId: null | id, blackId: null | id,         // set once bids resolve
//       result: null | ResultCode,
//     },
//     winnerId: null | id,
//   },
//   status: "active" | "finished",
//   winnerId: null | id,
//   finishedAt: null | ISOString,
// }
//
// A Game (shared shape for section games AND tiebreak mini-match games):
// {
//   id, gameNum,
//   whiteId, blackId,
//   startFen,                 // null => chess.js standard start
//   moves: [...SAN],
//   fen, pgn,
//   boardStatus,              // last value from chessGame.deriveStatus()
//   result: null | ResultCode,
//   status: "pending" | "in_progress" | "complete",
// }
//
// ResultCode is one of: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F"
// (matches the codes already used elsewhere in tournamentService.js).

const chessGame = require("./chessGame");
const chess960 = require("./chess960");

// ─── Local result/score helpers (deliberately not imported from
// tournamentService.js — see file header) ──────────────────────────────────
const WHITE_WIN_RESULTS = new Set(["1-0", "1F-0F"]);
const BLACK_WIN_RESULTS = new Set(["0-1", "0F-1F"]);
const DRAW_RESULTS = new Set(["1/2-1/2"]);
const DOUBLE_FORFEIT_RESULT = "0F-0F";
const VALID_RESULTS = new Set([
  ...WHITE_WIN_RESULTS,
  ...BLACK_WIN_RESULTS,
  ...DRAW_RESULTS,
  DOUBLE_FORFEIT_RESULT,
]);

function assertValidResult(result) {
  if (!VALID_RESULTS.has(result)) {
    const e = new Error(
      `"${result}" isn't a recognized result — expected one of ${[
        ...VALID_RESULTS,
      ].join(", ")}`,
    );
    e.status = 400;
    throw e;
  }
}

function scoreFromResult(result, side) {
  if (WHITE_WIN_RESULTS.has(result)) return side === "white" ? 1 : 0;
  if (BLACK_WIN_RESULTS.has(result)) return side === "white" ? 0 : 1;
  if (result === DOUBLE_FORFEIT_RESULT) return 0;
  return 0.5; // 1/2-1/2
}

function uid() {
  return require("crypto").randomUUID();
}

// ─── Construction ───────────────────────────────────────────────────────────
const VALID_VARIANTS = new Set(["standard", "chess960"]);

// One fresh Chess960 draw per GAME (not shared across a whole section) —
// matches how most freestyle/960 match events run: each game gets its own
// draw rather than the whole match/section sharing one position. If you'd
// rather a section share a single draw, generate it once per section here
// instead and pass the same value into every game below.
function startFenFor(variant) {
  if (variant !== "chess960") return null;
  return chessGame.chess960StartFen(chess960.randomChess960Position());
}

function makeGame(gameNum, whiteId, blackId, variant) {
  return {
    id: uid(),
    gameNum,
    whiteId,
    blackId,
    startFen: startFenFor(variant),
    moves: [],
    fen: null,
    pgn: null,
    boardStatus: { kind: "in_progress" },
    result: null,
    status: "pending",
  };
}

// Colors alternate strictly game-to-game *within* a section, starting with
// competitor A as White in that section's game 1 — same convention as the
// existing decider's makeMatchLeg(). Which competitor is "A" vs "B" is just
// creation order (whoever was entered first at Tournament Creation).
function makeSection(input) {
  const label = String(input.label ?? "").trim();
  if (!label) {
    const e = new Error("Every section needs a label (a name or number).");
    e.status = 400;
    throw e;
  }

  const numberOfGames = Number(input.numberOfGames);
  if (!Number.isInteger(numberOfGames) || numberOfGames < 1) {
    const e = new Error(
      `Section "${label}" needs numberOfGames to be a positive integer.`,
    );
    e.status = 400;
    throw e;
  }

  const variant = input.variant || "standard";
  if (!VALID_VARIANTS.has(variant)) {
    const e = new Error(`Section "${label}": invalid variant "${variant}".`);
    e.status = 400;
    throw e;
  }

  const games = [];
  for (let i = 0; i < numberOfGames; i++) {
    const aIsWhite = i % 2 === 0;
    games.push(
      makeGame(i + 1, aIsWhite ? "A" : "B", aIsWhite ? "B" : "A", variant),
    );
  }

  return {
    id: uid(),
    label,
    timeControl: input.timeControl ? String(input.timeControl).trim() : "",
    variant,
    numberOfGames,
    games,
  };
}

// `input`: { competitorA: {name, pictureUrl?}, competitorB: {name, pictureUrl?}, sections: [...] }
// Competitor ids are fixed as "A"/"B" throughout the match (simpler than
// UUIDs for a 2-party structure, and every game/leg already refers to sides
// this way) — serialize() below is what maps "A"/"B" to real display data.
function createCageMatch(input = {}) {
  const { competitorA, competitorB, sections } = input;

  if (!competitorA || !competitorA.name || !competitorA.name.trim()) {
    const e = new Error("Competitor A needs a name.");
    e.status = 400;
    throw e;
  }
  if (!competitorB || !competitorB.name || !competitorB.name.trim()) {
    const e = new Error("Competitor B needs a name.");
    e.status = 400;
    throw e;
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    const e = new Error("At least one section (time format) is required.");
    e.status = 400;
    throw e;
  }

  return {
    id: uid(),
    competitors: {
      A: {
        id: "A",
        name: competitorA.name.trim(),
        pictureUrl: competitorA.pictureUrl || null,
      },
      B: {
        id: "B",
        name: competitorB.name.trim(),
        pictureUrl: competitorB.pictureUrl || null,
      },
    },
    sections: sections.map(makeSection),
    tiebreak: null,
    status: "active",
    winnerId: null,
    finishedAt: null,
  };
}

// ─── Lookup helpers ──────────────────────────────────────────────────────
function findSection(state, sectionId) {
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) {
    const e = new Error("Unknown section.");
    e.status = 404;
    throw e;
  }
  return section;
}

function findSectionGame(state, sectionId, gameId) {
  const section = findSection(state, sectionId);
  const game = section.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown game in that section.");
    e.status = 404;
    throw e;
  }
  return { section, game };
}

function assertActive(state) {
  if (state.status === "finished") {
    const e = new Error("This match is already finished.");
    e.status = 409;
    throw e;
  }
}

// ─── Move entry (manual, board-driven) ─────────────────────────────────────
// `target` is either a section game or a tiebreak game — both share the
// Game shape, so this works for any of them.
function applyMoveToGame(game, moveInput) {
  if (game.status === "complete") {
    const e = new Error(
      "This game already has a recorded result — undo the result first to keep editing moves.",
    );
    e.status = 409;
    throw e;
  }
  const r = chessGame.applyMove(game, moveInput);
  game.moves = r.moves;
  game.fen = r.fen;
  game.pgn = r.pgn;
  game.boardStatus = r.status;
  game.status = "in_progress";
  return game;
}

function undoMoveOnGame(game) {
  if (game.status === "complete") {
    const e = new Error(
      "This game already has a recorded result — undo the result first.",
    );
    e.status = 409;
    throw e;
  }
  const r = chessGame.undoLastMove(game);
  game.moves = r.moves;
  game.fen = r.fen;
  game.pgn = r.pgn;
  game.boardStatus = r.status;
  game.status = game.moves.length ? "in_progress" : "pending";
  return game;
}

function recordMove(state, { sectionId, gameId, move }) {
  assertActive(state);
  const { game } = findSectionGame(state, sectionId, gameId);
  applyMoveToGame(game, move);
  return game;
}

function undoMove(state, { sectionId, gameId }) {
  assertActive(state);
  const { game } = findSectionGame(state, sectionId, gameId);
  undoMoveOnGame(game);
  return game;
}

// Sets the final result directly — used both for a manual arbiter call
// (resignation, timeout, agreed draw — board moves may or may not be fully
// entered) and to confirm a board-detected checkmate/stalemate. `result`
// must be one of the app-wide result codes.
function setGameResult(state, { sectionId, gameId, result }) {
  assertActive(state);
  assertValidResult(result);
  const { game } = findSectionGame(state, sectionId, gameId);
  game.result = result;
  game.status = "complete";
  finalizeIfPossible(state);
  return game;
}

function clearGameResult(state, { sectionId, gameId }) {
  assertActive(state);
  const { game } = findSectionGame(state, sectionId, gameId);
  game.result = null;
  game.status = game.moves.length ? "in_progress" : "pending";
  // Undoing a result can un-tie a previously-tied match — if a tiebreak had
  // already been started off the back of that tie, it's now based on a
  // false premise, so clear it too rather than leave a dangling tiebreak
  // attached to a match that (once corrected) might not even be tied.
  if (state.tiebreak) state.tiebreak = null;
  state.status = "active";
  state.winnerId = null;
  state.finishedAt = null;
  return game;
}

// ─── Scoring ────────────────────────────────────────────────────────────
// Combined score across every section (every time format) — per your rule,
// the tiebreak only triggers once ALL scheduled games across ALL sections
// are done and the combined total is level. Individual sections don't have
// their own separate tiebreak.
function computeScores(state) {
  let scoreA = 0;
  let scoreB = 0;
  state.sections.forEach((section) => {
    section.games.forEach((g) => {
      if (!g.result) return;
      const side = (id) => (g.whiteId === id ? "white" : "black");
      scoreA += scoreFromResult(g.result, side("A"));
      scoreB += scoreFromResult(g.result, side("B"));
    });
  });
  return { scoreA, scoreB };
}

function allSectionGamesComplete(state) {
  return state.sections.every((s) => s.games.every((g) => g.result));
}

// ─── Finalization ───────────────────────────────────────────────────────
// Called after every result-affecting mutation. Decides whether the match
// is now decided, or (all games played + scores level) flips on a tie
// alert for the organizer to act on by calling startTiebreak() explicitly
// — mirrors the existing standings-decider's "detect, then organizer
// starts it" UX rather than auto-starting a tiebreak the moment scores tie.
function finalizeIfPossible(state) {
  // Tiebreak already running/complete — its own result-recording functions
  // (below) drive finalization instead of this path.
  if (state.tiebreak) return;

  if (!allSectionGamesComplete(state)) return;

  const { scoreA, scoreB } = computeScores(state);
  if (scoreA === scoreB) return; // tie alert surfaces via tieAlert() below; no auto-start

  state.winnerId = scoreA > scoreB ? "A" : "B";
  state.status = "finished";
  state.finishedAt = new Date().toISOString();
}

// Surfaced on every read so the frontend can prompt "scores are level —
// start the tiebreak mini-match?" — null once a tiebreak exists or the
// match doesn't (yet) qualify.
function tieAlert(state) {
  if (state.tiebreak) return null;
  if (!allSectionGamesComplete(state)) return null;
  const { scoreA, scoreB } = computeScores(state);
  if (scoreA !== scoreB) return null;
  return { scoreA, scoreB };
}

// ─── Tiebreak: 4-game mini-match (first to 2.5) ────────────────────────────
// Colors continue the alternation rather than resetting — whoever was
// Black in the very last section game plays White in mini-match game 1, so
// nobody gets an extra "fresh" advantage purely from the tiebreak boundary.
// If you'd rather always start the mini-match with a fixed side (e.g.
// always A first), swap the lookup below for a constant.
function lastColorPlayed(state) {
  const allGames = state.sections.flatMap((s) => s.games);
  const last = [...allGames].reverse().find((g) => g.result);
  if (!last) return { A: "white", B: "black" }; // shouldn't happen — finalize requires all games played
  return last.whiteId === "A"
    ? { A: "white", B: "black" }
    : { A: "black", B: "white" };
}

function startTiebreak(state) {
  assertActive(state);
  const alert = tieAlert(state);
  if (!alert) {
    const e = new Error(
      "The match isn't level yet — there's nothing to break.",
    );
    e.status = 409;
    throw e;
  }

  const lastColors = lastColorPlayed(state);
  const aFirst = lastColors.A === "black"; // A plays White game 1 if A was Black last
  const bestOf = 4;
  const games = [];
  for (let i = 0; i < bestOf; i++) {
    const aIsWhite = aFirst ? i % 2 === 0 : i % 2 === 1;
    games.push(
      makeGame(i + 1, aIsWhite ? "A" : "B", aIsWhite ? "B" : "A", "standard"),
    );
  }

  state.tiebreak = {
    status: "miniMatch",
    miniMatch: { bestOf, games },
    armageddon: null,
    winnerId: null,
  };
  return state.tiebreak;
}

function miniMatchScores(miniMatch) {
  let scoreA = 0;
  let scoreB = 0;
  miniMatch.games.forEach((g) => {
    if (!g.result) return;
    const side = (id) => (g.whiteId === id ? "white" : "black");
    scoreA += scoreFromResult(g.result, side("A"));
    scoreB += scoreFromResult(g.result, side("B"));
  });
  return { scoreA, scoreB };
}

function finishTiebreak(state, winnerId) {
  state.tiebreak.status = "complete";
  state.tiebreak.winnerId = winnerId;
  state.winnerId = winnerId;
  state.status = "finished";
  state.finishedAt = new Date().toISOString();
}

function recordTiebreakGameResult(state, { gameId, result }) {
  assertActive(state);
  if (!state.tiebreak || state.tiebreak.status !== "miniMatch") {
    const e = new Error("No mini-match is currently in progress.");
    e.status = 409;
    throw e;
  }
  assertValidResult(result);
  const game = state.tiebreak.miniMatch.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown mini-match game.");
    e.status = 404;
    throw e;
  }
  game.result = result;
  game.status = "complete";

  // Stop once mathematically decided — first to reach more than half of
  // bestOf (i.e. > 2 out of 4, so 2.5+) wins outright, checked after every
  // game rather than always forcing all 4 to be played.
  const { scoreA, scoreB } = miniMatchScores(state.tiebreak.miniMatch);
  const halfPoint = state.tiebreak.miniMatch.bestOf / 2;
  if (scoreA > halfPoint) return finishTiebreak(state, "A");
  if (scoreB > halfPoint) return finishTiebreak(state, "B");

  const allPlayed = state.tiebreak.miniMatch.games.every((g) => g.result);
  if (allPlayed) {
    // scoreA === scoreB === halfPoint (2-2) — hand off to Armageddon.
    state.tiebreak.status = "armageddon";
    state.tiebreak.armageddon = {
      status: "awaiting_bids",
      bidA: null,
      bidB: null,
      whiteId: null,
      blackId: null,
      result: null,
    };
  }
  return game;
}

// ─── Tiebreak: Armageddon (bid system) ─────────────────────────────────────
// Both players tell the arbiter, privately, the amount of time (in seconds)
// they'd be willing to accept playing Black for. The arbiter enters both
// bids at once; the LOWER bid gets Black (with draw odds) and plays with
// that amount of time, while White gets the section/match's normal time
// allotment (that clock detail is left to the arbiter/board to set up —
// this module only tracks who's bidding for which color). Equal bids can't
// be resolved fairly, so the arbiter is prompted to collect a re-bid rather
// than the system guessing.
function recordArmageddonBids(state, { bidA, bidB }) {
  assertActive(state);
  const a = state.tiebreak?.armageddon;
  if (!a || (a.status !== "awaiting_bids" && a.status !== "bid_tie")) {
    const e = new Error("Armageddon isn't awaiting bids right now.");
    e.status = 409;
    throw e;
  }

  const nBidA = Number(bidA);
  const nBidB = Number(bidB);
  if (
    !Number.isFinite(nBidA) ||
    nBidA <= 0 ||
    !Number.isFinite(nBidB) ||
    nBidB <= 0
  ) {
    const e = new Error("Both bids must be positive numbers (seconds).");
    e.status = 400;
    throw e;
  }

  a.bidA = nBidA;
  a.bidB = nBidB;

  if (nBidA === nBidB) {
    a.status = "bid_tie";
    a.whiteId = null;
    a.blackId = null;
    return a; // frontend should prompt the arbiter to collect a fresh pair of bids
  }

  const blackId = nBidA < nBidB ? "A" : "B";
  const whiteId = blackId === "A" ? "B" : "A";
  a.whiteId = whiteId;
  a.blackId = blackId;
  a.status = "awaiting_result";
  return a;
}

// Black has draw odds: anything other than a clean White win goes to
// Black, including a draw or a double forfeit — this always produces a
// decisive match result by construction, same rule as the existing
// standings-level decider's Armageddon leg.
function armageddonWinnerSide(a) {
  return WHITE_WIN_RESULTS.has(a.result) ? a.whiteId : a.blackId;
}

function recordArmageddonResult(state, { result }) {
  assertActive(state);
  const a = state.tiebreak?.armageddon;
  if (!a || a.status !== "awaiting_result") {
    const e = new Error(
      "Armageddon isn't awaiting a result right now — record bids first.",
    );
    e.status = 409;
    throw e;
  }
  assertValidResult(result);
  a.result = result;
  a.status = "complete";
  finishTiebreak(state, armageddonWinnerSide(a));
  return a;
}

// ─── Game History (flat, chronological) ────────────────────────────────────
function getGameHistory(state) {
  const rows = [];
  state.sections.forEach((section) => {
    section.games.forEach((g) => {
      rows.push({
        source: "section",
        sectionId: section.id,
        sectionLabel: section.label,
        variant: section.variant,
        ...g,
      });
    });
  });
  if (state.tiebreak) {
    state.tiebreak.miniMatch.games.forEach((g) => {
      rows.push({
        source: "tiebreak_miniMatch",
        sectionId: null,
        sectionLabel: "Tiebreak (mini-match)",
        variant: "standard",
        ...g,
      });
    });
    if (state.tiebreak.armageddon && state.tiebreak.armageddon.result) {
      const a = state.tiebreak.armageddon;
      rows.push({
        source: "armageddon",
        sectionId: null,
        sectionLabel: "Armageddon",
        variant: "standard",
        id: "armageddon",
        gameNum: 1,
        whiteId: a.whiteId,
        blackId: a.blackId,
        moves: [],
        fen: null,
        pgn: null,
        result: a.result,
        status: "complete",
      });
    }
  }
  return rows;
}

// ─── Section Performance ───────────────────────────────────────────────────
// Per-section, per-competitor breakdown: games played, W/L/D, points.
// Tiebreak games are intentionally excluded here — they aren't part of any
// named time-format section, and are already visible in Game History and
// in the tiebreak state itself.
function getSectionPerformance(state) {
  return state.sections.map((section) => {
    const stat = {
      A: { played: 0, wins: 0, losses: 0, draws: 0, points: 0 },
      B: { played: 0, wins: 0, losses: 0, draws: 0, points: 0 },
    };
    section.games.forEach((g) => {
      if (!g.result) return;
      ["A", "B"].forEach((id) => {
        const opponent = id === "A" ? "B" : "A";
        const side = g.whiteId === id ? "white" : "black";
        const pts = scoreFromResult(g.result, side);
        stat[id].played += 1;
        stat[id].points += pts;
        if (pts === 1) stat[id].wins += 1;
        else if (pts === 0.5) stat[id].draws += 1;
        else stat[id].losses += 1;
      });
    });
    return {
      sectionId: section.id,
      label: section.label,
      variant: section.variant,
      numberOfGames: section.numberOfGames,
      A: stat.A,
      B: stat.B,
    };
  });
}

// ─── Serialization ──────────────────────────────────────────────────────
function serializeGame(g, nameOf) {
  return {
    id: g.id,
    gameNum: g.gameNum,
    whiteId: g.whiteId,
    whiteName: nameOf(g.whiteId),
    blackId: g.blackId,
    blackName: nameOf(g.blackId),
    startFen: g.startFen,
    moves: g.moves,
    fen: g.fen,
    pgn: g.pgn,
    boardStatus: g.boardStatus,
    suggestedResult:
      g.status !== "complete" ? chessGame.suggestedResult(g.boardStatus) : null,
    result: g.result,
    status: g.status,
  };
}

function serialize(state) {
  const nameOf = (id) => (id ? state.competitors[id]?.name || "???" : null);
  const { scoreA, scoreB } = computeScores(state);

  return {
    id: state.id,
    competitors: state.competitors,
    sections: state.sections.map((s) => ({
      id: s.id,
      label: s.label,
      timeControl: s.timeControl,
      variant: s.variant,
      numberOfGames: s.numberOfGames,
      games: s.games.map((g) => serializeGame(g, nameOf)),
    })),
    score: { A: scoreA, B: scoreB },
    tieAlert: tieAlert(state),
    tiebreak: state.tiebreak
      ? {
          status: state.tiebreak.status,
          miniMatch: {
            bestOf: state.tiebreak.miniMatch.bestOf,
            games: state.tiebreak.miniMatch.games.map((g) =>
              serializeGame(g, nameOf),
            ),
            score: miniMatchScores(state.tiebreak.miniMatch),
          },
          armageddon: state.tiebreak.armageddon && {
            status: state.tiebreak.armageddon.status,
            // Bids are only revealed once both are in and resolved (or
            // tied) — never expose one bid while the other is still
            // pending, so the "private to the arbiter" bidding stays
            // meaningful even if a client is left open on-screen.
            bidA:
              state.tiebreak.armageddon.status === "awaiting_bids"
                ? null
                : state.tiebreak.armageddon.bidA,
            bidB:
              state.tiebreak.armageddon.status === "awaiting_bids"
                ? null
                : state.tiebreak.armageddon.bidB,
            whiteId: state.tiebreak.armageddon.whiteId,
            whiteName: nameOf(state.tiebreak.armageddon.whiteId),
            blackId: state.tiebreak.armageddon.blackId,
            blackName: nameOf(state.tiebreak.armageddon.blackId),
            result: state.tiebreak.armageddon.result,
          },
          winnerId: state.tiebreak.winnerId,
          winnerName: nameOf(state.tiebreak.winnerId),
        }
      : null,
    status: state.status,
    winnerId: state.winnerId,
    winnerName: nameOf(state.winnerId),
    finishedAt: state.finishedAt,
  };
}

module.exports = {
  createCageMatch,
  recordMove,
  undoMove,
  setGameResult,
  clearGameResult,
  computeScores,
  tieAlert,
  startTiebreak,
  recordTiebreakGameResult,
  recordArmageddonBids,
  recordArmageddonResult,
  getGameHistory,
  getSectionPerformance,
  serialize,
  // exported for tests / potential reuse
  finalizeIfPossible,
};
