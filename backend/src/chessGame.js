// chessGame.js
// ─────────────────────────────────────────────────────────────────────────
// Thin wrapper around the `chess.js` npm package (jhlywa/chess.js, v1.x —
// run `npm install chess.js` if it isn't already a dependency). Everything
// else in the app (cageMatch.js, and later matchTournament.js) treats a
// "game" as plain data: `{ startFen, moves: [...SAN], fen, pgn, status }`.
// This module is the ONLY place that touches the chess.js library itself,
// so if the library's API ever changes, or we swap it out, this is the one
// file that needs to change.
//
// Design choice: we don't keep a live chess.js instance sitting in memory
// per game (the server is stateless across restarts / could be horizontally
// scaled later). Instead every operation replays the stored SAN move list
// from startFen through chess.js, applies/validates the new move, and
// returns fresh derived state (fen/pgn/status) to be stored back onto the
// game object by the caller. Slightly more CPU per move than keeping a live
// instance, but trivially cheap for game lengths a human match will ever
// reach, and it means the stored game object is always the single source of
// truth — nothing hides in an in-memory Chess() instance that could drift
// from what's persisted.

const { Chess } = require("chess.js");

// Standard starting position — chess.js already defaults to this when no
// FEN is passed to `new Chess()`, but we return it explicitly so callers
// can always assume `startingFen(...)` returns a real FEN string, never
// null/undefined.
const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─── Chess960 starting position ────────────────────────────────────────────
// chess960.js's randomChess960Position()/positionFromId() return
//   { id, backRank: ["R","N","B","Q","K","B","N","R"], fen }
// where `fen` uses Shredder-FEN castling ("HAha" — rook file letters). That
// notation is correct for real Chess960 tools, but chess.js's FEN validator
// only accepts KQkq-style castling and throws "Invalid FEN: castling
// availability is invalid" on anything else. So we NEVER trust `.fen` when a
// back rank is available: we rebuild the FEN from the back rank ourselves,
// with KQkq castling, which chess.js loads for all 960 arrangements.
//
// Accepted input shapes: the { id, backRank, fen } object above (backRank as
// an array OR an 8-letter string), a bare 8-letter back-rank string, or a
// full FEN string (fallback only — its castling field gets normalized).
function backRankString(pos) {
  if (typeof pos === "string") return pos.includes("/") ? null : pos;
  if (Array.isArray(pos)) return pos.join("");
  if (pos && typeof pos === "object") {
    const br = pos.backRank ?? pos.startPosition ?? pos.position ?? pos.rank;
    if (Array.isArray(br)) return br.join("");
    if (typeof br === "string") return br;
  }
  return null;
}

// chess.js only accepts KQkq-style castling fields (or "-"). Older stored
// games — and anything built from chess960.js's Shredder-FEN — may carry
// file letters like "HAha"; at the starting position both sides hold every
// castling right, so KQkq is the faithful translation. A placement-only
// string gets the remaining FEN fields filled in.
const CASTLING_OK = /^(KQ?k?q?|Qk?q?|kq?|q|-)$/;
function normalizeStartFen(fen) {
  if (!fen || typeof fen !== "string") return fen;
  const parts = fen.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0]} w KQkq - 0 1`;
  if (parts.length >= 3 && !CASTLING_OK.test(parts[2])) parts[2] = "KQkq";
  return parts.join(" ");
}

// Assembles the full starting FEN for a Chess960 position.
function chess960StartFen(chess960Position) {
  const rank = backRankString(chess960Position);
  if (rank && /^[KQRBN]{8}$/i.test(rank)) {
    const r = rank.toUpperCase();
    return `${r.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${r} w KQkq - 0 1`;
  }

  const fen =
    typeof chess960Position === "string"
      ? chess960Position
      : chess960Position && chess960Position.fen;
  if (typeof fen === "string" && fen.includes("/")) {
    return normalizeStartFen(fen);
  }

  const e = new Error(
    "Unrecognized chess960 position shape — expected { backRank } (array or " +
      "8-letter string), a bare 8-letter back rank, or a full FEN.",
  );
  e.status = 500;
  throw e;
}

// ─── Core replay/validate ───────────────────────────────────────────────────
// Loads a chess.js instance at `startFen` (or standard start) and replays
// `moves` (SAN strings) in order. Throws a 400 error if any stored move
// somehow doesn't replay — that would indicate corrupted data, not a user
// mistake, since moves are validated at write-time by applyMove() below.
function loadGame(startFen, moves = []) {
  // normalizeStartFen self-heals games stored before the castling-field fix.
  const chess = new Chess(normalizeStartFen(startFen) || STANDARD_START_FEN, {
    chess960: true,
  });
  for (const san of moves) {
    const result = chess.move(san, { strict: false });
    if (!result) {
      const e = new Error(
        `Stored move "${san}" is not legal from the preceding position — game history may be corrupted.`,
      );
      e.status = 500;
      throw e;
    }
  }
  return chess;
}

// Validates and applies a single new move on top of the game's existing
// move list. `moveInput` can be a SAN string ("Nf3", "O-O", "e4") or a
// { from, to, promotion? } object — chess.js accepts both.
// Returns the new derived state to store back on the game record:
//   { moves, fen, pgn, status, lastMove }
// Throws a 400 error (illegal move) rather than mutating anything if the
// move doesn't apply.
function applyMove(game, moveInput) {
  const chess = loadGame(game.startFen, game.moves);

  let moveResult;
  try {
    moveResult = chess.move(moveInput, { strict: false });
  } catch (err) {
    moveResult = null;
  }

  if (!moveResult) {
    const e = new Error(
      `"${
        typeof moveInput === "string" ? moveInput : JSON.stringify(moveInput)
      }" is not a legal move in the current position.`,
    );
    e.status = 400;
    throw e;
  }

  return {
    moves: [...game.moves, moveResult.san],
    fen: chess.fen(),
    pgn: chess.pgn(),
    lastMove: { from: moveResult.from, to: moveResult.to, san: moveResult.san },
    status: deriveStatus(chess),
  };
}

// Removes the most recently recorded move (arbiter correcting a mis-entry).
// Returns the same shape as applyMove(). Throws if there's nothing to undo.
function undoLastMove(game) {
  if (!game.moves.length) {
    const e = new Error("No moves recorded yet for this game.");
    e.status = 400;
    throw e;
  }
  const newMoves = game.moves.slice(0, -1);
  const chess = loadGame(game.startFen, newMoves);
  return {
    moves: newMoves,
    fen: chess.fen(),
    pgn: chess.pgn(),
    lastMove: newMoves.length
      ? null // we don't bother reconstructing the prior lastMove's from/to; the
      : // move list itself is the source of truth for display
        null,
    status: deriveStatus(chess),
  };
}

// Board-driven status — distinct from the *match* result code (1-0, 0-1,
// 1/2-1/2, forfeits) that the arbiter records separately in cageMatch.js.
// This is purely "what does the position on the board say right now",
// surfaced so the recording UI can suggest a result (e.g. auto-fill
// "checkmate — Black wins" for confirmation) without forcing it.
function deriveStatus(chess) {
  if (chess.isCheckmate()) {
    return {
      kind: "checkmate",
      winnerSide: chess.turn() === "w" ? "black" : "white",
    };
  }
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isThreefoldRepetition()) return { kind: "threefold_repetition" };
  if (chess.isInsufficientMaterial()) return { kind: "insufficient_material" };
  if (chess.isDraw()) return { kind: "draw_rule" }; // 50-move rule, etc.
  if (chess.isCheck()) return { kind: "check" };
  return { kind: "in_progress" };
}

// Suggests a result code from board status, for the UI to pre-fill and the
// arbiter to confirm/override — never auto-applied without confirmation.
function suggestedResult(status) {
  if (status.kind === "checkmate") {
    return status.winnerSide === "white" ? "1-0" : "0-1";
  }
  if (
    [
      "stalemate",
      "threefold_repetition",
      "insufficient_material",
      "draw_rule",
    ].includes(status.kind)
  ) {
    return "1/2-1/2";
  }
  return null;
}

// Legal moves from the current position — used by the client board to
// highlight legal destination squares. Returns chess.js's verbose move list.
function legalMoves(game) {
  const chess = loadGame(game.startFen, game.moves);
  return chess.moves({ verbose: true });
}

module.exports = {
  STANDARD_START_FEN,
  chess960StartFen,
  normalizeStartFen,
  loadGame,
  applyMove,
  undoLastMove,
  deriveStatus,
  suggestedResult,
  legalMoves,
};
