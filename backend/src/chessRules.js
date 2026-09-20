// chessRules.js  (client)
// ─────────────────────────────────────────────────────────────────────────
// The ONLY client file that imports the chess-rules library. It wraps
// `chessops` (niklasf/chessops, the rules library behind lichess) and exposes
// just what MoveEntryBoard needs, in the same plain shapes the component
// already used with chess.js ({ type: "p", color: "w" } pieces, algebraic
// square strings). Mirrors the backend's chessGame.js — kept as a separate
// copy per this app's usual convention of not sharing code across the
// client/server boundary — so both sides apply identical rules.
//
// WHY chessops: chess.js has no Chess960 support, so castling from a
// Chess960 start was resolved with standard rules and produced wrong
// positions. chessops implements real Chess960 castling: the king and rook
// land on g/f (or c/d) wherever they started, and the native way to enter it
// is "king takes own rook".
//
// PINNED VERSION: install exactly `chessops@0.14.0` (`--save-exact`) in the
// frontend too, so client and server run the same rules engine.

import { Chess } from "chessops/chess";
import { parseFen, makeFen } from "chessops/fen";
import { parseSan, makeSanAndPlay } from "chessops/san";
import {
  parseSquare,
  makeSquare,
  squareRank,
  kingCastlesTo,
  roleToChar,
} from "chessops/util";

export const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PROMOTION_ROLES = ["queen", "rook", "bishop", "knight"];

// Parses a start FEN into a chessops position. Returns null (instead of
// throwing) for an unparseable/illegal FEN so the board can show a message
// rather than crash the whole page. chessops reads both KQkq and Shredder-FEN
// ("HAha") castling fields, so games stored with either load fine.
export function startPosition(startFen) {
  const setup = parseFen(startFen || STANDARD_START_FEN);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  return pos.isErr ? null : pos.value;
}

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

// chessops encodes castling as king→own rook; for highlighting we want the
// square the king really lands on.
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

// Replays SAN moves from startFen, stopping at the first one that doesn't
// parse (server data is the source of truth, so that "can't happen").
// Returns { pos, lastMove } — pos is null if the start position is invalid.
// `upTo` limits how many moves are replayed (for browsing history).
export function replay(startFen, sans, upTo = (sans || []).length) {
  const pos = startPosition(startFen);
  if (!pos) return { pos: null, lastMove: null };
  let lastMove = null;
  const list = sans || [];
  for (let i = 0; i < upTo && i < list.length; i++) {
    const move = parseSan(pos, String(list[i]).replace(/0/g, "O"));
    if (!move) break;
    lastMove = displaySquares(pos, move);
    makeSanAndPlay(pos, move);
  }
  return { pos, lastMove };
}

export function turnOf(pos) {
  return pos.turn === "white" ? "w" : "b";
}

function toPiece(p) {
  return p
    ? { type: roleToChar(p.role), color: p.color === "white" ? "w" : "b" }
    : null;
}

// { type: "p"|"n"|"b"|"r"|"q"|"k", color: "w"|"b" } | null
export function pieceAt(pos, square) {
  const sq = parseSquare(square);
  return sq === undefined ? null : toPiece(pos.board.get(sq));
}

// 8x8 grid, [0][0] = a8 … [7][7] = h1 (same layout chess.js's board() had).
export function boardGrid(pos) {
  const grid = [];
  for (let rank = 7; rank >= 0; rank--) {
    const row = [];
    for (let file = 0; file < 8; file++) {
      row.push(toPiece(pos.board.get(rank * 8 + file)));
    }
    grid.push(row);
  }
  return grid;
}

// Legal moves for the piece on `square`, keyed by the square the user may
// CLICK to play them:  { [targetSquare]: candidate[] }  where a candidate is
//   { from, to, promotion?, castle? }   (algebraic squares; promotion "q".."n")
// Pawn promotions give four candidates for one target (the board asks which
// piece). Castling is offered on TWO squares, both mapping to the same
// candidate (`to` = the rook's square, chessops' native and unambiguous form,
// which is also what the backend accepts):
//   • the rook's own square  — always works, even when the king is already on
//     its landing square (common in Chess960)
//   • the king's landing square (g/c file) — a convenience, only offered when
//     that square isn't already a normal king move, so a one-square king step
//     is never mistaken for castling.
export function legalTargets(pos, square) {
  const from = parseSquare(square);
  if (from === undefined) return {};
  const piece = pos.board.get(from);
  if (!piece || piece.color !== pos.turn) return {};

  const map = {};
  const add = (key, cand) => (map[key] || (map[key] = [])).push(cand);
  const castles = [];

  for (const to of pos.dests(from)) {
    const move = { from, to };
    if (isCastle(pos, move)) {
      castles.push(move);
      add(makeSquare(to), {
        from: square,
        to: makeSquare(to),
        castle: true,
      });
      continue;
    }
    const rank = squareRank(to);
    if (piece.role === "pawn" && (rank === 0 || rank === 7)) {
      for (const role of PROMOTION_ROLES) {
        add(makeSquare(to), {
          from: square,
          to: makeSquare(to),
          promotion: roleToChar(role),
        });
      }
    } else {
      add(makeSquare(to), { from: square, to: makeSquare(to) });
    }
  }

  for (const move of castles) {
    const side = move.to > move.from ? "h" : "a";
    const landing = makeSquare(kingCastlesTo(pos.turn, side));
    if (landing !== square && !map[landing]) {
      add(landing, { from: square, to: makeSquare(move.to), castle: true });
    }
  }
  return map;
}

// ─── PGN ────────────────────────────────────────────────────────────────────
// Standalone PGN from the same startFen/moves the board replays. A non-default
// start gets [Variant "Chess960"] + [SetUp]/[FEN] (X-FEN/Shredder castling,
// the convention Chess960 tools expect). `headers` is an ordered list of
// [name, value]; `result` is the PGN result token ("1-0", "0-1", "1/2-1/2", "*").
export function makePgn({ startFen, moves, headers = [], result = "*" }) {
  const start = startPosition(startFen);
  if (!start) throw new Error("Invalid starting position — cannot build PGN.");

  const all = [...headers];
  if (startFen) {
    all.push(["Variant", "Chess960"], ["SetUp", "1"]);
    all.push(["FEN", makeFen(start.toSetup())]);
  }
  all.push(["Result", result]);

  let number = start.fullmoves;
  let whiteToMove = start.turn === "white";
  const tokens = [];
  (moves || []).forEach((san, i) => {
    if (whiteToMove) tokens.push(`${number}.`);
    else if (i === 0) tokens.push(`${number}...`);
    tokens.push(san);
    if (!whiteToMove) number++;
    whiteToMove = !whiteToMove;
  });
  tokens.push(result);

  const head = all.map(([k, v]) => `[${k} "${v}"]`).join("\n");
  return `${head}\n\n${tokens.join(" ")}\n`;
}

export { FILES };
