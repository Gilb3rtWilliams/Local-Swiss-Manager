// routes/publish.js
// ─────────────────────────────────────────────────────────────────────────
// A published tournament IS a real tournament — this endpoint upserts the
// desktop app's local blob directly into the cloud's own `tournaments`
// table, tagged source = 'desktop'. The same Overview.jsx/Pairings.jsx/
// Standings.jsx that render a website-created tournament render this one
// too.
//
// The tournament's own id (a real UUID, generated locally) is reused as-is
// for the cloud row. Republishing is a plain upsert on that id.
//
//   PUT  /api/publish/tournaments/:id            upload / re-upload the blob
//   POST /api/publish/tournaments/:id/unpublish  hide it from the website
//
// The desktop app re-uploads automatically whenever the tournament changes
// (see publishing/publishSync.js), so PUT replies with enough for it to
// CONFIRM the upload landed intact: a hash of the exact bytes received, and
// the spectator token to verify against the public results endpoint.

const crypto = require("crypto");
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

// Same convention as store.js/storeSqlite.js: competitor.opponents is
// serialized as { __set: true, values: [...] } and must come back as a
// real Set, or every pairing/standings routine that calls .forEach/.has
// on it breaks immediately.
function reviver(key, value) {
  if (value && typeof value === "object" && value.__set) {
    return new Set(value.values);
  }
  return value;
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Exported separately from the router so they can be exercised without
// Express.
async function putTournament(req, res) {
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
    parsed = JSON.parse(data, reviver);
  } catch (err) {
    return res
      .status(400)
      .json({ error: "data is not valid JSON.", detail: err.message });
  }

  try {
    const t = await svc.adoptPublishedTournament(id, parsed, "desktop");
    res.json({
      tournamentId: id,
      publicViewToken: t.publicViewToken,
      receivedHash: sha256(data),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: "Could not publish tournament.",
      detail: err.message,
    });
  }
}

async function unpublishTournament(req, res) {
  const { id } = req.params;
  if (!isUuid(id)) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }
  try {
    await svc.unpublishTournament(id);
    res.json({ tournamentId: id, unpublished: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

function createPublishRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "10mb" }));
  router.use(requireAuth);

  router.put("/tournaments/:id", requireActiveSubscription, putTournament);

  // Deliberately NOT gated on the subscription: a lapsed subscription
  // shouldn't leave someone unable to take their own tournament down.
  router.post("/tournaments/:id/unpublish", unpublishTournament);

  return router;
}

module.exports = { createPublishRouter, putTournament, unpublishTournament };
