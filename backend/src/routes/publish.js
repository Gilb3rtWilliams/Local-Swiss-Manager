// routes/publish.js
// ─────────────────────────────────────────────────────────────────────────
// A published tournament IS a real tournament — this endpoint upserts the
// desktop app's local blob directly into the cloud's own `tournaments`
// table, tagged source = 'desktop'. No event log, no separate schema: the
// same Overview.jsx/Pairings.jsx/Standings.jsx that render a website-created
// tournament render this one too, because it's not a different kind of
// tournament, just one with a tag on it.
//
// The tournament's own id (a real UUID, generated locally by
// tournamentService.js) is reused as-is for the cloud row. Republishing the
// same tournament is a plain upsert on that id — no mapping table needed.

const express = require("express");
const { pool } = require("../db");
const {
  requireAuth,
  requireActiveSubscription: requireActiveSubscriptionFactory,
} = require("./auth-middleware");
const requireActiveSubscription = requireActiveSubscriptionFactory(pool);

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

function createPublishRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "10mb" })); // a big multi-round tournament's blob can get sizable
  router.use(requireAuth);

  router.put(
    "/tournaments/:id",
    requireActiveSubscription,
    async (req, res) => {
      const { id } = req.params;
      const { data } = req.body || {};

      if (!isUuid(id)) {
        return res.status(400).json({ error: "Invalid tournament id." });
      }
      if (typeof data !== "string" || !data.trim()) {
        return res
          .status(400)
          .json({ error: "data (serialized tournament JSON) is required." });
      }
      // Sanity-check before writing — a malformed blob now breaks every
      // future read of this tournament, on the website and any later
      // republish.
      try {
        JSON.parse(data);
      } catch (err) {
        return res
          .status(400)
          .json({ error: "data is not valid JSON.", detail: err.message });
      }

      try {
        await pool.query(
          `INSERT INTO tournaments (id, data, source, updated_at)
           VALUES ($1, $2, 'desktop', now())
           ON CONFLICT (id) DO UPDATE SET
             data = EXCLUDED.data,
             source = 'desktop',
             updated_at = now()`,
          [id, data],
        );
        res.json({ tournamentId: id });
      } catch (err) {
        res
          .status(500)
          .json({
            error: "Could not publish tournament.",
            detail: err.message,
          });
      }
    },
  );

  return router;
}

module.exports = { createPublishRouter };
