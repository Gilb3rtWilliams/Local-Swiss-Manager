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

// Manual round: organizer specifies who plays whom (and optionally who's
// White) instead of the automatic Swiss/round-robin algorithm. Same
// preconditions as the route above (svc.generateManualRound enforces them);
// see that function's own doc comment for the payload shape.
router.post(
  "/:id/round/manual",
  requireAdmin,
  wrap((req) => svc.generateManualRound(req.params.id, req.body)),
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

router.get(
  "/:id/teams/:teamId/profile",
  requireAdmin,
  wrap((req) => svc.getTeamProfile(req.params.id, req.params.teamId)),
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

// ─── Cage Match (1 vs 1 match format) ────────────────────────────────────
// See tournamentService.js's Cage Match section / cageMatch.js for the full
// data model. GET /:id already returns the whole `cageMatch` sub-object
// (score, tieAlert, tiebreak state) on every fetch, same pattern as the
// standings decider above — these routes just mutate.

// Manual move entry — moves are validated (legality) and reflected live,
// same "instantly visible to the client" pattern as round results elsewhere
// in the app. Body: { move: "e4" } or { move: { from, to, promotion? } }.
router.post(
  "/:id/cagematch/sections/:sectionId/games/:gameId/move",
  requireAdmin,
  wrap((req) =>
    svc.recordCageMatchMove(req.params.id, {
      sectionId: req.params.sectionId,
      gameId: req.params.gameId,
      move: req.body.move,
    }),
  ),
);

// Corrects a mis-entered move — removes only the most recent one.
router.delete(
  "/:id/cagematch/sections/:sectionId/games/:gameId/move",
  requireAdmin,
  wrap((req) =>
    svc.undoCageMatchMove(req.params.id, {
      sectionId: req.params.sectionId,
      gameId: req.params.gameId,
    }),
  ),
);

// Records the final result for a section game — resignation, timeout,
// agreed draw, or confirming a board-detected checkmate/stalemate the move
// list already reflects. Body: { result: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" }.
router.post(
  "/:id/cagematch/sections/:sectionId/games/:gameId/result",
  requireAdmin,
  wrap((req) =>
    svc.setCageMatchGameResult(req.params.id, {
      sectionId: req.params.sectionId,
      gameId: req.params.gameId,
      result: req.body.result,
    }),
  ),
);

// Escape hatch for a mis-recorded result. If a tiebreak had already started
// off the back of what turns out to be a false tie, this clears it too.
router.delete(
  "/:id/cagematch/sections/:sectionId/games/:gameId/result",
  requireAdmin,
  wrap((req) =>
    svc.clearCageMatchGameResult(req.params.id, {
      sectionId: req.params.sectionId,
      gameId: req.params.gameId,
    }),
  ),
);

// Starts the 4-game mini-match — only valid once every section game is
// played and the combined score is level (GET /:id's cageMatch.tieAlert
// tells the frontend when to offer this).
router.post(
  "/:id/cagematch/tiebreak/start",
  requireAdmin,
  wrap((req) => svc.startCageMatchTiebreak(req.params.id)),
);

// Records a result for the current mini-match game. Stops automatically
// (no further games needed) once a side has clinched more than half the
// available points — cageMatch.js handles that, this just records what's
// given. Once both bestOf games are played still level, this same match
// object flips into Armageddon automatically; see the two routes below.
router.post(
  "/:id/cagematch/tiebreak/result",
  requireAdmin,
  wrap((req) =>
    svc.recordCageMatchTiebreakResult(req.params.id, {
      gameId: req.body.gameId,
      result: req.body.result,
    }),
  ),
);

// Arbiter enters both players' privately-collected bids (seconds) at once.
// Lower bid gets Black with draw odds. Equal bids come back with
// tiebreak.armageddon.status === "bid_tie" (not an error) — call this route
// again with a fresh pair once the arbiter has collected a re-bid.
router.post(
  "/:id/cagematch/tiebreak/armageddon/bids",
  requireAdmin,
  wrap((req) =>
    svc.recordCageMatchArmageddonBids(req.params.id, {
      bidA: req.body.bidA,
      bidB: req.body.bidB,
    }),
  ),
);

// Records the Armageddon result. Anything other than a clean White win
// (including a draw or double forfeit) goes to Black by draw odds — always
// decisive, and finishes the match.
router.post(
  "/:id/cagematch/tiebreak/armageddon/result",
  requireAdmin,
  wrap((req) =>
    svc.recordCageMatchArmageddonResult(req.params.id, {
      result: req.body.result,
    }),
  ),
);

// Game History tab — flat, chronological list of every game across every
// section plus the tiebreak/Armageddon, each with its full move list/PGN.
router.get(
  "/:id/cagematch/history",
  requireAdmin,
  wrap((req) => svc.getCageMatchHistory(req.params.id)),
);

// Section Performance tab — per-section, per-competitor W/L/D + points.
router.get(
  "/:id/cagematch/performance",
  requireAdmin,
  wrap((req) => svc.getCageMatchSectionPerformance(req.params.id)),
);

// Sets/replaces a competitor's picture. `side` is "A" or "B". Body:
// { pictureUrl } — obtained beforehand from POST /api/uploads/image (see
// uploads.js), not uploaded directly through this route.
router.post(
  "/:id/cagematch/competitors/:side/picture",
  requireAdmin,
  wrap((req) =>
    svc.setCageMatchCompetitorPicture(
      req.params.id,
      req.params.side,
      req.body.pictureUrl,
    ),
  ),
);

// ─── Tiebreak Decider (playoff) system ──────────────────────────────────
// See tournamentService.js's Decider section for the full data model.
// GET /:id already returns tieAlert/decider on every fetch, so there's no
// separate "check for a tie" endpoint — these three just mutate.
router.post(
  "/:id/decider/start",
  requireAdmin,
  wrap((req) => svc.startDecider(req.params.id, req.body)),
);

router.post(
  "/:id/decider/result",
  requireAdmin,
  wrap((req) => svc.recordDeciderResult(req.params.id, req.body)),
);

router.post(
  "/:id/decider/cancel",
  requireAdmin,
  wrap((req) => svc.cancelDecider(req.params.id)),
);

// Escape hatch for the "stuck" cap (a round-robin that repeatedly fails to
// narrow the tied group) — lets the organizer pick the winner directly.
router.post(
  "/:id/decider/resolve",
  requireAdmin,
  wrap((req) => svc.resolveDeciderManually(req.params.id, req.body.winnerId)),
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

// Public team profile.
router.get(
  "/public-view/:token/teams/:teamId/profile",
  wrap((req) => svc.getPublicTeamProfile(req.params.token, req.params.teamId)),
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
