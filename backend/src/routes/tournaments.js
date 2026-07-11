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

module.exports = router;
