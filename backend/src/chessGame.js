// chessGame.js
// ─────────────────────────────────────────────────────────────────────────
// Thin wrapper around the `chessops` npm package (niklasf/chessops — the
// rules library behind lichess). Everything else in the app (cageMatch.js,
// matchPlay.js, ...) treats a "game" as plain data:
//   { startFen, moves: [...SAN], fen, pgn, status }
// This module is the ONLY backend file that touches the chess library, so if
// it ever has to change again, this is the one file to edit.
//
// WHY chessops (and not chess.js): chess.js has no Chess960 support — its
// `{ chess960: true }` option doesn't exist, so castling from a Chess960
// start was resolved with standard-chess rules (king moves two squares) and
// produced wrong positions. chessops implements real Chess960 castling: the
// king and rook end up on the g/f (or c/d) files regardless of where they
// started, and castling is entered as "king takes own rook".
//
// PINNED VERSION: install exactly `chessops@0.14.0` (`--save-exact`).
// chessops 0.14.1 and later ship a CommonJS build that Node refuses to load
// via require() ("exports is not defined in ES module scope"); 0.14.0 is the
// last release whose CJS build works with this CommonJS backend. Upgrading
// later is fine once the backend is ESM (or the upstream packaging is fixed).
//
// Design choice (unchanged): we don't keep a live position in memory per
// game. Every operation replays the stored SAN move list from startFen,
// applies/validates the new move, and returns fresh derived state
// (fen/pgn/status) for the caller to store back on the game object. The
// stored game object stays the single source of truth.

const { Chess } = require("chessops/chess");
const { parseFen, makeFen } = require("chessops/fen");
const { parseSan, makeSanAndPlay, makeSan } = require("chessops/san");
const {
  parseSquare,
  makeSquare,
  squareRank,
  kingCastlesTo,
  charToRole,
  roleToChar,
} = require("chessops/util");

// Standard starting position, returned explicitly so callers can always
// assume a real FEN string, never null/undefined.
const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ─── Chess960 starting position ────────────────────────────────────────────
// chess960.js's randomChess960Position()/positionFromId() return
//   { id, backRank: ["R","N","B","Q","K","B","N","R"], fen }
// We always rebuild the FEN from the back rank rather than trusting `.fen`.
// KQkq castling is unambiguous at a Chess960 *start* (exactly one rook on
// each side of the king), and chessops resolves it against the real rook
// files. (chessops also parses Shredder-FEN like "HAha" natively, so games
// stored with chess960.js's own `.fen` still load.)
//
// Accepted input shapes: the { id, backRank, fen } object above (backRank as
// an array OR an 8-letter string), a bare 8-letter back-rank string, or a
// full FEN string (fallback only).
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
    return fen.trim().split(/\s+/).length === 1
      ? `${fen.trim()} w KQkq - 0 1`
      : fen.trim();
  }

  throw httpError(
    500,
    "Unrecognized chess960 position shape — expected { backRank } (array or " +
      "8-letter string), a bare 8-letter back rank, or a full FEN.",
  );
}

// ─── Position helpers ───────────────────────────────────────────────────────
function positionFromFen(fen) {
  const setup = parseFen(fen);
  if (setup.isErr) {
    throw httpError(500, `Invalid start FEN "${fen}": ${setup.error.message}`);
  }
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) {
    throw httpError(
      500,
      `Illegal start position "${fen}": ${pos.error.message}`,
    );
  }
  return pos.value;
}

// Repetition key: piece placement + side to move + castling + en passant
// (chessops only reports an en-passant square when a capture is actually
// possible, which is exactly what the repetition rule needs).
function positionKey(pos) {
  return makeFen(pos.toSetup()).split(" ").slice(0, 4).join(" ");
}

function bump(keys, key) {
  keys.set(key, (keys.get(key) || 0) + 1);
}

// chessops writes castling as "king takes own rook" (from = king square,
// to = rook square). For display we want the king's real landing square.
function isCastle(pos, move) {
  const mover = pos.board.get(move.from);
  const target = pos.board.get(move.to);
  return !!(
    mover &&
    mover.role === "king" &&
    target &&
    target.color === mover.color
  );
}

function displaySquares(pos, move) {
  if (isCastle(pos, move)) {
    const side = move.to > move.from ? "h" : "a";
    return {
      from: makeSquare(move.from),
      to: makeSquare(kingCastlesTo(pos.turn, side)),
    };
  }
  return { from: makeSquare(move.from), to: makeSquare(move.to) };
}

// ─── Core replay/validate ───────────────────────────────────────────────────
// Replays `moves` (SAN strings) from `startFen` (or the standard start).
// Returns { pos, keys, lastMove } where `pos` is the chessops position after
// the last move, `keys` counts how often each position has occurred (for the
// threefold-repetition check), and `lastMove` is { from, to, san } | null.
// Throws a 500 error if any stored move doesn't replay — that would indicate
// corrupted data, not a user mistake, since moves are validated at
// write-time by applyMove() below.
function loadGame(startFen, moves = []) {
  const pos = positionFromFen(startFen || STANDARD_START_FEN);
  const keys = new Map();
  bump(keys, positionKey(pos));
  let lastMove = null;

  for (const san of moves) {
    const move = parseSan(pos, String(san).replace(/0/g, "O"));
    if (!move) {
      throw httpError(
        500,
        `Stored move "${san}" is not legal from the preceding position — game history may be corrupted.`,
      );
    }
    const sq = displaySquares(pos, move);
    const canonical = makeSanAndPlay(pos, move);
    lastMove = { ...sq, san: canonical };
    bump(keys, positionKey(pos));
  }
  return { pos, keys, lastMove };
}

// Turns a move input into a chessops move, or null if it's not legal.
// `moveInput` can be:
//   - a SAN string ("Nf3", "O-O", "e4", "exd8=Q")
//   - { from, to, promotion? } with algebraic squares. For castling, `to`
//     may be EITHER the rook's square (chessops' native form, and the only
//     unambiguous one in Chess960) OR the square the king will land on
//     (g1/c1/g8/c8) — the latter only when that isn't itself a legal plain
//     king move, so a one-square king step is never mistaken for a castle.
function resolveMove(pos, moveInput) {
  if (typeof moveInput === "string") {
    return parseSan(pos, moveInput.trim().replace(/0/g, "O")) || null;
  }
  if (!moveInput || typeof moveInput !== "object") return null;

  const from = parseSquare(moveInput.from);
  const to = parseSquare(moveInput.to);
  if (from === undefined || to === undefined) return null;

  const promotion = moveInput.promotion
    ? charToRole(String(moveInput.promotion).toLowerCase())
    : undefined;
  const direct = promotion ? { from, to, promotion } : { from, to };
  if (pos.isLegal(direct)) return direct;

  const piece = pos.board.get(from);
  if (piece && piece.role === "king" && piece.color === pos.turn) {
    for (const side of ["a", "h"]) {
      const rook = pos.castles.rook[pos.turn][side];
      if (rook !== undefined && kingCastlesTo(pos.turn, side) === to) {
        const castle = { from, to: rook };
        if (pos.isLegal(castle)) return castle;
      }
    }
  }
  return null;
}

// ─── PGN ────────────────────────────────────────────────────────────────────
// Movetext with correct numbering (also handles a start FEN with Black to
// move), preceded by SetUp/FEN/Variant headers for a non-default start.
function makePgn(startFen, moves) {
  const start = positionFromFen(startFen || STANDARD_START_FEN);
  const headers = [];
  if (startFen) {
    headers.push(
      '[Variant "Chess960"]',
      '[SetUp "1"]',
      `[FEN "${makeFen(start.toSetup())}"]`,
    );
  }

  let number = start.fullmoves;
  let whiteToMove = start.turn === "white";
  const tokens = [];
  moves.forEach((san, i) => {
    if (whiteToMove) tokens.push(`${number}.`);
    else if (i === 0) tokens.push(`${number}...`);
    tokens.push(san);
    if (!whiteToMove) number++;
    whiteToMove = !whiteToMove;
  });

  return headers.length
    ? `${headers.join("\n")}\n\n${tokens.join(" ")}`
    : tokens.join(" ");
}

// Validates and applies a single new move on top of the game's existing
// move list, returning the new derived state to store back on the game:
//   { moves, fen, pgn, status, lastMove }
// Throws a 400 error (illegal move) rather than mutating anything if the
// move doesn't apply.
function applyMove(game, moveInput) {
  const state = loadGame(game.startFen, game.moves);
  const { pos, keys } = state;

  const move = resolveMove(pos, moveInput);
  if (!move) {
    throw httpError(
      400,
      `"${
        typeof moveInput === "string" ? moveInput : JSON.stringify(moveInput)
      }" is not a legal move in the current position.`,
    );
  }

  const sq = displaySquares(pos, move);
  const san = makeSanAndPlay(pos, move);
  bump(keys, positionKey(pos));
  const moves = [...game.moves, san];

  return {
    moves,
    fen: makeFen(pos.toSetup()),
    pgn: makePgn(game.startFen, moves),
    lastMove: { ...sq, san },
    status: deriveStatus({ pos, keys }),
  };
}

// Removes the most recently recorded move (arbiter correcting a mis-entry).
// Returns the same shape as applyMove(). Throws if there's nothing to undo.
function undoLastMove(game) {
  if (!game.moves.length) {
    throw httpError(400, "No moves recorded yet for this game.");
  }
  const newMoves = game.moves.slice(0, -1);
  const state = loadGame(game.startFen, newMoves);
  return {
    moves: newMoves,
    fen: makeFen(state.pos.toSetup()),
    pgn: makePgn(game.startFen, newMoves),
    lastMove: state.lastMove,
    status: deriveStatus(state),
  };
}

// Board-driven status — distinct from the *match* result code (1-0, 0-1,
// 1/2-1/2, forfeits) that the arbiter records separately. This is purely
// "what does the position on the board say right now", surfaced so the
// recording UI can suggest a result without forcing it.
// Accepts what loadGame() returns ({ pos, keys }); a bare chessops position
// also works, but then threefold repetition can't be detected.
function deriveStatus(state) {
  const pos = state.pos || state;
  const keys = state.keys || null;

  if (pos.isCheckmate()) {
    return {
      kind: "checkmate",
      winnerSide: pos.turn === "white" ? "black" : "white",
    };
  }
  if (pos.isStalemate()) return { kind: "stalemate" };
  if (keys && (keys.get(positionKey(pos)) || 0) >= 3) {
    return { kind: "threefold_repetition" };
  }
  if (pos.isInsufficientMaterial()) return { kind: "insufficient_material" };
  if (pos.halfmoves >= 100) return { kind: "draw_rule" }; // 50-move rule
  if (pos.isCheck()) return { kind: "check" };
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

// Legal moves from the current position, in a chess.js-verbose-like shape:
//   { color: "w"|"b", piece: "p"|"n"|..., from, to, san, promotion?, castle? }
// For a castle, `to` is the square the KING lands on and `castle` is "k" or
// "q"; because a king already standing on its landing square would have
// from === to, use `san` ("O-O"/"O-O-O") as the reliable handle for castles.
function legalMoves(game) {
  const { pos } = loadGame(game.startFen, game.moves);
  const out = [];
  for (const [from, dests] of pos.allDests()) {
    const piece = pos.board.get(from);
    for (const to of dests) {
      const isPawnPromo =
        piece.role === "pawn" && (squareRank(to) === 0 || squareRank(to) === 7);
      const variants = isPawnPromo
        ? ["queen", "rook", "bishop", "knight"].map((promotion) => ({
            from,
            to,
            promotion,
          }))
        : [{ from, to }];
      for (const move of variants) {
        const castle = isCastle(pos, move);
        const sq = displaySquares(pos, move);
        const entry = {
          color: pos.turn === "white" ? "w" : "b",
          piece: roleToChar(piece.role),
          from: sq.from,
          to: sq.to,
          san: makeSan(pos, move),
        };
        if (move.promotion) entry.promotion = roleToChar(move.promotion);
        if (castle) entry.castle = move.to > move.from ? "k" : "q";
        out.push(entry);
      }
    }
  }
  return out;
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
