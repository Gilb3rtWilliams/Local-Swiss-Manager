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
  wrap((req) => svc.generateNextRound(req.params.id, req.body)),
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

// Edits a competitor's name/title/rating/fideId. `side` is "A" or "B".
// Body is any subset of { name, title, rating, fideId } — only the keys
// present are changed, so a client can PATCH just one field (e.g. rating
// after a live update) without resending the rest. Picture is handled by
// the POST route above instead, not this one.
router.patch(
  "/:id/cagematch/competitors/:side",
  requireAdmin,
  wrap((req) =>
    svc.updateCageMatchCompetitorDetails(
      req.params.id,
      req.params.side,
      req.body,
    ),
  ),
);

// ─── Match Play (best-of-N per pairing/board, Swiss/RR/DRR + team) ───────
// See tournamentService.js's Match Play section / matchPlay.js for the full
// data model. GET /:id already returns each open pairing's (or team board's)
// `miniMatch` sub-object on every fetch — same "instantly visible" pattern
// as Cage Match above — these routes just mutate.
//
// :pairIndex is the index into the tournament's currently OPEN round
// (t.currentPairings) — these routes only ever act on the open round; once
// it's closed via POST /:id/results, its pairings become read-only history.
// boardNum is only meaningful for a team tournament (which board of that
// round's match) — for an individual tournament, omit it from the body.

router.post(
  "/:id/matchplay/pairings/:pairIndex/move",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayMove(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
      move: req.body.move,
    }),
  ),
);

// Corrects a mis-entered move — removes only the most recent one.
router.delete(
  "/:id/matchplay/pairings/:pairIndex/move",
  requireAdmin,
  wrap((req) =>
    svc.undoMatchPlayMove(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
    }),
  ),
);

// Records the final result for one game within the mini-match. Body:
// { boardNum?, gameId, result: "1-0" | "0-1" | "1/2-1/2" | "1F-0F" | "0F-1F" | "0F-0F" }.
router.post(
  "/:id/matchplay/pairings/:pairIndex/result",
  requireAdmin,
  wrap((req) =>
    svc.setMatchPlayGameResult(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
      result: req.body.result,
    }),
  ),
);

// Escape hatch for a mis-recorded result — works even after the mini-match
// has already decided, on any game (including a game that itself caused
// the decision), since correcting it can un-decide the whole thing. Also
// drops any in-progress or completed tiebreak attached on the back of a
// tie that (once corrected) might not even be tied anymore.
router.delete(
  "/:id/matchplay/pairings/:pairIndex/result",
  requireAdmin,
  wrap((req) =>
    svc.clearMatchPlayGameResult(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
    }),
  ),
);

// The organizer's two options once a mini-match is level (GET /:id's
// miniMatch.tieAlert signals this): accept it as a genuine draw, or start
// the 4-game tiebreak mini-match. Draw is refused for a bracket match
// (unsupported for Match Play yet — see createTournament()'s validation)
// since someone always has to advance there.
router.post(
  "/:id/matchplay/pairings/:pairIndex/draw",
  requireAdmin,
  wrap((req) =>
    svc.acceptMatchPlayDraw(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
    }),
  ),
);

router.post(
  "/:id/matchplay/pairings/:pairIndex/tiebreak/start",
  requireAdmin,
  wrap((req) =>
    svc.startMatchPlayTiebreak(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
    }),
  ),
);

// Records a result for the current tiebreak mini-match game. Stops
// automatically once a side clinches more than half the available points;
// if both games are played still level, this flips into Armageddon
// automatically — see the two routes below.
router.post(
  "/:id/matchplay/pairings/:pairIndex/tiebreak/result",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayTiebreakResult(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
      result: req.body.result,
    }),
  ),
);

// Arbiter enters both players' privately-collected bids (seconds) at once.
// Lower bid gets Black with draw odds. Equal bids come back with
// tiebreak.armageddon.status === "bid_tie" (not an error) — call again with
// a fresh pair once the arbiter has collected a re-bid.
router.post(
  "/:id/matchplay/pairings/:pairIndex/tiebreak/armageddon/bids",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayArmageddonBids(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      bidA: req.body.bidA,
      bidB: req.body.bidB,
    }),
  ),
);

// Records the Armageddon result. Anything other than a clean White win
// (including a draw or double forfeit) goes to Black by draw odds — always
// decisive, and finishes the mini-match.
router.post(
  "/:id/matchplay/pairings/:pairIndex/tiebreak/armageddon/result",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayArmageddonResult(req.params.id, {
      pairIndex: parseInt(req.params.pairIndex, 10),
      boardNum: req.body.boardNum,
      result: req.body.result,
    }),
  ),
);

// ─── Match Play — bracket matches ────────────────────────────────────────
// Same actions as the pairing-based routes above, addressed by a bracket
// matchId instead of an open-round pairIndex. A bracket match has no
// round-batch "submit" step — the moment its mini-match (or every board's
// mini-match, for a team match) decides, it resolves automatically and
// cascades through the bracket, same as tournamentService.js's
// syncBracketIndividualMatch()/syncBracketBoard() describe. If a team
// match's boards tie on aggregate, resolve it exactly like a classical
// bracket team tie: POST /:id/bracket/matches/:matchId/result with just
// { winnerOverride } — every board already has a result by then.
router.post(
  "/:id/matchplay/matches/:matchId/move",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayMove(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
      move: req.body.move,
    }),
  ),
);

router.delete(
  "/:id/matchplay/matches/:matchId/move",
  requireAdmin,
  wrap((req) =>
    svc.undoMatchPlayMove(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
    }),
  ),
);

router.post(
  "/:id/matchplay/matches/:matchId/result",
  requireAdmin,
  wrap((req) =>
    svc.setMatchPlayGameResult(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
      result: req.body.result,
    }),
  ),
);

router.delete(
  "/:id/matchplay/matches/:matchId/result",
  requireAdmin,
  wrap((req) =>
    svc.clearMatchPlayGameResult(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
    }),
  ),
);

// No draw-accepting route here — matchPlay.js's allowDraw: false for every
// bracket mini-match means acceptMatchPlayDraw() always refuses; someone
// has to advance, so this option only makes sense for the pairing-based
// (Swiss/RR) routes above.

router.post(
  "/:id/matchplay/matches/:matchId/tiebreak/start",
  requireAdmin,
  wrap((req) =>
    svc.startMatchPlayTiebreak(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
    }),
  ),
);

router.post(
  "/:id/matchplay/matches/:matchId/tiebreak/result",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayTiebreakResult(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      gameId: req.body.gameId,
      result: req.body.result,
    }),
  ),
);

router.post(
  "/:id/matchplay/matches/:matchId/tiebreak/armageddon/bids",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayArmageddonBids(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      bidA: req.body.bidA,
      bidB: req.body.bidB,
    }),
  ),
);

router.post(
  "/:id/matchplay/matches/:matchId/tiebreak/armageddon/result",
  requireAdmin,
  wrap((req) =>
    svc.recordMatchPlayArmageddonResult(req.params.id, {
      matchId: req.params.matchId,
      boardNum: req.body.boardNum,
      result: req.body.result,
    }),
  ),
);

// Sets games-per-match for a whole bracket tier (e.g. "W1", "L2", "FINALS"
// — see tournamentService.js's bracketTierKey()) ahead of it starting, for
// a best-of-2-early-rounds/best-of-4-final style event. Locked in — and
// this route will 409 — once any match in that tier has activated.
router.post(
  "/:id/matchplay/bracket/tiers/:tierKey/games",
  requireAdmin,
  wrap((req) =>
    svc.setMatchPlayBracketTierGames(
      req.params.id,
      req.params.tierKey,
      req.body.numberOfGames,
    ),
  ),
);

// Game History tab — flat, chronological list of every game across every
// round's pairing/board (Swiss/RR/DRR) or every bracket match/board, plus
// each mini-match's own tiebreak/Armageddon — same idea as Cage Match's
// history tab above, just spanning many mini-matches instead of one.
router.get(
  "/:id/matchplay/history",
  requireAdmin,
  wrap((req) => svc.getMatchPlayHistory(req.params.id)),
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

// Public cage match Game History / Section Performance — same token-based,
// no-admin-required posture as the public player/team profile routes above.
// The scoreboard/sections/tiebreak state itself already rides along inside
// GET /public-view/:token's own cageMatch field; these two cover the two
// tabs that aren't part of that single payload.
router.get(
  "/public-view/:token/cagematch/history",
  wrap((req) => svc.getPublicCageMatchHistory(req.params.token)),
);
router.get(
  "/public-view/:token/cagematch/performance",
  wrap((req) => svc.getPublicCageMatchSectionPerformance(req.params.token)),
);

// Public Match Play Game History — same token-based, no-admin-required
// posture as the two above. The open round's/ready bracket matches' own
// mini-match state already rides along inside GET /public-view/:token
// itself (currentPairings/bracket); this covers the flat cross-event
// history tab, same split as Cage Match's two routes above.
router.get(
  "/public-view/:token/matchplay/history",
  wrap((req) => svc.getPublicMatchPlayHistory(req.params.token)),
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
