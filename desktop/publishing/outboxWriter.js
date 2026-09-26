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

// Turns publishing ON for a tournament. Idempotent, and safely
// re-enables a tournament that was previously turned off — the row
// persists forever once created (see local-schema.sql's comment on
// publish_state), so this must UPDATE on conflict, not no-op, or a
// publish -> unpublish -> publish cycle would get stuck off.
function enablePublishing(db, tournamentId) {
  db.prepare(
    `INSERT INTO publish_state (tournament_id, enabled) VALUES (?, 1)
     ON CONFLICT (tournament_id) DO UPDATE SET enabled = 1`,
  ).run(tournamentId);
}

async function pushTournamentSnapshot(
  db,
  tournamentId,
  { apiBaseUrl, getAuthToken, fetchImpl = fetch },
) {
  const row = db
    .prepare(`SELECT data FROM tournaments WHERE id = ?`)
    .get(tournamentId);
  if (!row) return;
  const token = await getAuthToken();
  if (!token) return;
  await fetchImpl(`${apiBaseUrl}/api/publish/tournaments/${tournamentId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: row.data }),
  });
}

// Turns publishing OFF. Also idempotent — calling it on a tournament with
// no publish_state row yet (never published) just creates one already-off,
// which is harmless and keeps this safe to call unconditionally.
function disablePublishing(db, tournamentId) {
  db.prepare(
    `INSERT INTO publish_state (tournament_id, enabled) VALUES (?, 0)
     ON CONFLICT (tournament_id) DO UPDATE SET enabled = 0`,
  ).run(tournamentId);
}

module.exports = {
  isPublishing,
  enqueueRoundCreated,
  enqueueGameRegistered,
  enqueueGameMove,
  enqueueGameResult,
  enablePublishing,
  pushTournamentSnapshot,
  disablePublishing,
};
