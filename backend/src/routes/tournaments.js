const express = require("express");
const svc = require("../tournamentService");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

function wrap(fn) {
  return (req, res) => {
    try {
      const result = fn(req, res);
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
// Same shape as self-registration above: admin toggle by tournament id,
// public lookup by unguessable token, no auth on the token route by design.
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
router.get(
  "/public-view/:token",
  wrap((req) => svc.getPublicResults(req.params.token)),
);

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
