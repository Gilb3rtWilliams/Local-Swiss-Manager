// routes/publish.js
// ─────────────────────────────────────────────────────────────────────────
// The desktop app's ONLY entry point into the cloud. Two endpoints:
//   POST /api/publish/tournaments             -- register/resume publishing
//   POST /api/publish/tournaments/:id/events  -- push queued outbox events
//
// This is one-way. The desktop app's local SQLite is the source of truth;
// nothing here ever writes back to it. That's what makes this safe without
// conflict resolution -- only one device ever publishes a given tournament.
//
// Idempotency: every event carries a client-generated `client_event_id`
// (uuid), so the desktop outbox can retry a dropped request freely --
// `publish_events` has a UNIQUE (tournament_id, client_event_id), so a
// resend of something already applied is a harmless no-op, not a duplicate
// move.
//
// AUTH: now wired to routes/auth-middleware.js (JWT bearer tokens, issued by
// POST /api/auth/login). requireActiveSubscription checks the database
// fresh on every call rather than trusting anything in the token, so a
// cancellation takes effect immediately -- not just when the (90-day) token
// happens to expire. Since the desktop app caches its own entitlement
// offline (see publishing/entitlement.js), this check only bites when the
// app actually reaches the server -- exactly the moment it should.

const express = require("express");
const { pool } = require("../db");
const {
  requireAuth,
  requireActiveSubscription: requireActiveSubscriptionFactory,
} = require("./auth-middleware");
const requireActiveSubscription = requireActiveSubscriptionFactory(pool);

const VALID_TYPES = new Set([
  "round_created",
  "game_registered",
  "game_move",
  "game_result",
]);
const MAX_EVENTS_PER_BATCH = 500;

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

// Looks up (or defensively creates) the published_rounds row for a round
// number. Defensive rather than requiring a prior 'round_created' event,
// since the outbox sends events in order but a partially-retried batch
// could in principle deliver a game event before its round's event lands.
async function ensureRound(client, tournamentId, roundNumber) {
  const existing = await client.query(
    `SELECT id FROM published_rounds WHERE tournament_id = $1 AND round_number = $2`,
    [tournamentId, roundNumber],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO published_rounds (tournament_id, round_number)
     VALUES ($1, $2)
     ON CONFLICT (tournament_id, round_number) DO UPDATE SET round_number = EXCLUDED.round_number
     RETURNING id`,
    [tournamentId, roundNumber],
  );
  return inserted.rows[0].id;
}

// Applies one already-inserted event to the materialized published_rounds /
// published_games tables. Runs inside the same transaction as the event
// insert, so a failure here rolls back the event too -- the outbox will
// just retry it.
async function applyEvent(client, tournamentId, event) {
  const { type, payload } = event;

  if (type === "round_created") {
    await ensureRound(client, tournamentId, payload.roundNumber);
    return;
  }

  if (type === "game_registered") {
    const roundId = await ensureRound(
      client,
      tournamentId,
      payload.roundNumber,
    );
    await client.query(
      `INSERT INTO published_games
         (tournament_id, round_id, board_number, white_name, black_name, start_fen)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, round_id, board_number) DO UPDATE SET
         white_name = EXCLUDED.white_name,
         black_name = EXCLUDED.black_name,
         start_fen  = EXCLUDED.start_fen,
         updated_at = now()`,
      [
        tournamentId,
        roundId,
        payload.boardNumber,
        payload.whiteName ?? null,
        payload.blackName ?? null,
        payload.startFen ?? null,
      ],
    );
    return;
  }

  if (type === "game_move") {
    // Mirrors exactly what chessGame.applyMove() returns locally: the
    // desktop outbox forwards { moves, lastMove, status } (and startFen,
    // the first time, in case 'game_registered' hasn't landed yet).
    const roundId = await ensureRound(
      client,
      tournamentId,
      payload.roundNumber,
    );
    await client.query(
      `INSERT INTO published_games
         (tournament_id, round_id, board_number, start_fen, moves, last_move, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       ON CONFLICT (tournament_id, round_id, board_number) DO UPDATE SET
         moves      = EXCLUDED.moves,
         last_move  = EXCLUDED.last_move,
         status     = EXCLUDED.status,
         start_fen  = COALESCE(published_games.start_fen, EXCLUDED.start_fen),
         updated_at = now()`,
      [
        tournamentId,
        roundId,
        payload.boardNumber,
        payload.startFen ?? null,
        JSON.stringify(payload.moves ?? []),
        JSON.stringify(payload.lastMove ?? null),
        JSON.stringify(payload.status ?? { kind: "in_progress" }),
      ],
    );
    return;
  }

  if (type === "game_result") {
    const roundId = await ensureRound(
      client,
      tournamentId,
      payload.roundNumber,
    );
    await client.query(
      `INSERT INTO published_games (tournament_id, round_id, board_number, result)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tournament_id, round_id, board_number) DO UPDATE SET
         result     = EXCLUDED.result,
         updated_at = now()`,
      [tournamentId, roundId, payload.boardNumber, payload.result],
    );
    return;
  }
}

function createPublishRouter(io) {
  const router = express.Router();
  router.use(express.json());
  router.use(requireAuth); // every route needs a real login...
  // ...but requireActiveSubscription is applied PER ROUTE below, not here:
  // turning publishing OFF must always work even with a lapsed subscription
  // (nobody should be locked into publicly publishing something), while
  // turning it ON (registering, or re-enabling visibility) does require one.

  // Register a tournament for publishing, or resume publishing to it (same
  // local_tournament_id from the same owner = same published tournament,
  // not a duplicate).
  router.post("/tournaments", requireActiveSubscription, async (req, res) => {
    const { localTournamentId, name, format } = req.body || {};
    if (!localTournamentId || !name) {
      return res
        .status(400)
        .json({ error: "localTournamentId and name are required." });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO published_tournaments (owner_user_id, local_tournament_id, name, format)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (owner_user_id, local_tournament_id) DO UPDATE SET
           name = EXCLUDED.name,
           format = EXCLUDED.format,
           updated_at = now()
         RETURNING id, last_event_seq`,
        [
          req.user.id,
          String(localTournamentId),
          String(name),
          format || "swiss",
        ],
      );
      res.json({
        tournamentId: rows[0].id,
        lastEventSeq: Number(rows[0].last_event_seq),
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Could not register tournament.", detail: err.message });
    }
  });

  // Push a batch of outbox events. Accepts and reports on ALL of them, even
  // if some are duplicates of already-applied events -- the outbox marks
  // anything in the response as safe to drop locally.
  router.post(
    "/tournaments/:id/events",
    requireActiveSubscription,
    async (req, res) => {
      const tournamentId = req.params.id;
      const events = req.body?.events;
      if (!isUuid(tournamentId))
        return res.status(400).json({ error: "Invalid tournament id." });
      if (!Array.isArray(events) || events.length === 0) {
        return res
          .status(400)
          .json({ error: "events must be a non-empty array." });
      }
      if (events.length > MAX_EVENTS_PER_BATCH) {
        return res
          .status(400)
          .json({
            error: `Batch too large; max ${MAX_EVENTS_PER_BATCH} events.`,
          });
      }
      for (const e of events) {
        if (
          !isUuid(e?.clientEventId) ||
          !VALID_TYPES.has(e?.type) ||
          !e?.payload ||
          !e?.occurredAt
        ) {
          return res
            .status(400)
            .json({ error: `Malformed event: ${JSON.stringify(e)}` });
        }
      }

      const client = await pool.connect();
      const accepted = []; // events actually applied this call, for broadcast
      const acknowledgedIds = []; // ALL client_event_ids the outbox may drop
      try {
        await client.query("BEGIN");

        const owned = await client.query(
          `SELECT id FROM published_tournaments WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`,
          [tournamentId, req.user.id],
        );
        if (!owned.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Tournament not found." });
        }

        for (const e of events) {
          const inserted = await client.query(
            `INSERT INTO publish_events (tournament_id, client_event_id, type, payload, occurred_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (tournament_id, client_event_id) DO NOTHING
           RETURNING id, type, payload, occurred_at`,
            [
              tournamentId,
              e.clientEventId,
              e.type,
              JSON.stringify(e.payload),
              e.occurredAt,
            ],
          );
          acknowledgedIds.push(e.clientEventId);
          if (inserted.rows[0]) {
            await applyEvent(client, tournamentId, e);
            accepted.push({
              ...inserted.rows[0],
              clientEventId: e.clientEventId,
            });
          }
        }

        let newSeq = null;
        if (accepted.length) {
          const last = await client.query(
            `UPDATE published_tournaments SET last_event_seq = $2, updated_at = now()
           WHERE id = $1 RETURNING last_event_seq`,
            [tournamentId, accepted[accepted.length - 1].id],
          );
          newSeq = Number(last.rows[0].last_event_seq);
        }

        await client.query("COMMIT");

        // Broadcast only after commit -- never emit a live update for
        // something that might still roll back.
        if (io && accepted.length) {
          const room = `tournament:${tournamentId}`;
          for (const e of accepted) {
            // e.id is bigserial -> comes back from pg as a string; cast so
            // live-socket events have the same shape as the catch-up REST
            // endpoint (tournamentsPublic.js), which viewers may fall back to.
            io.to(room).emit("event", {
              id: Number(e.id),
              type: e.type,
              payload: e.payload,
              occurredAt: e.occurred_at,
            });
          }
        }

        res.json({ acknowledgedIds, lastEventSeq: newSeq });
      } catch (err) {
        await client.query("ROLLBACK");
        res
          .status(500)
          .json({ error: "Could not apply events.", detail: err.message });
      } finally {
        client.release();
      }
    },
  );

  // The toggle's other half: turning publishing off must always work (no
  // subscription check) so nobody's stuck publicly publishing something;
  // turning it back on (visible: true) does require an active subscription,
  // same as registering in the first place.
  router.patch("/tournaments/:id/visibility", async (req, res) => {
    const tournamentId = req.params.id;
    const { visible } = req.body || {};
    if (!isUuid(tournamentId))
      return res.status(400).json({ error: "Invalid tournament id." });
    if (typeof visible !== "boolean")
      return res.status(400).json({ error: "visible must be true or false." });

    if (visible) {
      // Reuse the same subscription check as registration, applied manually
      // here rather than as router middleware (see the comment above).
      try {
        const { rows } = await pool.query(
          `SELECT subscription_status FROM users WHERE id = $1`,
          [req.user.id],
        );
        if (rows[0]?.subscription_status !== "active") {
          return res
            .status(402)
            .json({ error: "Active subscription required." });
        }
      } catch (err) {
        return res
          .status(500)
          .json({
            error: "Could not verify subscription.",
            detail: err.message,
          });
      }
    }

    try {
      const { rows } = await pool.query(
        `UPDATE published_tournaments SET visible = $3, updated_at = now()
         WHERE id = $1 AND owner_user_id = $2
         RETURNING visible`,
        [tournamentId, req.user.id, visible],
      );
      if (!rows[0])
        return res.status(404).json({ error: "Tournament not found." });

      // Tell any viewers currently connected right away, rather than
      // leaving them watching a page that just quietly stops updating.
      if (io) {
        io.to(`tournament:${tournamentId}`).emit("visibility", { visible });
      }
      res.json({ visible: rows[0].visible });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Could not update visibility.", detail: err.message });
    }
  });

  return router;
}

module.exports = { createPublishRouter, applyEvent, ensureRound }; // last two exported for tests
