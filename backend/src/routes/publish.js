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
const svc = require("../tournamentService");
const { pool } = require("../db"); // still needed for auth-middleware's subscription check
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
  router.use(express.json({ limit: "10mb" }));
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

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        return res
          .status(400)
          .json({ error: "data is not valid JSON.", detail: err.message });
      }

      try {
        await svc.adoptPublishedTournament(id, parsed, "desktop");
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
