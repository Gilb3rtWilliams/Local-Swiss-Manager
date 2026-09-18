// matchPlay.js
// ─────────────────────────────────────────────────────────────────────────
// Generalized best-of-N mini-match engine for the "Match Play" format —
// applies the Cage Match idea (a set of games + tiebreak mini-match +
// Armageddon) to a single pairing/board inside a Swiss/round-robin round or
// a bracket match, where the two competitors change every round/match
// rather than staying fixed for a whole event.
//
// Deliberately NOT a refactor of cageMatch.js — that module's fixed
// two-competitor (A/B) shape stays exactly as shipped, untouched. This
// module instead takes the two real ids directly: whichever id is passed as
// `idA` keeps that role for the life of THIS one mini-match (same idea as
// Cage Match's "A" just being whoever was entered first) — there's no
// standings-level identity attached to "A" here, it only exists to label
// game 1's colors and to keep the tiebreak's internal bookkeeping stable.
//
// This module only knows about ONE mini-match at a time. tournamentService.js
// is responsible for attaching one to each Swiss/round-robin pairing (or
// team board) per round, and to each bracket match once both competitors are
// known (bracket.js/resolveBracket()/activateMatch() are all unmodified —
// see their own files for why).
//
// A MiniMatch:
// {
//   id,
//   idA, idB,                  // the two real player/team ids for this board
//   numberOfGames,
//   variant: "standard" | "chess960",
//   allowDraw,                 // Swiss/RR/DRR: true — a level mini-match
//                               // CAN stand as a genuine draw, but only via
//                               // the organizer's explicit acceptDraw()
//                               // call; it never auto-resolves that way.
//                               // The other option is always available too:
//                               // startTiebreak(), which runs through to
//                               // Armageddon, always decisive.
//                               // Bracket: false — acceptDraw() is refused;
//                               // someone has to advance, so a tie always
//                               // requires the tiebreak flow.
//   chess960,                  // null | { id, backRank, fen } — ONE shared
//                               // position for every game in this
//                               // mini-match, mirroring how a Swiss/RR round
//                               // or bracket tier shares one Chess960 draw
//                               // across every pairing in it today. This is
//                               // NOT a fresh draw per game the way Cage
//                               // Match does it — the caller passes in the
//                               // round's/tier's already-rolled position.
//   games: [ Game, ... ],      // same Game shape as cageMatch.js:
//                               // { id, gameNum, whiteId, blackId, startFen,
//                               //   moves, fen, pgn, boardStatus, result,
//                               //   status }
//   tiebreak: null | {
//     status: "miniMatch" | "armageddon" | "complete",
//     miniMatch: { bestOf: 4, games: [ Game, ... ] },
//     armageddon: null | {
//       status: "awaiting_bids" | "bid_tie" | "awaiting_result" | "complete",
//       bidA: number | null, bidB: number | null,
//       whiteId: null | id, blackId: null | id,
//       result: null | ResultCode,
//     },
//     winnerId: null | id,
//   },
//   status: "in_progress" | "decided",
//   winnerId: null | id,       // real player/team id once decided; null if
//                               // the mini-match settled as a genuine draw
//   result: null | ResultCode, // collapsed classical result, relative to
//                               // idA as "White" / idB as "Black" — the
//                               // caller drops this straight into
//                               // pairing.result or a bracket match's
//                               // result exactly like a single game's
//                               // result today. Always decisive
//                               // ("1-0"/"0-1") once Armageddon has run;
//                               // "1/2-1/2" only when allowDraw let a real
//                               // tie stand.
//   finishedAt: null | ISOString,
// }

const chessGame = require("./chessGame");

// ─── Local result/score helpers (same vocabulary as cageMatch.js /
// tournamentService.js's WHITE_WIN_RESULTS etc. — kept local rather than
// imported, same reasoning as cageMatch.js's own header comment: avoids a
// circular require back into tournamentService.js) ──────────────────────────
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

function assertActive(mm) {
  if (mm.status === "decided") {
    const e = new Error("This mini-match is already decided.");
    e.status = 409;
    throw e;
  }
}

// ─── Construction ───────────────────────────────────────────────────────────
function makeGame(gameNum, whiteId, blackId, chess960Position) {
  return {
    id: uid(),
    gameNum,
    whiteId,
    blackId,
    startFen: chess960Position ? chess960Position.fen : null,
    moves: [],
    fen: null,
    pgn: null,
    boardStatus: { kind: "in_progress" },
    result: null,
    status: "pending",
  };
}

// input: {
//   idA, idB,                 // required — the two real ids for this board
//   numberOfGames,             // required, positive integer
//   variant,                   // "standard" | "chess960", default "standard"
//   allowDraw,                 // default true
//   chess960Position,          // required iff variant === "chess960" — the
//                               // already-rolled { id, backRank, fen } for
//                               // this round/tier (see file header)
// }
// Colors alternate strictly game-to-game, idA as White in game 1 — same
// convention as Cage Match sections and the existing standings decider's
// makeMatchLeg().
function makeMiniMatch(input = {}) {
  const { idA, idB, numberOfGames, chess960Position } = input;
  if (!idA || !idB) {
    const e = new Error("A mini-match needs two competitor ids.");
    e.status = 400;
    throw e;
  }
  const n = Number(numberOfGames);
  if (!Number.isInteger(n) || n < 1) {
    const e = new Error("numberOfGames must be a positive integer.");
    e.status = 400;
    throw e;
  }
  const variant = input.variant || "standard";
  if (variant !== "standard" && variant !== "chess960") {
    const e = new Error(`Invalid variant "${variant}".`);
    e.status = 400;
    throw e;
  }
  if (variant === "chess960" && !chess960Position) {
    const e = new Error(
      "A chess960 mini-match needs the round/tier's chess960Position.",
    );
    e.status = 400;
    throw e;
  }

  const games = [];
  for (let i = 0; i < n; i++) {
    const aIsWhite = i % 2 === 0;
    games.push(
      makeGame(
        i + 1,
        aIsWhite ? idA : idB,
        aIsWhite ? idB : idA,
        variant === "chess960" ? chess960Position : null,
      ),
    );
  }

  return {
    id: uid(),
    idA,
    idB,
    numberOfGames: n,
    variant,
    allowDraw: input.allowDraw !== false,
    chess960: variant === "chess960" ? chess960Position : null,
    games,
    tiebreak: null,
    status: "in_progress",
    winnerId: null,
    result: null,
    finishedAt: null,
  };
}

// ─── Lookup helpers ──────────────────────────────────────────────────────
function findGame(mm, gameId) {
  const game = mm.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown game in this mini-match.");
    e.status = 404;
    throw e;
  }
  return game;
}

// ─── Move entry (manual, board-driven) ─────────────────────────────────────
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

function recordMove(mm, { gameId, move }) {
  assertActive(mm);
  const game = findGame(mm, gameId);
  applyMoveToGame(game, move);
  return game;
}

function undoMove(mm, { gameId }) {
  assertActive(mm);
  const game = findGame(mm, gameId);
  undoMoveOnGame(game);
  return game;
}

function setGameResult(mm, { gameId, result }) {
  assertActive(mm);
  assertValidResult(result);
  const game = findGame(mm, gameId);
  game.result = result;
  game.status = "complete";
  finalizeIfPossible(mm);
  return game;
}

function clearGameResult(mm, { gameId }) {
  const game = findGame(mm, gameId);
  game.result = null;
  game.status = game.moves.length ? "in_progress" : "pending";
  // Same reasoning as cageMatch.js's clearGameResult: undoing a result can
  // un-decide a mini-match that had already resolved off the back of it —
  // if a tiebreak had started on a now-false tie, drop it too.
  if (mm.tiebreak) mm.tiebreak = null;
  mm.status = "in_progress";
  mm.winnerId = null;
  mm.result = null;
  mm.finishedAt = null;
  return game;
}

// ─── Scoring ────────────────────────────────────────────────────────────
function computeScore(mm) {
  let scoreA = 0;
  let scoreB = 0;
  mm.games.forEach((g) => {
    if (!g.result) return;
    const side = (id) => (g.whiteId === id ? "white" : "black");
    scoreA += scoreFromResult(g.result, side(mm.idA));
    scoreB += scoreFromResult(g.result, side(mm.idB));
  });
  return { scoreA, scoreB };
}

function allGamesComplete(mm) {
  return mm.games.every((g) => g.result);
}

// Collapses a decided outcome (winnerId, or null for a real draw) into the
// classical result code relative to idA-as-White/idB-as-Black — this is the
// value tournamentService.js drops straight into pairing.result or a
// bracket match's result field.
function collapse(mm, winnerId /* null => draw */) {
  if (winnerId === null) return "1/2-1/2";
  return winnerId === mm.idA ? "1-0" : "0-1";
}

function finish(mm, winnerId /* null => draw */) {
  mm.status = "decided";
  mm.winnerId = winnerId;
  mm.result = collapse(mm, winnerId);
  mm.finishedAt = new Date().toISOString();
}

// Called after every result-affecting mutation on the main games. Only ever
// settles a DECISIVE outcome automatically — a tie never auto-resolves,
// even when allowDraw is set, so the organizer always gets a real chance to
// choose between accepting the draw (acceptDraw(), below) and forcing the
// tiebreak flow (startTiebreak()), the same explicit-choice UX Cage Match
// already uses. Silently auto-finishing a tie as a draw would remove that
// choice — by the time anything downstream could react, it'd already be
// decided.
function finalizeIfPossible(mm) {
  if (mm.tiebreak) return;
  if (!allGamesComplete(mm)) return;

  const { scoreA, scoreB } = computeScore(mm);
  if (scoreA === scoreB) return; // tieAlert() surfaces it; no auto-resolve
  finish(mm, scoreA > scoreB ? mm.idA : mm.idB);
}

// Explicit organizer action accepting a level mini-match as a genuine draw
// (Swiss/RR/DRR only — allowDraw is false for a bracket match, where a tie
// must always go through the tiebreak flow since someone has to advance).
function acceptDraw(mm) {
  assertActive(mm);
  if (!mm.allowDraw) {
    const e = new Error(
      "This mini-match can't be left as a draw — someone has to win it.",
    );
    e.status = 400;
    throw e;
  }
  const alert = tieAlert(mm);
  if (!alert) {
    const e = new Error(
      "This mini-match isn't level yet — there's nothing to accept as a draw.",
    );
    e.status = 409;
    throw e;
  }
  finish(mm, null);
}

// Surfaced on every read so the frontend can prompt "scores are level —
// accept the draw, or start the tiebreak mini-match?".
function tieAlert(mm) {
  if (mm.tiebreak || mm.status === "decided") return null;
  if (!allGamesComplete(mm)) return null;
  const { scoreA, scoreB } = computeScore(mm);
  if (scoreA !== scoreB) return null;
  return { scoreA, scoreB };
}

// ─── Tiebreak: 4-game mini-match (first to 2.5) ────────────────────────────
function lastColorPlayed(mm) {
  const last = [...mm.games].reverse().find((g) => g.result);
  if (!last) return { A: "white", B: "black" }; // shouldn't happen — tieAlert requires all games played
  return last.whiteId === mm.idA
    ? { A: "white", B: "black" }
    : { A: "black", B: "white" };
}

function startTiebreak(mm) {
  assertActive(mm);
  const alert = tieAlert(mm);
  if (!alert) {
    const e = new Error(
      "This mini-match isn't level yet — there's nothing to break.",
    );
    e.status = 409;
    throw e;
  }

  const lastColors = lastColorPlayed(mm);
  const aFirst = lastColors.A === "black";
  const bestOf = 4;
  const games = [];
  for (let i = 0; i < bestOf; i++) {
    const aIsWhite = aFirst ? i % 2 === 0 : i % 2 === 1;
    games.push(
      makeGame(
        i + 1,
        aIsWhite ? mm.idA : mm.idB,
        aIsWhite ? mm.idB : mm.idA,
        mm.variant === "chess960" ? mm.chess960 : null,
      ),
    );
  }

  mm.tiebreak = {
    status: "miniMatch",
    miniMatch: { bestOf, games },
    armageddon: null,
    winnerId: null,
  };
  return mm.tiebreak;
}

function tiebreakMiniMatchScores(mm) {
  let scoreA = 0;
  let scoreB = 0;
  mm.tiebreak.miniMatch.games.forEach((g) => {
    if (!g.result) return;
    const side = (id) => (g.whiteId === id ? "white" : "black");
    scoreA += scoreFromResult(g.result, side(mm.idA));
    scoreB += scoreFromResult(g.result, side(mm.idB));
  });
  return { scoreA, scoreB };
}

function finishTiebreak(mm, winnerId) {
  mm.tiebreak.status = "complete";
  mm.tiebreak.winnerId = winnerId;
  finish(mm, winnerId);
}

function recordTiebreakMove(mm, { gameId, move }) {
  assertActive(mm);
  if (!mm.tiebreak || mm.tiebreak.status !== "miniMatch") {
    const e = new Error("No tiebreak mini-match is currently in progress.");
    e.status = 409;
    throw e;
  }
  const game = mm.tiebreak.miniMatch.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown tiebreak game.");
    e.status = 404;
    throw e;
  }
  applyMoveToGame(game, move);
  return game;
}

function undoTiebreakMove(mm, { gameId }) {
  assertActive(mm);
  if (!mm.tiebreak || mm.tiebreak.status !== "miniMatch") {
    const e = new Error("No tiebreak mini-match is currently in progress.");
    e.status = 409;
    throw e;
  }
  const game = mm.tiebreak.miniMatch.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown tiebreak game.");
    e.status = 404;
    throw e;
  }
  undoMoveOnGame(game);
  return game;
}

function recordTiebreakGameResult(mm, { gameId, result }) {
  assertActive(mm);
  if (!mm.tiebreak || mm.tiebreak.status !== "miniMatch") {
    const e = new Error("No tiebreak mini-match is currently in progress.");
    e.status = 409;
    throw e;
  }
  assertValidResult(result);
  const game = mm.tiebreak.miniMatch.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown tiebreak game.");
    e.status = 404;
    throw e;
  }
  game.result = result;
  game.status = "complete";

  const { scoreA, scoreB } = tiebreakMiniMatchScores(mm);
  const halfPoint = mm.tiebreak.miniMatch.bestOf / 2;
  if (scoreA > halfPoint) return finishTiebreak(mm, mm.idA);
  if (scoreB > halfPoint) return finishTiebreak(mm, mm.idB);

  const allPlayed = mm.tiebreak.miniMatch.games.every((g) => g.result);
  if (allPlayed) {
    // scoreA === scoreB === halfPoint — hand off to Armageddon, always
    // decisive by construction, so this path exists regardless of
    // allowDraw (a bracket match that reached the tiebreak mini-match has
    // no other way to produce an advancer; a Swiss/RR pairing that got
    // this far was deliberately pushed past its own auto-draw by the
    // organizer calling startTiebreak() in the first place).
    mm.tiebreak.status = "armageddon";
    mm.tiebreak.armageddon = {
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
function recordArmageddonBids(mm, { bidA, bidB }) {
  assertActive(mm);
  const a = mm.tiebreak?.armageddon;
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
    return a;
  }

  const blackId = nBidA < nBidB ? mm.idA : mm.idB;
  const whiteId = blackId === mm.idA ? mm.idB : mm.idA;
  a.whiteId = whiteId;
  a.blackId = blackId;
  a.status = "awaiting_result";
  return a;
}

function armageddonWinnerId(a) {
  return WHITE_WIN_RESULTS.has(a.result) ? a.whiteId : a.blackId;
}

function recordArmageddonResult(mm, { result }) {
  assertActive(mm);
  const a = mm.tiebreak?.armageddon;
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
  finishTiebreak(mm, armageddonWinnerId(a));
  return a;
}

// ─── Serialization ──────────────────────────────────────────────────────
// nameOf(id) resolves a real player/team id to display info — the caller
// knows the roster, this module doesn't. Returns the same per-game shape
// cageMatch.js's serializeGame() does, so the frontend's board/history
// components can be shared between the two features.
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

function serialize(mm, nameOf) {
  const { scoreA, scoreB } = computeScore(mm);
  return {
    id: mm.id,
    idA: mm.idA,
    idB: mm.idB,
    nameA: nameOf(mm.idA),
    nameB: nameOf(mm.idB),
    numberOfGames: mm.numberOfGames,
    variant: mm.variant,
    chess960: mm.chess960,
    games: mm.games.map((g) => serializeGame(g, nameOf)),
    score: { A: scoreA, B: scoreB },
    tieAlert: tieAlert(mm),
    tiebreak: mm.tiebreak
      ? {
          status: mm.tiebreak.status,
          miniMatch: {
            bestOf: mm.tiebreak.miniMatch.bestOf,
            games: mm.tiebreak.miniMatch.games.map((g) =>
              serializeGame(g, nameOf),
            ),
            score: tiebreakMiniMatchScores(mm),
          },
          armageddon: mm.tiebreak.armageddon && {
            status: mm.tiebreak.armageddon.status,
            bidA:
              mm.tiebreak.armageddon.status === "awaiting_bids"
                ? null
                : mm.tiebreak.armageddon.bidA,
            bidB:
              mm.tiebreak.armageddon.status === "awaiting_bids"
                ? null
                : mm.tiebreak.armageddon.bidB,
            whiteId: mm.tiebreak.armageddon.whiteId,
            whiteName: nameOf(mm.tiebreak.armageddon.whiteId),
            blackId: mm.tiebreak.armageddon.blackId,
            blackName: nameOf(mm.tiebreak.armageddon.blackId),
            result: mm.tiebreak.armageddon.result,
          },
          winnerId: mm.tiebreak.winnerId,
          winnerName: nameOf(mm.tiebreak.winnerId),
        }
      : null,
    status: mm.status,
    winnerId: mm.winnerId,
    winnerName: mm.winnerId ? nameOf(mm.winnerId) : null,
    result: mm.result,
    finishedAt: mm.finishedAt,
  };
}

// ─── Game History ───────────────────────────────────────────────────────
// Flat list of every game this ONE mini-match has played — main games, then
// the tiebreak mini-match's games, then the Armageddon game if it happened.
// Mirrors cageMatch.js's getGameHistory() row shape exactly (source,
// gameNum, whiteId, blackId, moves, fen, pgn, result, status, ...) so a
// caller aggregating across many mini-matches (tournamentService.js's
// getMatchPlayHistory, one per round/pairing or bracket match/board) can
// tag each row with its own context and reuse the same
// display/rendering as Cage Match's Game History tab.
function getGameHistory(mm) {
  const rows = [];
  mm.games.forEach((g) => {
    rows.push({ source: "main", ...g });
  });
  if (mm.tiebreak) {
    mm.tiebreak.miniMatch.games.forEach((g) => {
      rows.push({ source: "tiebreak_miniMatch", ...g });
    });
    if (mm.tiebreak.armageddon && mm.tiebreak.armageddon.result) {
      const a = mm.tiebreak.armageddon;
      rows.push({
        source: "armageddon",
        id: `${mm.id}-armageddon`,
        gameNum: 1,
        whiteId: a.whiteId,
        blackId: a.blackId,
        startFen: null,
        moves: [],
        fen: null,
        pgn: null,
        boardStatus: { kind: "in_progress" },
        result: a.result,
        status: "complete",
      });
    }
  }
  return rows;
}

module.exports = {
  makeMiniMatch,
  recordMove,
  undoMove,
  setGameResult,
  clearGameResult,
  computeScore,
  tieAlert,
  acceptDraw,
  startTiebreak,
  recordTiebreakMove,
  undoTiebreakMove,
  recordTiebreakGameResult,
  recordArmageddonBids,
  recordArmageddonResult,
  serialize,
  getGameHistory,
  // exported for tests / potential reuse
  finalizeIfPossible,
};
