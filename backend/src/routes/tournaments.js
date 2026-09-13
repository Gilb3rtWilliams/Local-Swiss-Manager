const express = require("express");
const svc = require("../tournamentService");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

function wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      res.json(result);
    } catch (err) {
      res
        .status(err.status || 500)
        .json({ error: err.message || "Server error" });
    }
  };
}

router.get(
  "/",
  requireAdmin,
  wrap((req) => svc.listTournaments()),
);

// Public — must come before "/:id" below, or Express would match this as
// GET /:id with id="public" and it would never be reached.
router.get(
  "/public",
  wrap((req) => svc.listPublicTournaments()),
);

router.post(
  "/",
  requireAdmin,
  wrap((req) => svc.createTournament(req.body)),
);

router.get(
  "/:id",
  requireAdmin,
  wrap((req) => svc.getTournament(req.params.id)),
);

router.delete(
  "/:id",
  requireAdmin,
  wrap((req) => {
    svc.deleteTournament(req.params.id);
    return { ok: true };
  }),
);

router.patch(
  "/:id",
  requireAdmin,
  wrap((req) => svc.updateTournamentDetails(req.params.id, req.body)),
);

router.post(
  "/:id/round",
  requireAdmin,
  wrap((req) => svc.generateNextRound(req.params.id)),
);

router.post(
  "/:id/results",
  requireAdmin,
  wrap((req) => svc.submitResults(req.params.id, req.body.results || [])),
);

router.patch(
  "/:id/rounds/:round/results",
  requireAdmin,
  wrap((req) =>
    svc.editResult(req.params.id, parseInt(req.params.round, 10), req.body),
  ),
);

router.delete(
  "/:id/rounds/:round",
  requireAdmin,
  wrap((req) => svc.deleteRound(req.params.id, parseInt(req.params.round, 10))),
);

router.post(
  "/:id/players",
  requireAdmin,
  wrap((req) => svc.addLatePlayer(req.params.id, req.body)),
);

router.post(
  "/:id/extend",
  requireAdmin,
  wrap((req) => svc.addExtraRound(req.params.id)),
);

router.get(
  "/:id/bracket",
  requireAdmin,
  wrap((req) => svc.getBracket(req.params.id)),
);

router.get(
  "/:id/players/:playerId/profile",
  requireAdmin,
  wrap((req) => svc.getPlayerProfile(req.params.id, req.params.playerId)),
);

router.post(
  "/:id/bracket/matches/:matchId/result",
  requireAdmin,
  wrap((req) =>
    svc.submitBracketMatchResult(req.params.id, req.params.matchId, req.body),
  ),
);

router.get(
  "/:id/bughouse/validate",
  requireAdmin,
  wrap((req) => svc.validateBughouseTeams(req.params.id)),
);

// ─── Self-registration ──────────────────────────────────────────────────
// Admin controls (tournament id, same auth posture as everything else above).
router.post(
  "/:id/registration/enable",
  requireAdmin,
  wrap((req) => svc.enableRegistration(req.params.id)),
);

router.post(
  "/:id/registration/disable",
  requireAdmin,
  wrap((req) => svc.disableRegistration(req.params.id)),
);

// Public — looked up by unguessable token, not tournament id. No auth by
// design: this is the whole point of a self-registration link.
router.get(
  "/register/:token",
  wrap((req) => svc.getPublicRegistration(req.params.token)),
);

router.post(
  "/register/:token",
  wrap((req) => svc.submitPublicRegistration(req.params.token, req.body)),
);

// ─── Public results view ────────────────────────────────────────────────
// Admin toggles public visibility by tournament id.
// Spectators access results through the public token without authentication.
router.post(
  "/:id/public-view/enable",
  requireAdmin,
  wrap((req) => svc.enablePublicView(req.params.id)),
);

router.post(
  "/:id/public-view/disable",
  requireAdmin,
  wrap((req) => svc.disablePublicView(req.params.id)),
);

// Current public tournament results.
router.get(
  "/public-view/:token",
  wrap((req) => svc.getPublicResults(req.params.token)),
);

// Public player profile.
router.get(
  "/public-view/:token/players/:playerId/profile",
  wrap((req) =>
    svc.getPublicPlayerProfile(req.params.token, req.params.playerId),
  ),
);

// ─── Historical public standings ────────────────────────────────────────
// Returns the standings exactly as they were after the requested round.
// Example:
// GET /api/tournaments/public-view/:token/standings/3
//
// No authentication is required because the public token controls access.
router.get(
  "/public-view/:token/standings/:round",
  wrap((req) =>
    svc.getPublicStandingsAtRound(
      req.params.token,
      parseInt(req.params.round, 10),
    ),
  ),
);

// ─── Historical admin standings ─────────────────────────────────────────
// Returns the standings exactly as they were after the requested round.
// Example:
// GET /api/tournaments/:id/standings/3
//
// Admin-only because this route uses the internal tournament ID.
router.get(
  "/:id/standings/:round",
  requireAdmin,
  wrap((req) =>
    svc.standingsAtRound(req.params.id, parseInt(req.params.round, 10)),
  ),
);

// ─── Current standings export ───────────────────────────────────────────
router.get("/:id/standings/export", requireAdmin, async (req, res) => {
  try {
    const { buffer, filename } = await svc.exportStandingsWorkbook(
      req.params.id,
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(buffer);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: err.message || "Server error" });
  }
});

// ─── Pairings export ───────────────────────────────────────────────────
router.get("/:id/pairings/export", requireAdmin, async (req, res) => {
  try {
    const { buffer, filename } = await svc.exportPairingsWorkbook(
      req.params.id,
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(buffer);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ error: err.message || "Server error" });
  }
});

module.exports = router;
