// routes/tournamentsPublic.js
// ─────────────────────────────────────────────────────────────────────────
// Read-only, unauthenticated endpoints for anyone following a published
// tournament. No writes happen here -- publish.js is the only writer.
//
//   GET /api/tournaments                    list published tournaments
//   GET /api/tournaments/:id                current snapshot (rounds+games)
//   GET /api/tournaments/:id/events?since=  catch-up feed for a viewer whose
//                                            WebSocket connection dropped
//                                            (mirrors the live 'event'
//                                            payloads the socket emits, so
//                                            the viewer's merge logic is
//                                            identical either way)

const express = require("express");
const { pool } = require("../db");

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

const router = express.Router();

router.get("/tournaments", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id, name, format, status, created_at, updated_at
     FROM published_tournaments
     WHERE visible = true
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  res.json({ tournaments: rows });
});

router.get("/tournaments/:id", async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ error: "Invalid tournament id." });

  const tRes = await pool.query(
    `SELECT id, name, format, status, last_event_seq, visible, created_at, updated_at
     FROM published_tournaments WHERE id = $1`,
    [id],
  );
  // Treat hidden exactly like nonexistent -- a 404 here reveals nothing
  // about whether the tournament ever existed, was unpublished, or the id
  // is just wrong. That's the point of a "hide" toggle: real privacy, not
  // just "stop updating it".
  if (!tRes.rows[0] || !tRes.rows[0].visible) {
    return res.status(404).json({ error: "Tournament not found." });
  }

  const gRes = await pool.query(
    `SELECT r.round_number, g.board_number, g.white_name, g.black_name,
            g.start_fen, g.moves, g.last_move, g.status, g.result
     FROM published_games g
     JOIN published_rounds r ON r.id = g.round_id
     WHERE g.tournament_id = $1
     ORDER BY r.round_number, g.board_number`,
    [id],
  );

  const rounds = {};
  for (const row of gRes.rows) {
    (rounds[row.round_number] ||= []).push({
      boardNumber: row.board_number,
      whiteName: row.white_name,
      blackName: row.black_name,
      startFen: row.start_fen,
      moves: row.moves,
      lastMove: row.last_move,
      status: row.status,
      result: row.result,
    });
  }

  res.json({
    tournament: {
      id: tRes.rows[0].id,
      name: tRes.rows[0].name,
      format: tRes.rows[0].format,
      status: tRes.rows[0].status,
      lastEventSeq: Number(tRes.rows[0].last_event_seq),
    },
    rounds: Object.entries(rounds)
      .map(([roundNumber, games]) => ({
        roundNumber: Number(roundNumber),
        games,
      }))
      .sort((a, b) => a.roundNumber - b.roundNumber),
  });
});

router.get("/tournaments/:id/events", async (req, res) => {
  const { id } = req.params;
  const since = Number(req.query.since) || 0;
  const limit = Math.min(Number(req.query.limit) || 500, 500);
  if (!isUuid(id))
    return res.status(400).json({ error: "Invalid tournament id." });

  // Same treatment as the snapshot endpoint: hidden looks exactly like
  // nonexistent, so a dropped-and-reconnecting viewer can't keep pulling
  // events for something that's since been unpublished.
  const visRes = await pool.query(
    `SELECT visible FROM published_tournaments WHERE id = $1`,
    [id],
  );
  if (!visRes.rows[0] || !visRes.rows[0].visible) {
    return res.status(404).json({ error: "Tournament not found." });
  }

  const { rows } = await pool.query(
    `SELECT id, type, payload, occurred_at
     FROM publish_events
     WHERE tournament_id = $1 AND id > $2
     ORDER BY id
     LIMIT $3`,
    [id, since, limit],
  );
  // `id` is bigserial; node-postgres returns bigint columns as strings (to
  // avoid silent precision loss above 2^53), so cast explicitly here rather
  // than leaking a string where every caller expects a number.
  const events = rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    payload: r.payload,
    occurredAt: r.occurred_at,
  }));
  res.json({
    events,
    nextSince: events.length ? events[events.length - 1].id : since,
  });
});

module.exports = { router };
