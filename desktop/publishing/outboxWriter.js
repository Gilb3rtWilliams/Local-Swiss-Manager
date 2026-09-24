// publishing/outboxWriter.js
// ─────────────────────────────────────────────────────────────────────────
// Call these from the SAME code path that records a local change (right
// next to your existing round-creation / applyMove / result-recording
// calls). Each function is a no-op if the tournament hasn't been opted into
// publishing (no publish_state row) -- so wiring these in everywhere is
// always safe, whether or not the arbiter has turned publishing on.
//
// Every enqueue is one INSERT with a fresh client_event_id. That id is what
// makes a later retry safe (see outboxWorker.js / the server's UNIQUE
// constraint) -- so it's generated exactly once, here, and never regenerated
// on resend.

const crypto = require("crypto");

function isPublishing(db, tournamentId) {
  return !!db
    .prepare(`SELECT 1 FROM publish_state WHERE tournament_id = ?`)
    .get(tournamentId);
}

function enqueue(db, tournamentId, type, payload) {
  if (!isPublishing(db, tournamentId)) return null;
  const clientEventId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO outbox (tournament_id, client_event_id, type, payload, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    tournamentId,
    clientEventId,
    type,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
  return clientEventId;
}

function enqueueRoundCreated(db, tournamentId, { roundNumber }) {
  return enqueue(db, tournamentId, "round_created", { roundNumber });
}

function enqueueGameRegistered(
  db,
  tournamentId,
  { roundNumber, boardNumber, whiteName, blackName, startFen },
) {
  return enqueue(db, tournamentId, "game_registered", {
    roundNumber,
    boardNumber,
    whiteName: whiteName ?? null,
    blackName: blackName ?? null,
    startFen: startFen ?? null,
  });
}

// `applyMoveResult` is exactly what chessGame.applyMove() returns:
// { moves, lastMove, status, fen, pgn } -- call this right after applying a
// move locally, passing that same object straight through.
function enqueueGameMove(
  db,
  tournamentId,
  { roundNumber, boardNumber, startFen },
  applyMoveResult,
) {
  return enqueue(db, tournamentId, "game_move", {
    roundNumber,
    boardNumber,
    startFen: startFen ?? null, // included so the server can materialize the
    // game even if 'game_registered' hasn't landed yet
    moves: applyMoveResult.moves,
    lastMove: applyMoveResult.lastMove,
    status: applyMoveResult.status,
  });
}

function enqueueGameResult(
  db,
  tournamentId,
  { roundNumber, boardNumber, result },
) {
  return enqueue(db, tournamentId, "game_result", {
    roundNumber,
    boardNumber,
    result,
  });
}

// Turns publishing ON for a tournament. Idempotent -- calling it again on an
// already-publishing tournament is a no-op, not an error, since an arbiter
// might click "publish" twice by accident.
function enablePublishing(db, tournamentId) {
  db.prepare(
    `INSERT INTO publish_state (tournament_id) VALUES (?)
     ON CONFLICT (tournament_id) DO NOTHING`,
  ).run(tournamentId);
}

module.exports = {
  isPublishing,
  enqueueRoundCreated,
  enqueueGameRegistered,
  enqueueGameMove,
  enqueueGameResult,
  enablePublishing,
};
