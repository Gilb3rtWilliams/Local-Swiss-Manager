const express = require("express");
const svc = require("../tournamentService");

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
  wrap((req) => svc.listTournaments()),
);
router.post(
  "/",
  wrap((req) => svc.createTournament(req.body)),
);
router.get(
  "/:id",
  wrap((req) => svc.getTournament(req.params.id)),
);
router.delete(
  "/:id",
  wrap((req) => {
    svc.deleteTournament(req.params.id);
    return { ok: true };
  }),
);
router.patch(
  "/:id",
  wrap((req) => svc.updateTournamentDetails(req.params.id, req.body)),
);

router.post(
  "/:id/round",
  wrap((req) => svc.generateNextRound(req.params.id)),
);
router.post(
  "/:id/results",
  wrap((req) => svc.submitResults(req.params.id, req.body.results || [])),
);
router.post(
  "/:id/players",
  wrap((req) => svc.addLatePlayer(req.params.id, req.body)),
);
router.post(
  "/:id/extend",
  wrap((req) => svc.addExtraRound(req.params.id)),
);

router.get(
  "/:id/bracket",
  wrap((req) => svc.getBracket(req.params.id)),
);
router.post(
  "/:id/bracket/matches/:matchId/result",
  wrap((req) =>
    svc.submitBracketMatchResult(req.params.id, req.params.matchId, req.body),
  ),
);

router.get(
  "/:id/bughouse/validate",
  wrap((req) => svc.validateBughouseTeams(req.params.id)),
);

// ─── Self-registration ──────────────────────────────────────────────────
// Admin controls (tournament id, same auth posture as everything else above).
router.post(
  "/:id/registration/enable",
  wrap((req) => svc.enableRegistration(req.params.id)),
);
router.post(
  "/:id/registration/disable",
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
  wrap((req) => svc.enablePublicView(req.params.id)),
);
router.post(
  "/:id/public-view/disable",
  wrap((req) => svc.disablePublicView(req.params.id)),
);
router.get(
  "/public-view/:token",
  wrap((req) => svc.getPublicResults(req.params.token)),
);

router.get("/:id/standings/export", async (req, res) => {
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

router.get("/:id/pairings/export", async (req, res) => {
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
