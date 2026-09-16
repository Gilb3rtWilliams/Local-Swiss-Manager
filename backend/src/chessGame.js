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
// chess960.js (already in this codebase) generates a back-rank arrangement
// via randomChess960Position(). We defensively accept a few possible return
// shapes from it, since we haven't seen that file's exact output:
//   - a plain 8-character back-rank string, e.g. "BBQNNRKR"
//   - an object carrying that string under a common key
//   - a full starting FEN already
// If chess960.js's actual shape differs from all three, buildChess960Fen
// throws a clear error rather than silently producing an illegal position —
// flag this to whoever wires it up so the mapping can be corrected once
// chess960.js is shared.
function buildChess960Fen(chess960Position) {
  let backRank = null;

  if (typeof chess960Position === "string") {
    // Already a full FEN (contains '/' and a side-to-move field) vs. just
    // an 8-letter back rank.
    if (chess960Position.includes("/")) return chess960Position;
    backRank = chess960Position;
  } else if (chess960Position && typeof chess960Position === "object") {
    backRank =
      chess960Position.backRank ||
      chess960Position.startPosition ||
      chess960Position.position ||
      chess960Position.rank ||
      null;
    if (chess960Position.fen) return chess960Position.fen;
  }

  if (!backRank || backRank.length !== 8) {
    const e = new Error(
      "Unrecognized chess960 position shape returned by chess960.randomChess960Position() — " +
        "expected an 8-character back-rank string, a full FEN, or an object exposing one of those.",
    );
    e.status = 500;
    throw e;
  }

  const rank = backRank.toUpperCase(); // canonical 8-letter arrangement, e.g. "BBQNNRKR"

  // Black's back rank on row 8 (uppercase per FEN convention for the piece
  // letters is irrelevant to color — case carries color — so black pieces
  // are lowercase, white's are uppercase), pawns on both sides, empty ranks
  // in between, white's identical arrangement mirrored on row 1.
  return [
    rank.toLowerCase(),
    "pppppppp",
    "8",
    "8",
    "8",
    "8",
    "PPPPPPPP",
    rank,
  ].join("/");
}

// Assembles the full starting FEN, including Chess960 castling rights.
// "KQkq" (rather than file-letter/Shredder-FEN notation) works fine as long
// as chess.js is constructed with `{ chess960: true }`, which loadGame()
// below does — it resolves KQkq against the actual rook starting files for
// the given back rank.
function chess960StartFen(chess960Position) {
  const placement = buildChess960Fen(chess960Position);
  // If buildChess960Fen already returned a full FEN (the "already a FEN"
  // early-return path), use it as-is.
  if (placement.split(" ").length >= 6) return placement;
  return `${placement} w KQkq - 0 1`;
}

// ─── Core replay/validate ───────────────────────────────────────────────────
// Loads a chess.js instance at `startFen` (or standard start) and replays
// `moves` (SAN strings) in order. Throws a 400 error if any stored move
// somehow doesn't replay — that would indicate corrupted data, not a user
// mistake, since moves are validated at write-time by applyMove() below.
function loadGame(startFen, moves = []) {
  const chess = new Chess(startFen || STANDARD_START_FEN, { chess960: true });
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
  loadGame,
  applyMove,
  undoLastMove,
  deriveStatus,
  suggestedResult,
  legalMoves,
};
