// ─── Bughouse Board Pairing ──────────────────────────────────────────────
// Bughouse is played 2 vs 2: each team fields exactly two players sharing
// captured material across their two boards. For that piece-passing to work,
// teammates must sit on OPPOSITE colors — your captures feed to your
// partner, who can only use them if they're playing the opposite color from
// you. That gives a fixed "cross" pattern once you know which team is
// nominally "White" for the match:
//
//   Board 1: teamWhite's board-1 player (White) vs teamBlack's board-1 player (Black)
//   Board 2: teamBlack's board-2 player (White) vs teamWhite's board-2 player (Black)
//
// i.e. each team has exactly one White player and one Black player, and the
// two boards are cross-coupled: teamWhite is White on board 1 / Black on
// board 2, teamBlack is Black on board 1 / White on board 2. "Board-1
// player" / "board-2 player" is just board order within the team (board 1 =
// higher rated, matching the convention used everywhere else in this app).
//
// This module only knows how to pair one already-decided match. It doesn't
// decide which team is "White" for the round/match — that's the job of
// whichever pairing system (Swiss, round-robin, or the bracket) produced the
// team-vs-team pairing in the first place.

function assignBughouseBoards(teamWhitePlayers, teamBlackPlayers) {
  validateRoster(teamWhitePlayers);
  validateRoster(teamBlackPlayers);

  const [w1, w2] = teamWhitePlayers; // board order: [board-1 player, board-2 player]
  const [b1, b2] = teamBlackPlayers;

  return [
    { boardNum: 1, white: w1, black: b1, result: undefined },
    { boardNum: 2, white: b2, black: w2, result: undefined },
  ];
}

function validateRoster(players) {
  if (!Array.isArray(players) || players.length !== 2) {
    const count = Array.isArray(players) ? players.length : 0;
    const e = new Error(
      `Bughouse requires exactly 2 players per team (found ${count}). Add or remove a player before pairing.`,
    );
    e.status = 400;
    throw e;
  }
}

// Roster check usable before pairing is attempted (e.g. at tournament
// creation, or for a pre-flight validation endpoint) — returns a report
// instead of throwing, so callers can decide how to surface it.
function validateBughouseRosters(teams) {
  const issues = teams
    .filter((team) => (team.playerIds || team.players || []).length !== 2)
    .map((team) => {
      const count = (team.playerIds || team.players || []).length;
      return `Team "${team.name}" has ${count} player(s) — bughouse requires exactly 2.`;
    });
  return { valid: issues.length === 0, issues };
}

module.exports = { assignBughouseBoards, validateBughouseRosters };
