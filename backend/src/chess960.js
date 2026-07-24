// ─── Chess960 (Fischer Random) starting-position generator ─────────────────
// Implements the standard Chess960 numbering scheme (0-959): a bijection
// between an integer ID and one of the 960 legal starting arrangements
// (bishops on opposite-colored squares, king strictly between the rooks).
// This is the same scheme used by python-chess, lichess, etc. — ID 518
// happens to decode to the ordinary chess starting position, which is a
// handy sanity check that the implementation is right, not just plausible.
//
// A back rank is represented as an 8-element array, index 0 = a-file
// through index 7 = h-file, e.g. ["R","N","B","Q","K","B","N","R"].

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const LIGHT_SQUARE_FILE_INDICES = [1, 3, 5, 7]; // b, d, f, h — light squares on rank 1
const DARK_SQUARE_FILE_INDICES = [0, 2, 4, 6]; // a, c, e, g — dark squares on rank 1

// The 10 ways to choose 2 of 5 remaining empty squares for the knights,
// enumerated in the fixed order the numbering scheme requires. Both indices
// refer to the same snapshot of "which squares were empty right after the
// queen was placed" — they are NOT re-counted between placing the first
// knight and the second.
const KNIGHT_PLACEMENTS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

function placeInNthEmpty(files, n, piece) {
  let count = 0;
  for (let i = 0; i < files.length; i++) {
    if (files[i] === null) {
      if (count === n) {
        files[i] = piece;
        return i;
      }
      count++;
    }
  }
  throw new Error(`placeInNthEmpty: fewer than ${n + 1} empty squares left`);
}

// Decodes a Chess960 ID (0-959) into an 8-element back-rank array.
function decodeChess960(id) {
  if (!Number.isInteger(id) || id < 0 || id > 959) {
    const e = new Error(`Chess960 id must be an integer 0-959, got ${id}`);
    e.status = 400;
    throw e;
  }

  const files = new Array(8).fill(null);

  // Light-squared bishop.
  const n1 = id % 4;
  const n2 = Math.floor(id / 4);
  files[LIGHT_SQUARE_FILE_INDICES[n1]] = "B";

  // Dark-squared bishop.
  const n3 = n2 % 4;
  const n4 = Math.floor(n2 / 4);
  files[DARK_SQUARE_FILE_INDICES[n3]] = "B";

  // Queen, into the n5-th empty square (0-indexed, left to right) of the 6
  // remaining after both bishops are placed.
  const n5 = n4 % 6;
  const n6 = Math.floor(n4 / 6); // 0-9, indexes KNIGHT_PLACEMENTS
  placeInNthEmpty(files, n5, "Q");

  // Knights — both indices below refer to the 5-square snapshot taken right
  // after the queen was placed.
  const emptyAfterQueen = [];
  files.forEach((f, i) => {
    if (f === null) emptyAfterQueen.push(i);
  });
  const [k1, k2] = KNIGHT_PLACEMENTS[n6];
  files[emptyAfterQueen[k1]] = "N";
  files[emptyAfterQueen[k2]] = "N";

  // Whatever 3 squares are left, filled left-to-right as Rook-King-Rook —
  // this is what guarantees "king strictly between the rooks" for free,
  // regardless of which 3 squares happen to remain.
  const remaining = [];
  files.forEach((f, i) => {
    if (f === null) remaining.push(i);
  });
  files[remaining[0]] = "R";
  files[remaining[1]] = "K";
  files[remaining[2]] = "R";

  return files;
}

// Shredder-FEN style castling rights (file letters, not KQkq) — the correct
// convention for Chess960 since the rooks aren't necessarily on the
// standard corners. Both colors share the same back-rank arrangement, so
// the rook files are identical for White and Black.
function toFen(backRank) {
  const rookFiles = backRank
    .map((piece, i) => (piece === "R" ? FILES[i] : null))
    .filter(Boolean);
  const [queenSideRookFile, kingSideRookFile] = rookFiles;

  const whiteRank = backRank.join("");
  const blackRank = whiteRank.toLowerCase();
  const castling =
    kingSideRookFile.toUpperCase() +
    queenSideRookFile.toUpperCase() +
    kingSideRookFile +
    queenSideRookFile;

  return `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
}

function positionFromId(id) {
  const backRank = decodeChess960(id);
  return { id, backRank, fen: toFen(backRank) };
}

// excludeIds is optional (defaults to none) so the existing zero-argument
// call site in tournamentService.js keeps working unchanged; it's there so
// a future round could avoid repeating a position already used this event
// without needing a different function signature.
function randomChess960Position(excludeIds = []) {
  const excluded = new Set(excludeIds);
  if (excluded.size >= 960) {
    // Every position has been excluded (shouldn't happen in practice) —
    // fall back to fully random rather than looping forever.
    return positionFromId(Math.floor(Math.random() * 960));
  }
  let id;
  do {
    id = Math.floor(Math.random() * 960);
  } while (excluded.has(id));
  return positionFromId(id);
}

module.exports = {
  decodeChess960,
  positionFromId,
  randomChess960Position,
};
