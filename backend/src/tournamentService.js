const crypto = require("crypto");
const engine = require("./swissEngine");
const store = require("./store");
const roundRobin = require("./roundRobin");
const bracketEngine = require("./bracket");
const bughouse = require("./bughouse");
const chess960 = require("./chess960");
const excelExport = require("./excelExport");

const db = store.load();
function persist() {
  store.save(db);
}

// Migrate tournaments saved before the starting-rank feature existed.
// Wrapped defensively so one malformed legacy record can never prevent the
// server from starting — worst case that one tournament is skipped and logged.
let migrated = false;
Object.values(db.tournaments).forEach((t) => {
  try {
    if (t.players.some((p) => p.startingRank === undefined)) {
      assignStartingRanks(t.players);
      migrated = true;
    }
    if (
      t.format === "team" &&
      t.teams.some((x) => x.startingRank === undefined)
    ) {
      assignStartingRanks(t.teams);
      migrated = true;
    }
  } catch (err) {
    console.error(
      `Starting-rank migration failed for tournament ${t.id} (${t.name}):`,
      err.message,
    );
  }
});
if (migrated) persist();

function uid() {
  return crypto.randomUUID();
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function assertTournament(id) {
  const t = db.tournaments[id];
  if (!t) {
    const e = new Error("Tournament not found");
    e.status = 404;
    throw e;
  }
  return t;
}

function playerToCompetitor(p) {
  // Player already stores competitor fields directly.
  return p;
}

function byId(list) {
  return new Map(list.map((x) => [x.id, x]));
}

function isRoundRobinSystem(t) {
  return t.system === "round_robin" || t.system === "double_round_robin";
}

// Seed order for the round-robin schedule: startingRank 1 -> seed index 0.
function seedList(t) {
  const list = t.format === "team" ? t.teams : t.players;
  return [...list].sort(
    (a, b) => (a.startingRank ?? Infinity) - (b.startingRank ?? Infinity),
  );
}

// Returns [{white, black}] (black === null for a bye) for the tournament's
// *current* round, mapping the roundRobin.js seed-index schedule onto real
// team/player objects. Returns null once currentRound goes past the fixed
// schedule (e.g. an extra playoff round added after the event finished),
// so the caller can fall back to Swiss-style pairing for that round.
function roundRobinPairsForRound(t) {
  const seeds = seedList(t);
  const n = seeds.length;
  const schedule =
    t.system === "double_round_robin"
      ? roundRobin.doubleRoundRobinSchedule(n)
      : roundRobin.singleRoundRobinSchedule(n);
  const roundPairs = schedule[t.currentRound - 1];
  if (!roundPairs) return null;
  return roundPairs.map((pair) =>
    "bye" in pair
      ? { white: seeds[pair.bye], black: null }
      : { white: seeds[pair.home], black: seeds[pair.away] },
  );
}

function isEliminationSystem(t) {
  return t.system === "single_elimination" || t.system === "double_elimination";
}

// ─── Elimination bracket state machine ──────────────────────────────────────
// Unlike Swiss/round-robin, an elimination tournament's full match graph is
// known up front. buildBracketState() draws it once at creation time (using
// bracket.js for pure topology) and resolveBracket() re-runs after every
// result to cascade winners/losers/byes forward through the graph until it
// reaches a fixed point.

function buildBracketState(t) {
  const seeds = seedList(t);
  const n = seeds.length;
  const topology =
    t.system === "double_elimination"
      ? bracketEngine.doubleEliminationBracket(n)
      : bracketEngine.singleEliminationBracket(n);

  const matches = topology.matches.map((m) => ({
    ...m,
    competitorA: undefined, // undefined = not yet resolvable; null = resolved to a bye
    competitorB: undefined,
    winnerId: null,
    loserId: null,
    status: "pending", // pending -> ready -> complete | bye | skipped
    boards: null,
    result: null,
  }));

  t.bracket = {
    size: topology.size,
    wbRounds: topology.wbRounds ?? topology.rounds,
    lbRounds: topology.lbRounds ?? 0,
    grandFinalId: topology.grandFinalId ?? null,
    grandFinalResetId: topology.grandFinalResetId ?? null,
    matches,
    seeds: seeds.map((c, i) => ({ seed: i, id: c.id, name: c.name })),
    champion: null,
  };

  resolveBracket(t);
}

function bracketMatchById(t, id) {
  return t.bracket.matches.find((m) => m.id === id);
}

function resolveBracketSlot(t, slot) {
  if (!slot) return { val: null, pending: false };
  if (slot.type === "seed") {
    return slot.seed < t.bracket.seeds.length
      ? { val: t.bracket.seeds[slot.seed].id, pending: false }
      : { val: null, pending: false }; // bye
  }
  if (slot.type === "bye") return { val: null, pending: false };
  if (slot.type === "winner") {
    const src = bracketMatchById(t, slot.matchId);
    if (src.status === "skipped") return { val: null, pending: false };
    if (src.winnerId) return { val: src.winnerId, pending: false };
    return { val: undefined, pending: true };
  }
  if (slot.type === "loser") {
    const src = bracketMatchById(t, slot.matchId);
    // A bye or skipped match never produced a real loser.
    if (src.status === "bye" || src.status === "skipped")
      return { val: null, pending: false };
    if (src.loserId) return { val: src.loserId, pending: false };
    return { val: undefined, pending: true };
  }
  if (slot.type === "resetA" || slot.type === "resetB") {
    const gf = bracketMatchById(t, t.bracket.grandFinalId);
    if (!gf.winnerId) return { val: undefined, pending: true };
    // Bracket reset only happens if the loser's-bracket finalist (slot B of
    // the Grand Final) beat the winner's-bracket champion.
    if (gf.winnerId !== gf.competitorB)
      return { val: null, pending: false, skip: true };
    return {
      val: slot.type === "resetA" ? gf.competitorA : gf.competitorB,
      pending: false,
    };
  }
  return { val: null, pending: false };
}

// Builds one match's boards for a team-format pairing (teamWhite vs
// teamBlack), used by both the bracket's activateMatch() and the
// Swiss/round-robin round-generation path. Dispatches to bughouse's
// cross-color pairing for that variant; otherwise uses the generic
// even/odd board-alternation split that works for any team size.
function buildTeamBoards(t, teamWhite, teamBlack) {
  const whitePlayers = t.players
    .filter((p) => p.teamId === teamWhite.id)
    .sort((a, b) => b.rating - a.rating);
  const blackPlayers = t.players
    .filter((p) => p.teamId === teamBlack.id)
    .sort((a, b) => b.rating - a.rating);

  if (t.variant === "bughouse") {
    return bughouse.assignBughouseBoards(whitePlayers, blackPlayers);
  }

  const boardCount = Math.max(whitePlayers.length, blackPlayers.length);
  const boards = [];
  for (let bIdx = 0; bIdx < boardCount; bIdx++) {
    const evenBoard = bIdx % 2 === 0; // board 1,3,5... teamWhite plays White
    const wp = whitePlayers[bIdx] || null;
    const bp = blackPlayers[bIdx] || null;
    if (!wp || !bp) {
      boards.push({
        boardNum: bIdx + 1,
        white: evenBoard ? wp : bp,
        black: evenBoard ? bp : wp,
        sitOut: true,
        result: undefined,
      });
      continue;
    }
    boards.push(
      evenBoard
        ? { boardNum: bIdx + 1, white: wp, black: bp, result: undefined }
        : { boardNum: bIdx + 1, white: bp, black: wp, result: undefined },
    );
  }
  return boards;
}

// Wires up a team match's boards the moment both sides are known, reusing
// the same board-pairing convention as the Swiss/round-robin team flow.
function activateMatch(t, m) {
  m.status = "ready";
  if (t.format !== "team") return;
  const teamA = t.teams.find((x) => x.id === m.competitorA);
  const teamB = t.teams.find((x) => x.id === m.competitorB);
  m.boards = buildTeamBoards(t, teamA, teamB);
}

function resolveBracket(t) {
  let changed = true;
  let guard = 0;
  while (changed && guard < t.bracket.matches.length + 10) {
    changed = false;
    guard++;
    for (const m of t.bracket.matches) {
      if (m.status !== "pending") continue;
      const ra = resolveBracketSlot(t, m.slotA);
      const rb = resolveBracketSlot(t, m.slotB);
      if (ra.skip || rb.skip) {
        m.status = "skipped";
        changed = true;
        continue;
      }
      if (ra.pending || rb.pending) continue;
      if (m.competitorA === undefined) {
        m.competitorA = ra.val;
        changed = true;
      }
      if (m.competitorB === undefined) {
        m.competitorB = rb.val;
        changed = true;
      }
      if (m.competitorA !== undefined && m.competitorB !== undefined) {
        if (m.competitorA === null && m.competitorB === null) {
          m.status = "skipped";
        } else if (m.competitorA === null) {
          m.winnerId = m.competitorB;
          m.status = "bye";
        } else if (m.competitorB === null) {
          m.winnerId = m.competitorA;
          m.status = "bye";
        } else {
          activateMatch(t, m);
        }
        changed = true;
      }
    }
  }
  finalizeBracketIfDone(t);
}

function finalizeBracketIfDone(t) {
  const b = t.bracket;
  if (t.system === "single_elimination") {
    const final = b.matches.find((m) => m.bracket === "W" && !m.winnerTo);
    if (final && final.status === "complete") {
      b.champion = final.winnerId;
      t.status = "finished";
      t.finishedAt = t.finishedAt || new Date().toISOString();
    }
    return;
  }
  const gf1 = bracketMatchById(t, b.grandFinalId);
  const gf2 = bracketMatchById(t, b.grandFinalResetId);
  if (gf2.status === "complete") {
    b.champion = gf2.winnerId;
    t.status = "finished";
    t.finishedAt = t.finishedAt || new Date().toISOString();
  } else if (gf2.status === "skipped" && gf1.status === "complete") {
    b.champion = gf1.winnerId;
    t.status = "finished";
    t.finishedAt = t.finishedAt || new Date().toISOString();
  }
}

// Build a lightweight "team competitor" that mirrors an individual competitor's
// shape, so the same engine.generatePairings()/sortedStandings() works on teams.
function teamCompetitor(team) {
  return {
    id: team.id,
    rating: team.rating,
    score: team.score,
    colorDiff: team.colorDiff,
    lastColor: team.lastColor,
    colorHistory: team.colorHistory,
    opponents: team.opponents,
    results: team.results,
    byeRounds: team.byeRounds,
  };
}

function syncTeamFromCompetitor(team, comp) {
  team.rating = comp.rating;
  team.score = comp.score;
  team.colorDiff = comp.colorDiff;
  team.lastColor = comp.lastColor;
  team.colorHistory = comp.colorHistory;
  team.opponents = comp.opponents;
  team.results = comp.results;
  team.byeRounds = comp.byeRounds;
}

// ─── Create ─────────────────────────────────────────────────────────────────
const VALID_SYSTEMS = [
  "swiss",
  "round_robin",
  "double_round_robin",
  "single_elimination",
  "double_elimination",
];

function createTournament(input) {
  const {
    name,
    federation = "",
    format = "individual",
    variant = "standard",
    timeControl = "",
    totalRounds,
    players = [],
    teams = [],
    system = "swiss",
    organizerName = "",
    chiefArbiter = "",
    deputyChiefArbiter = "",
    dateFrom = "",
    dateTo = "",
    fideRated = false,
    isTest = false,
    chess960: chess960Enabled = false,
  } = input;

  if (!name || !name.trim()) {
    const e = new Error("Tournament name is required");
    e.status = 400;
    throw e;
  }
  if (!VALID_SYSTEMS.includes(system)) {
    const e = new Error(`Invalid system "${system}"`);
    e.status = 400;
    throw e;
  }
  if (dateFrom && dateTo && dateTo < dateFrom) {
    const e = new Error("End date can't be before start date");
    e.status = 400;
    throw e;
  }
  if (
    chess960Enabled &&
    (system === "single_elimination" || system === "double_elimination")
  ) {
    // Brackets are drawn whole at creation (buildBracketState), not
    // round-by-round via generateNextRound, which is the only place a
    // Chess960 position gets rolled — so there's nowhere for it to hook in.
    const e = new Error(
      "Chess960 isn't available for elimination brackets yet — only Swiss and round-robin systems.",
    );
    e.status = 400;
    throw e;
  }

  const t = {
    id: uid(),
    name: name.trim(),
    federation,
    format, // 'individual' | 'team'
    variant, // 'standard' | 'bughouse' | 'league' ...
    system, // 'swiss' | 'round_robin' | 'double_round_robin' | 'single_elimination' | 'double_elimination'
    timeControl,
    organizerName: organizerName.trim(),
    chiefArbiter: chiefArbiter.trim(),
    deputyChiefArbiter: deputyChiefArbiter.trim(),
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    fideRated: Boolean(fideRated),
    isTest: Boolean(isTest),
    chess960: Boolean(chess960Enabled),
    currentChess960: null, // set by generateNextRound when chess960 is on
    registrationOpen: false,
    registrationToken: null,
    publicViewOpen: false,
    publicViewToken: null,
    totalRounds: null,
    currentRound: 0,
    status: "setup",
    players: [],
    teams: [],
    rounds: [],
    currentPairings: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
  };

  if (format === "team") {
    if (!Array.isArray(teams) || teams.length < 2) {
      const e = new Error("Need at least 2 teams for a team tournament");
      e.status = 400;
      throw e;
    }
    teams.forEach((teamInput) => {
      const teamId = uid();
      const teamPlayers = (teamInput.players || []).map((p) => {
        const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
        comp.name = p.name.trim();
        comp.teamId = teamId;
        return comp;
      });
      if (teamPlayers.length === 0) {
        const e = new Error(`Team "${teamInput.name}" needs at least 1 player`);
        e.status = 400;
        throw e;
      }
      if (variant === "bughouse" && teamPlayers.length !== 2) {
        const e = new Error(
          `Bughouse requires exactly 2 players per team — team "${teamInput.name}" has ${teamPlayers.length}.`,
        );
        e.status = 400;
        throw e;
      }
      const avgRating = Math.round(
        teamPlayers.reduce((s, p) => s + p.rating, 0) / teamPlayers.length,
      );
      const team = {
        id: teamId,
        name: teamInput.name.trim(),
        rating: avgRating,
        score: 0,
        colorDiff: 0,
        lastColor: null,
        colorHistory: [],
        opponents: new Set(),
        results: {},
        byeRounds: 0,
        playerIds: teamPlayers.map((p) => p.id),
      };
      t.teams.push(team);
      t.players.push(...teamPlayers);
    });
  } else {
    if (!Array.isArray(players) || players.length < 2) {
      const e = new Error("Need at least 2 players");
      e.status = 400;
      throw e;
    }
    const names = players.map((p) => p.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      const e = new Error("Duplicate player names");
      e.status = 400;
      throw e;
    }
    players.forEach((p) => {
      const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
      comp.name = p.name.trim();
      t.players.push(comp);
    });
  }

  const competitorCount = format === "team" ? t.teams.length : t.players.length;
  t.totalRounds = isRoundRobinSystem(t)
    ? roundRobin.scheduleLength(competitorCount, system)
    : totalRounds && totalRounds > 0
      ? Number(totalRounds)
      : engine.suggestedRounds(competitorCount);

  assignStartingRanks(t.players);
  if (format === "team") assignStartingRanks(t.teams);

  if (isEliminationSystem(t)) {
    // The full bracket is known the moment seeding is set — draw it now
    // rather than waiting for a "generate round" click, and resolve any
    // immediate byes so Round 1 is ready to view/play right away.
    buildBracketState(t);
    t.totalRounds = t.bracket.wbRounds + t.bracket.lbRounds + 1; // +1 for the Grand Final (reset match isn't guaranteed)
    t.currentRound = 1;
    t.status = "active";
  }

  db.tournaments[t.id] = t;
  persist();
  return serializeTournament(t);
}

// Seed order: highest rating first (standard Swiss "starting rank" list), ties
// broken alphabetically for a stable, reproducible order.
function assignStartingRanks(list) {
  const sorted = [...list].sort(
    (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
  );
  sorted.forEach((c, i) => {
    c.startingRank = i + 1;
  });
}

// ─── Round generation ───────────────────────────────────────────────────────
function generateNextRound(id) {
  const t = assertTournament(id);
  if (isEliminationSystem(t)) {
    const e = new Error(
      "This is a bracket tournament — results are submitted match-by-match via the bracket, not round-by-round.",
    );
    e.status = 400;
    throw e;
  }
  if (t.currentPairings) {
    const e = new Error("Current round is still open — submit results first");
    e.status = 409;
    throw e;
  }
  if (t.status === "finished") {
    const e = new Error("Tournament already finished");
    e.status = 409;
    throw e;
  }

  t.currentRound += 1;
  t.status = "active";

  // A fresh position every round — same spirit as pairings themselves being
  // regenerated each round, not carried over from the last one.
  t.currentChess960 = t.chess960 ? chess960.randomChess960Position() : null;

  if (t.format === "team") {
    const teamPairings =
      (isRoundRobinSystem(t) && roundRobinPairsForRound(t)) ||
      (() => {
        const teamComps = t.teams.map(teamCompetitor);
        const pairings = engine.generatePairings(teamComps);
        // Sync any bye bookkeeping changes back before board expansion (colors not yet set for byes).
        t.teams.forEach((team) => {
          const comp = teamComps.find((c) => c.id === team.id);
          syncTeamFromCompetitor(team, comp);
        });
        return pairings;
      })();

    t.currentPairings = teamPairings.map((pair) => {
      const teamWhite = t.teams.find((x) => x.id === pair.white.id);
      const teamBlack = pair.black
        ? t.teams.find((x) => x.id === pair.black.id)
        : null;

      if (!teamBlack) {
        // Bye team: every player on the team gets an individual bye point.
        return { type: "bye", team: teamWhite.id, boards: [] };
      }

      const boards = buildTeamBoards(t, teamWhite, teamBlack);
      return {
        type: "match",
        teamWhite: teamWhite.id,
        teamBlack: teamBlack.id,
        boards,
      };
    });
  } else {
    const pairings =
      (isRoundRobinSystem(t) && roundRobinPairsForRound(t)) ||
      engine.generatePairings(t.players.map(playerToCompetitor));
    t.currentPairings = pairings.map((pair) => ({
      type: pair.black === null ? "bye" : "individual",
      white: pair.white.id,
      black: pair.black ? pair.black.id : null,
      result: undefined,
    }));
  }

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// ─── Results submission ─────────────────────────────────────────────────────
// Forfeit codes read the same as a normal decisive result almost everywhere
// (someone still won the board, the other lost) — the one exception is
// 0F-0F, where *neither* side scores. Centralized here rather than inlined
// at each call site so every place that needs "did white win this board?"
// agrees on the same definition, including forfeits.
const WHITE_WIN_RESULTS = new Set(["1-0", "1F-0F"]);
const BLACK_WIN_RESULTS = new Set(["0-1", "0F-1F"]);
const DRAW_RESULTS = new Set(["1/2-1/2"]);
const DOUBLE_FORFEIT_RESULT = "0F-0F";
const VALID_RESULTS = new Set([
  ...WHITE_WIN_RESULTS,
  ...BLACK_WIN_RESULTS,
  ...DRAW_RESULTS,
  DOUBLE_FORFEIT_RESULT,
]);

function assertValidResult(result) {
  if (!VALID_RESULTS.has(result)) {
    const e = new Error(
      `"${result}" isn't a recognized result — expected one of ${[...VALID_RESULTS].join(", ")}`,
    );
    e.status = 400;
    throw e;
  }
}

function isDecisiveResult(result) {
  return WHITE_WIN_RESULTS.has(result) || BLACK_WIN_RESULTS.has(result);
}

function scoreFromResult(result, side) {
  // side: 'white' | 'black'
  if (WHITE_WIN_RESULTS.has(result)) return side === "white" ? 1 : 0;
  if (BLACK_WIN_RESULTS.has(result)) return side === "white" ? 0 : 1;
  if (result === DOUBLE_FORFEIT_RESULT) return 0; // both forfeit — nobody scores
  return 0.5; // draw (1/2-1/2)
}

function applyGame(playersById, whiteId, blackId, result) {
  const w = playersById.get(whiteId);
  const b = playersById.get(blackId);
  w.opponents.add(blackId);
  b.opponents.add(whiteId);
  w.colorHistory.push("W");
  b.colorHistory.push("B");
  w.lastColor = "W";
  b.lastColor = "B";
  w.colorDiff++;
  b.colorDiff--;
  const wScore = scoreFromResult(result, "white");
  const bScore = scoreFromResult(result, "black");
  w.score += wScore;
  b.score += bScore;
  w.results[blackId] = wScore;
  b.results[whiteId] = bScore;
  return { wScore, bScore };
}

function submitResults(id, resultsInput) {
  const t = assertTournament(id);
  if (isEliminationSystem(t)) {
    const e = new Error(
      "This is a bracket tournament — use submitBracketMatchResult for a specific match instead.",
    );
    e.status = 400;
    throw e;
  }
  if (!t.currentPairings) {
    const e = new Error("No open round to submit");
    e.status = 409;
    throw e;
  }

  const pById = byId(t.players);

  if (t.format === "team") {
    const tById = byId(t.teams);
    // Merge submitted results into board slots.
    resultsInput.forEach((r) => {
      const pairing = t.currentPairings[r.pairIndex];
      if (!pairing || pairing.type !== "match") return;
      const board = pairing.boards.find((bd) => bd.boardNum === r.boardNum);
      if (board && !board.sitOut) {
        assertValidResult(r.result);
        board.result = r.result;
      }
    });

    const incomplete = t.currentPairings.some((p) => {
      if (p.type !== "match") return false;

      if (t.variant === "bughouse") {
        // A single decisive board (including a forfeit) ends a Bughouse match
        const hasDecisive = p.boards.some(
          (bd) => !bd.sitOut && isDecisiveResult(bd.result),
        );
        if (hasDecisive) return false;
      }

      return p.boards.some((bd) => !bd.sitOut && !bd.result);
    });

    if (incomplete) {
      const e = new Error("All necessary boards must have a result");
      e.status = 400;
      throw e;
    }

    const roundRecord = {
      round: t.currentRound,
      chess960: t.currentChess960,
      pairings: [],
    };

    t.currentPairings.forEach((pairing) => {
      if (pairing.type === "bye") {
        const team = tById.get(pairing.team);
        team.score += 1;
        team.byeRounds += 1;
        team.colorHistory.push(null);
        t.players
          .filter((p) => p.teamId === team.id)
          .forEach((p) => {
            p.score += 1;
            p.byeRounds += 1;
          });
        roundRecord.pairings.push({ type: "bye", team: team.id });
        return;
      }

      const teamWhite = tById.get(pairing.teamWhite);
      const teamBlack = tById.get(pairing.teamBlack);
      let whitePoints = 0,
        blackPoints = 0;
      const boardResults = [];

      pairing.boards.forEach((board) => {
        // Safely skip sit-outs or abandoned Bughouse boards
        if (board.sitOut || !board.result) {
          boardResults.push({
            boardNum: board.boardNum,
            sitOut: board.sitOut || false,
            player: (board.white || board.black)?.id,
            result: board.result || null,
          });
          return;
        }

        const { wScore, bScore } = applyGame(
          pById,
          board.white.id,
          board.black.id,
          board.result,
        );
        whitePoints += wScore;
        blackPoints += bScore;
        boardResults.push({
          boardNum: board.boardNum,
          white: board.white.id,
          black: board.black.id,
          result: board.result,
        });
      });

      // OVERRIDE: Bughouse match points
      if (t.variant === "bughouse") {
        const b1 = pairing.boards[0];
        const b2 = pairing.boards[1];

        // As defined in your bughouse.js: teamWhite is White on Board 1, Black on Board 2
        const teamWhiteWon =
          (b1 && WHITE_WIN_RESULTS.has(b1.result)) ||
          (b2 && BLACK_WIN_RESULTS.has(b2.result));
        const teamBlackWon =
          (b1 && BLACK_WIN_RESULTS.has(b1.result)) ||
          (b2 && WHITE_WIN_RESULTS.has(b2.result));

        if (teamWhiteWon) {
          whitePoints = 1;
          blackPoints = 0;
        } else if (teamBlackWon) {
          whitePoints = 0;
          blackPoints = 1;
        } else {
          // If neither won but the match is submitted, they drew
          whitePoints = 0.5;
          blackPoints = 0.5;
        }
      }

      teamWhite.opponents.add(teamBlack.id);
      teamBlack.opponents.add(teamWhite.id);
      teamWhite.colorHistory.push("W");
      teamBlack.colorHistory.push("B");
      teamWhite.lastColor = "W";
      teamBlack.lastColor = "B";
      teamWhite.colorDiff++;
      teamBlack.colorDiff--;
      teamWhite.score += whitePoints;
      teamBlack.score += blackPoints;
      teamWhite.results[teamBlack.id] = whitePoints;
      teamBlack.results[teamWhite.id] = blackPoints;

      roundRecord.pairings.push({
        type: "match",
        teamWhite: teamWhite.id,
        teamBlack: teamBlack.id,
        boards: boardResults,
        whitePoints,
        blackPoints,
      });
    });

    t.rounds.push(roundRecord);
  } else {
    resultsInput.forEach((r) => {
      const pairing = t.currentPairings[r.pairIndex];
      if (pairing && pairing.type === "individual") {
        assertValidResult(r.result);
        pairing.result = r.result;
      }
    });
    const incomplete = t.currentPairings.some(
      (p) => p.type === "individual" && !p.result,
    );
    if (incomplete) {
      const e = new Error("All games must have a result");
      e.status = 400;
      throw e;
    }

    const roundRecord = {
      round: t.currentRound,
      chess960: t.currentChess960,
      pairings: [],
    };
    t.currentPairings.forEach((pairing) => {
      if (pairing.type === "bye") {
        const p = pById.get(pairing.white);
        p.score += 1;
        p.byeRounds += 1;
        p.colorHistory.push(null);
        roundRecord.pairings.push({ type: "bye", white: p.id });
      } else {
        applyGame(pById, pairing.white, pairing.black, pairing.result);
        roundRecord.pairings.push({
          type: "individual",
          white: pairing.white,
          black: pairing.black,
          result: pairing.result,
        });
      }
    });
    t.rounds.push(roundRecord);
  }

  t.currentPairings = null;

  if (t.currentRound >= t.totalRounds) {
    t.status = "finished";
    t.finishedAt = new Date().toISOString();
  }

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// ─── Bracket result submission ──────────────────────────────────────────────
// One match at a time, unlike the round-batch submitResults() above. Accepts:
//   individual: { winner: "A" | "B" }
//   team:       { boards: [{ boardNum, result }], winnerOverride?: "A" | "B" }
//               (winnerOverride is required only if the boards tie)
function submitBracketMatchResult(id, matchId, payload = {}) {
  const t = assertTournament(id);
  if (!isEliminationSystem(t)) {
    const e = new Error("This tournament doesn't use a bracket");
    e.status = 400;
    throw e;
  }

  const m = bracketMatchById(t, matchId);
  if (!m) {
    const e = new Error("Match not found");
    e.status = 404;
    throw e;
  }
  if (m.status !== "ready") {
    const e = new Error(
      `This match isn't ready for a result (status: ${m.status})`,
    );
    e.status = 409;
    throw e;
  }

  if (t.format === "team") {
    const boardsInput = payload.boards || [];
    boardsInput.forEach((b) => {
      const board = m.boards.find((bd) => bd.boardNum === b.boardNum);
      if (board && !board.sitOut) {
        assertValidResult(b.result);
        board.result = b.result;
      }
    });

    // Bughouse: a single decisive board (including a forfeit) ends the match
    // immediately — the other board doesn't need a result. Everything else
    // needs every board filled in before it counts as complete.
    let incomplete;
    if (t.variant === "bughouse") {
      const hasDecisive = m.boards.some(
        (bd) => !bd.sitOut && isDecisiveResult(bd.result),
      );
      incomplete = hasDecisive
        ? false
        : m.boards.some((bd) => !bd.sitOut && !bd.result);
    } else {
      incomplete = m.boards.some((bd) => !bd.sitOut && !bd.result);
    }
    if (incomplete) {
      const e = new Error("All boards must have a result");
      e.status = 400;
      throw e;
    }

    const pById = byId(t.players);
    let aPoints = 0,
      bPoints = 0;

    m.boards.forEach((board) => {
      if (board.sitOut || !board.result) return; // Skip abandoned games

      const { wScore, bScore } = applyGame(
        pById,
        board.white.id,
        board.black.id,
        board.result,
      );
      if (board.white.teamId === m.competitorA) {
        aPoints += wScore;
        bPoints += bScore;
      } else {
        aPoints += bScore;
        bPoints += wScore;
      }
    });

    // OVERRIDE: Bughouse match points for brackets
    if (t.variant === "bughouse") {
      const b1 = m.boards[0];
      const b2 = m.boards[1];

      // CompetitorA is "teamWhite" (plays White on board 1)
      const teamAWon =
        (b1 && WHITE_WIN_RESULTS.has(b1.result)) ||
        (b2 && BLACK_WIN_RESULTS.has(b2.result));
      const teamBWon =
        (b1 && BLACK_WIN_RESULTS.has(b1.result)) ||
        (b2 && WHITE_WIN_RESULTS.has(b2.result));

      aPoints = teamAWon ? 1 : teamBWon ? 0 : 0.5;
      bPoints = teamBWon ? 1 : teamAWon ? 0 : 0.5;
    }

    m.result = { aPoints, bPoints };

    if (aPoints !== bPoints) {
      m.winnerId = aPoints > bPoints ? m.competitorA : m.competitorB;
    } else {
      if (payload.winnerOverride !== "A" && payload.winnerOverride !== "B") {
        const e = new Error(
          "Boards are tied — submit winnerOverride ('A' or 'B') to decide who advances",
        );
        e.status = 400;
        throw e;
      }
      m.winnerId =
        payload.winnerOverride === "A" ? m.competitorA : m.competitorB;
    }
    m.loserId = m.winnerId === m.competitorA ? m.competitorB : m.competitorA;

    // Board-level player scores were already applied above via applyGame().
    // Record the match outcome at team level too, the same way the
    // Swiss/round-robin team path does, so team Standings reflects bracket
    // play instead of staying frozen at zero.
    const teamA = t.teams.find((x) => x.id === m.competitorA);
    const teamB = t.teams.find((x) => x.id === m.competitorB);
    if (teamA && teamB) {
      teamA.opponents.add(teamB.id);
      teamB.opponents.add(teamA.id);
      teamA.colorHistory.push("W");
      teamB.colorHistory.push("B");
      teamA.lastColor = "W";
      teamB.lastColor = "B";
      teamA.score += aPoints;
      teamB.score += bPoints;
      teamA.results[teamB.id] = aPoints;
      teamB.results[teamA.id] = bPoints;
    }
  } else {
    if (payload.winner !== "A" && payload.winner !== "B") {
      const e = new Error("winner must be 'A' or 'B'");
      e.status = 400;
      throw e;
    }
    m.winnerId = payload.winner === "A" ? m.competitorA : m.competitorB;
    m.loserId = payload.winner === "A" ? m.competitorB : m.competitorA;
    m.result = payload.winner;

    // Record the result on the competitors themselves too, so individual
    // Standings reflects bracket play (win = 1 point, loss = 0) instead of
    // staying frozen at zero — the bracket topology alone only tracks who
    // advances, not a score.
    const pById = byId(t.players);
    const winner = pById.get(m.winnerId);
    const loser = pById.get(m.loserId);
    if (winner && loser) {
      winner.opponents.add(loser.id);
      loser.opponents.add(winner.id);
      winner.score += 1;
      winner.results[loser.id] = 1;
      loser.results[winner.id] = 0;
    }
  }

  m.status = "complete";
  resolveBracket(t);

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

function getBracket(id) {
  const t = assertTournament(id);
  if (!isEliminationSystem(t)) {
    const e = new Error("This tournament doesn't use a bracket");
    e.status = 400;
    throw e;
  }
  return serializeTournament(t);
}

// Pre-flight roster check for the bughouse variant — lets the frontend warn
// before attempting to generate a round/pairing, rather than surfacing a
// 400 from deep inside board-building. Not applicable outside team+bughouse.
function validateBughouseTeams(id) {
  const t = assertTournament(id);
  if (t.format !== "team" || t.variant !== "bughouse") {
    return { applicable: false, valid: true, issues: [] };
  }
  const { valid, issues } = bughouse.validateBughouseRosters(t.teams);
  return { applicable: true, valid, issues };
}

// ─── Late registration ──────────────────────────────────────────────────────
function addLatePlayer(id, { name, rating, teamId }) {
  const t = assertTournament(id);
  if (isRoundRobinSystem(t)) {
    const e = new Error(
      "Late registration isn't supported for round-robin — the schedule is fixed for the full field before Round 1.",
    );
    e.status = 409;
    throw e;
  }
  if (isEliminationSystem(t)) {
    const e = new Error(
      "Late registration isn't supported for elimination brackets — the draw is fixed for the full field before Round 1.",
    );
    e.status = 409;
    throw e;
  }
  if (t.variant === "bughouse") {
    const e = new Error(
      "Late registration isn't supported for bughouse — every team must stay at exactly 2 players for board pairing to work.",
    );
    e.status = 409;
    throw e;
  }
  if (t.currentRound > 1) {
    const e = new Error("Late registration only allowed during round 1");
    e.status = 409;
    throw e;
  }
  if (!name || !name.trim()) {
    const e = new Error("Name is required");
    e.status = 400;
    throw e;
  }
  if (
    t.players.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  ) {
    const e = new Error("A player with that name already exists");
    e.status = 400;
    throw e;
  }

  const comp = engine.newCompetitor(uid(), Number(rating) || 0);
  comp.name = name.trim();
  comp.startingRank = t.players.length + 1;

  if (t.format === "team") {
    if (!teamId || !t.teams.find((x) => x.id === teamId)) {
      const e = new Error("Valid teamId required for team tournaments");
      e.status = 400;
      throw e;
    }
    comp.teamId = teamId;
    t.teams.find((x) => x.id === teamId).playerIds.push(comp.id);
    t.players.push(comp);
    // Give the new player a personal bye credit for round 1 if a round is already open.
    if (t.currentPairings) ((comp.score += 1), (comp.byeRounds += 1));
  } else {
    t.players.push(comp);
    if (t.currentPairings) {
      comp.score += 1;
      comp.byeRounds += 1;
      t.currentPairings.push({
        type: "bye",
        white: comp.id,
        black: null,
        result: undefined,
      });
    }
  }

  const competitorCount =
    t.format === "team" ? t.teams.length : t.players.length;
  const suggested = engine.suggestedRounds(competitorCount);
  if (suggested > t.totalRounds) t.totalRounds = suggested;

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// ─── Extend tournament (add an extra round after it finished) ─────────────
function addExtraRound(id) {
  const t = assertTournament(id);
  if (isEliminationSystem(t)) {
    const e = new Error(
      "Elimination brackets can't be extended with an extra round — the champion is decided by the bracket.",
    );
    e.status = 409;
    throw e;
  }
  if (t.status !== "finished") {
    const e = new Error("Only finished tournaments can be extended");
    e.status = 409;
    throw e;
  }
  t.totalRounds += 1;
  t.status = "active";
  t.finishedAt = null;
  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// ─── Self-registration links ────────────────────────────────────────────────
// Lets the organizer share a link so players/teams can add themselves,
// instead of the organizer typing every entry in by hand. Reuses the same
// eligibility window as addLatePlayer: round-robin/elimination fields are
// fixed up front, and registration closes once the tournament is past
// Round 1 (mirrors addLatePlayer's own "currentRound > 1" cutoff).

function findByRegistrationToken(token) {
  const t = Object.values(db.tournaments).find(
    (x) => x.registrationToken === token,
  );
  if (!t) {
    const e = new Error("Registration link not found or no longer valid");
    e.status = 404;
    throw e;
  }
  return t;
}

function assertRegistrationWindowOpen(t) {
  if (isRoundRobinSystem(t)) {
    const e = new Error(
      "Registration is closed — this tournament's schedule is fixed for the full field.",
    );
    e.status = 409;
    throw e;
  }
  if (isEliminationSystem(t)) {
    const e = new Error(
      "Registration is closed — this tournament's bracket is fixed for the full field.",
    );
    e.status = 409;
    throw e;
  }
  if (t.currentRound > 1) {
    const e = new Error(
      "Registration is closed — the tournament is already past Round 1.",
    );
    e.status = 409;
    throw e;
  }
}

function enableRegistration(id) {
  const t = assertTournament(id);
  assertRegistrationWindowOpen(t);
  if (!t.registrationToken) t.registrationToken = uid();
  t.registrationOpen = true;
  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

function disableRegistration(id) {
  const t = assertTournament(id);
  t.registrationOpen = false;
  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// Public: what a prospective player sees before filling in the form.
// Deliberately narrow — no arbiter names, no full roster, nothing beyond
// what's needed to identify the event and confirm registration is open.
function getPublicRegistration(token) {
  const t = findByRegistrationToken(token);
  return {
    id: t.id,
    name: t.name,
    federation: t.federation,
    format: t.format,
    variant: t.variant,
    system: t.system,
    timeControl: t.timeControl,
    dateFrom: t.dateFrom,
    dateTo: t.dateTo,
    fideRated: t.fideRated,
    registrationOpen: t.registrationOpen,
    competitorCount: t.format === "team" ? t.teams.length : t.players.length,
  };
}

// Public: submit a registration. Individual tournaments register a single
// player; team tournaments register a whole new team (self-registration
// has no concept of "join an existing team" — that still goes through the
// organizer / addLatePlayer with an explicit teamId).
function submitPublicRegistration(token, payload = {}) {
  const t = findByRegistrationToken(token);
  if (!t.registrationOpen) {
    const e = new Error("Registration is closed for this tournament");
    e.status = 409;
    throw e;
  }
  assertRegistrationWindowOpen(t);

  if (t.format === "team") {
    const { teamName, players = [] } = payload;
    if (!teamName || !teamName.trim()) {
      const e = new Error("Team name is required");
      e.status = 400;
      throw e;
    }
    if (
      t.teams.some(
        (x) => x.name.toLowerCase() === teamName.trim().toLowerCase(),
      )
    ) {
      const e = new Error("A team with that name is already registered");
      e.status = 400;
      throw e;
    }
    if (!Array.isArray(players) || players.length === 0) {
      const e = new Error("Add at least 1 player to your team");
      e.status = 400;
      throw e;
    }
    if (t.variant === "bughouse" && players.length !== 2) {
      const e = new Error("Bughouse requires exactly 2 players per team");
      e.status = 400;
      throw e;
    }
    players.forEach((p) => {
      if (!p.name || !p.name.trim()) {
        const e = new Error("Every player needs a name");
        e.status = 400;
        throw e;
      }
    });

    const teamId = uid();
    const teamPlayers = players.map((p) => {
      const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
      comp.name = p.name.trim();
      comp.teamId = teamId;
      comp.startingRank = t.players.length + 1;
      return comp;
    });
    const avgRating = Math.round(
      teamPlayers.reduce((s, p) => s + p.rating, 0) / teamPlayers.length,
    );
    const team = {
      id: teamId,
      name: teamName.trim(),
      rating: avgRating,
      score: 0,
      colorDiff: 0,
      lastColor: null,
      colorHistory: [],
      opponents: new Set(),
      results: {},
      byeRounds: 0,
      playerIds: teamPlayers.map((p) => p.id),
      startingRank: t.teams.length + 1,
    };
    t.teams.push(team);
    t.players.push(...teamPlayers);

    const suggested = engine.suggestedRounds(t.teams.length);
    if (suggested > t.totalRounds) t.totalRounds = suggested;

    t.updatedAt = new Date().toISOString();
    persist();
    return { ok: true, teamId: team.id, teamName: team.name };
  }

  // Individual format
  const { name, rating } = payload;
  if (!name || !name.trim()) {
    const e = new Error("Name is required");
    e.status = 400;
    throw e;
  }
  if (
    t.players.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  ) {
    const e = new Error("A player with that name is already registered");
    e.status = 400;
    throw e;
  }
  const comp = engine.newCompetitor(uid(), Number(rating) || 0);
  comp.name = name.trim();
  comp.startingRank = t.players.length + 1;
  t.players.push(comp);
  if (t.currentPairings) {
    comp.score += 1;
    comp.byeRounds += 1;
    t.currentPairings.push({
      type: "bye",
      white: comp.id,
      black: null,
      result: undefined,
    });
  }

  const suggested = engine.suggestedRounds(t.players.length);
  if (suggested > t.totalRounds) t.totalRounds = suggested;

  t.updatedAt = new Date().toISOString();
  persist();
  return { ok: true, playerId: comp.id, name: comp.name };
}

// ─── Public results links ───────────────────────────────────────────────────
// A second, separate shareable link from registration — this one is
// read-only and has no eligibility window, since spectators should be able
// to check pairings/standings at any point in the event (before, during, or
// after), unlike registration which only makes sense before Round 1.
//
// Elimination brackets aren't wired up here yet — t.rounds/t.currentPairings
// stay empty for those systems (see generateNextRound), so there'd be
// nothing meaningful to show. Bracket sharing is a separate follow-up.

function assertPublicViewSupported(t) {}

function findByPublicViewToken(token) {
  const t = Object.values(db.tournaments).find(
    (x) => x.publicViewToken === token,
  );
  if (!t) {
    const e = new Error("This results link isn't valid or has been removed");
    e.status = 404;
    throw e;
  }
  return t;
}

function enablePublicView(id) {
  const t = assertTournament(id);
  assertPublicViewSupported(t);
  if (!t.publicViewToken) t.publicViewToken = uid();
  t.publicViewOpen = true;
  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

function disablePublicView(id) {
  const t = assertTournament(id);
  t.publicViewOpen = false;
  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// Public: pairings for every round plus current standings. Reuses
// serializeTournament() wholesale rather than re-deriving standings/rounds/
// cross-table logic a second time, then narrows the result down to what a
// spectator should see — no organizer contact details, no edit-relevant
// fields, no registration token.
function getPublicResults(token) {
  const t = findByPublicViewToken(token);
  if (!t.publicViewOpen) {
    const e = new Error("Results aren't public for this tournament right now");
    e.status = 403;
    throw e;
  }
  const full = serializeTournament(t);
  return {
    id: full.id,
    name: full.name,
    federation: full.federation,
    format: full.format,
    variant: full.variant,
    system: full.system,
    timeControl: full.timeControl,
    dateFrom: full.dateFrom,
    dateTo: full.dateTo,
    status: full.status,
    currentRound: full.currentRound,
    totalRounds: full.totalRounds,
    currentPairings: full.currentPairings,
    rounds: full.rounds,
    standings: full.standings,
    teamStandings: full.teamStandings,
    crossTable: full.crossTable,
    bracket: full.bracket,
    winner: full.winner,
  };
}

// Public: a browsable list for spectators — now open to ALL tournaments
// regardless of whether publicViewOpen is set.
function listPublicTournaments() {
  return (
    Object.values(db.tournaments)
      // Removed the t.publicViewOpen && t.publicViewToken filter so everything goes through
      .map((t) => {
        const full = serializeTournament(t);
        return {
          id: full.id, // Added internal ID for safety/flexibility
          name: full.name,
          federation: full.federation,
          format: full.format,
          variant: full.variant, // Useful if "real vs fake" is determined by a variant
          system: full.system,
          status: full.status,
          currentRound: full.currentRound,
          totalRounds: full.totalRounds,
          competitorCount:
            full.format === "team" ? full.teams.length : full.players.length,
          winner: full.winner,
          // Fallback to the tournament ID if a public token wasn't explicitly generated
          publicViewToken: full.publicViewToken || full.id,
          updatedAt: t.updatedAt,

          // NOTE: If you have an explicit property for "real or fake" tournaments
          // (e.g., t.isTesting or t.isFake), uncomment the line below to pass it to the frontend:
          // isFake: t.isFake,
        };
      })
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
  );
}

function updateTournamentDetails(id, updates = {}) {
  const t = assertTournament(id);

  if (updates.name !== undefined) {
    if (!updates.name.trim()) {
      const e = new Error("Tournament name is required");
      e.status = 400;
      throw e;
    }
    t.name = updates.name.trim();
  }
  if (updates.federation !== undefined) t.federation = updates.federation;
  if (updates.timeControl !== undefined) t.timeControl = updates.timeControl;
  if (updates.variant !== undefined) t.variant = updates.variant;

  if (updates.totalRounds !== undefined) {
    if (t.status === "finished") {
      const e = new Error(
        'Cannot change total rounds on a finished tournament — use "Add Extra Round" instead',
      );
      e.status = 409;
      throw e;
    }
    if (isRoundRobinSystem(t)) {
      const e = new Error(
        "Total rounds is fixed by the round-robin schedule and can't be edited directly.",
      );
      e.status = 400;
      throw e;
    }
    if (isEliminationSystem(t)) {
      const e = new Error(
        "Total rounds is fixed by the bracket and can't be edited directly.",
      );
      e.status = 400;
      throw e;
    }
    const n = Number(updates.totalRounds);
    if (!n || n < t.currentRound) {
      const e = new Error(
        `Total rounds must be at least the current round (${t.currentRound})`,
      );
      e.status = 400;
      throw e;
    }
    t.totalRounds = n;
  }

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

function deleteTournament(id) {
  assertTournament(id);
  delete db.tournaments[id];
  persist();
}

// ─── Reads / serialization ──────────────────────────────────────────────────
function listTournaments() {
  return Object.values(db.tournaments)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((t) => {
      const winner = t.status === "finished" ? computeWinner(t) : null;
      return {
        id: t.id,
        name: t.name,
        federation: t.federation,
        format: t.format,
        variant: t.variant,
        timeControl: t.timeControl,
        status: t.status,
        currentRound: t.currentRound,
        totalRounds: t.totalRounds,
        competitorCount:
          t.format === "team" ? t.teams.length : t.players.length,
        createdAt: t.createdAt,
        finishedAt: t.finishedAt,
        winner,
      };
    });
}

function computeWinner(t) {
  if (isEliminationSystem(t)) {
    if (!t.bracket || !t.bracket.champion) return null;
    return t.format === "team"
      ? t.teams.find((x) => x.id === t.bracket.champion)?.name || null
      : t.players.find((p) => p.id === t.bracket.champion)?.name || null;
  }
  if (t.format === "team") {
    const standings = engine.sortedStandings(t.teams.map(teamCompetitor));
    const top = standings[0];
    return top ? t.teams.find((x) => x.id === top.id).name : null;
  }
  const standings = engine.sortedStandings(t.players);
  const top = standings[0];
  return top ? top.name : null;
}

function getTournament(id) {
  const t = assertTournament(id);
  return serializeTournament(t);
}

// Returns { buffer, filename } — kept separate from getTournament since this
// one produces a binary payload, not JSON, so the route handles it
// differently (no res.json wrap).
async function exportStandingsWorkbook(id) {
  const t = assertTournament(id);
  const serialized = serializeTournament(t);
  const buffer = await excelExport.buildStandingsWorkbook(serialized);
  const slug =
    t.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tournament";
  return { buffer, filename: `${slug}-standings.xlsx` };
}

function serializeBracket(t) {
  if (!t.bracket) return null;
  const nameOf = (id) => {
    if (id == null) return null;
    return t.format === "team"
      ? t.teams.find((x) => x.id === id)?.name || "???"
      : t.players.find((p) => p.id === id)?.name || "???";
  };
  return {
    size: t.bracket.size,
    wbRounds: t.bracket.wbRounds,
    lbRounds: t.bracket.lbRounds,
    grandFinalId: t.bracket.grandFinalId,
    grandFinalResetId: t.bracket.grandFinalResetId,
    champion: t.bracket.champion
      ? { id: t.bracket.champion, name: nameOf(t.bracket.champion) }
      : null,
    seeds: t.bracket.seeds.map((s) => ({
      seed: s.seed,
      id: s.id,
      name: s.name,
    })),
    matches: t.bracket.matches.map((m) => ({
      id: m.id,
      bracket: m.bracket, // 'W' | 'L' | 'GF'
      round: m.round,
      status: m.status, // pending | ready | bye | complete | skipped
      slotA: m.slotA || null,
      slotB: m.slotB || null,
      competitorA:
        m.competitorA != null
          ? { id: m.competitorA, name: nameOf(m.competitorA) }
          : null,
      competitorB:
        m.competitorB != null
          ? { id: m.competitorB, name: nameOf(m.competitorB) }
          : null,
      winnerId: m.winnerId,
      loserId: m.loserId,
      winnerTo: m.winnerTo || null,
      loserTo: m.loserTo || null,
      result: m.result,
      boards:
        t.format === "team" && m.boards
          ? m.boards.map((b) => ({
              boardNum: b.boardNum,
              sitOut: !!b.sitOut,
              white: b.white
                ? { id: b.white.id, name: b.white.name, teamId: b.white.teamId }
                : null,
              black: b.black
                ? { id: b.black.id, name: b.black.name, teamId: b.black.teamId }
                : null,
              result: b.result,
            }))
          : null,
    })),
  };
}

function serializeTournament(t) {
  const playersOut = t.players.map((p) => ({
    id: p.id,
    name: p.name,
    rating: p.rating,
    score: p.score,
    teamId: p.teamId || null,
    byeRounds: p.byeRounds,
    startingRank: p.startingRank,
  }));

  const nameOf = (id) => t.players.find((p) => p.id === id)?.name || "???";
  const teamNameOf = (id) => t.teams.find((x) => x.id === id)?.name || "???";

  const currentPairings = t.currentPairings
    ? t.currentPairings.map((p, idx) => {
        if (t.format === "team") {
          if (p.type === "bye")
            return {
              idx,
              type: "bye",
              teamId: p.team,
              teamName: teamNameOf(p.team),
            };
          return {
            idx,
            type: "match",
            teamWhiteId: p.teamWhite,
            teamWhiteName: teamNameOf(p.teamWhite),
            teamBlackId: p.teamBlack,
            teamBlackName: teamNameOf(p.teamBlack),
            boards: p.boards.map((b) => ({
              boardNum: b.boardNum,
              sitOut: !!b.sitOut,
              white: b.white
                ? { id: b.white.id, name: b.white.name, rating: b.white.rating }
                : null,
              black: b.black
                ? { id: b.black.id, name: b.black.name, rating: b.black.rating }
                : null,
              result: b.result,
            })),
          };
        }
        if (p.type === "bye")
          return {
            idx,
            type: "bye",
            playerId: p.white,
            playerName: nameOf(p.white),
          };
        return {
          idx,
          type: "individual",
          whiteId: p.white,
          whiteName: nameOf(p.white),
          blackId: p.black,
          blackName: nameOf(p.black),
          result: p.result,
        };
      })
    : null;

  let standings,
    teamStandings = null,
    crossTable = null;
  const remainingRounds = Math.max(t.totalRounds - t.rounds.length, 0);

  if (t.format === "team") {
    const teamComps = t.teams.map(teamCompetitor);
    const sortedTeams = engine.sortedStandings(teamComps);
    const teamByIdMap = byId(t.teams);
    const leaderScore = sortedTeams.length ? sortedTeams[0].score : 0;
    teamStandings = sortedTeams.map((c) => {
      const team = teamByIdMap.get(c.id);
      const byIdMap = byId(teamComps);
      const maxGainPerRound = Math.max(team.playerIds.length, 1);
      const inContention =
        c.score + remainingRounds * maxGainPerRound >= leaderScore;
      return {
        id: team.id,
        name: team.name,
        score: engine.formatScore(c.score),
        inContention,
        buchholz: inContention ? engine.buchholz(c, byIdMap).toFixed(1) : null,
        sb: inContention
          ? engine.sonnenbornBerger(c, byIdMap).toFixed(2)
          : null,
        playerCount: team.playerIds.length,
      };
    });
    // Individual board standings within the team event.
    const sortedPlayers = engine.sortedStandings(t.players);
    standings = sortedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      rating: p.rating,
      teamId: p.teamId,
      teamName: teamNameOf(p.teamId),
      score: engine.formatScore(p.score),
    }));
    crossTable = buildCrossTable(
      sortedTeams,
      t.teams.map((x) => x.id),
      t.teams,
    );
  } else {
    const sortedPlayers = engine.sortedStandings(t.players);
    const byIdMap = byId(t.players);
    const leaderScore = sortedPlayers.length ? sortedPlayers[0].score : 0;
    standings = sortedPlayers.map((p) => {
      const inContention = p.score + remainingRounds >= leaderScore;
      return {
        id: p.id,
        name: p.name,
        rating: p.rating,
        score: engine.formatScore(p.score),
        inContention,
        buchholz: inContention ? engine.buchholz(p, byIdMap).toFixed(1) : null,
        sb: inContention
          ? engine.sonnenbornBerger(p, byIdMap).toFixed(2)
          : null,
      };
    });
    crossTable = buildCrossTable(
      sortedPlayers,
      t.players.map((x) => x.id),
      t.players,
    );
  }

  const rounds = t.rounds.map((rr) => ({
    round: rr.round,
    chess960: rr.chess960 || null,
    pairings: rr.pairings.map((p) => {
      if (t.format === "team") {
        if (p.type === "bye")
          return { type: "bye", teamId: p.team, teamName: teamNameOf(p.team) };
        return {
          type: "match",
          teamWhiteId: p.teamWhite,
          teamWhiteName: teamNameOf(p.teamWhite),
          teamBlackId: p.teamBlack,
          teamBlackName: teamNameOf(p.teamBlack),
          whitePoints: p.whitePoints,
          blackPoints: p.blackPoints,
          boards: p.boards.map((b) =>
            b.sitOut
              ? {
                  boardNum: b.boardNum,
                  sitOut: true,
                  playerId: b.player,
                  playerName: nameOf(b.player),
                }
              : {
                  boardNum: b.boardNum,
                  whiteId: b.white,
                  whiteName: nameOf(b.white),
                  blackId: b.black,
                  blackName: nameOf(b.black),
                  result: b.result,
                },
          ),
        };
      }
      if (p.type === "bye")
        return { type: "bye", playerId: p.white, playerName: nameOf(p.white) };
      return {
        type: "individual",
        whiteId: p.white,
        whiteName: nameOf(p.white),
        blackId: p.black,
        blackName: nameOf(p.black),
        result: p.result,
      };
    }),
  }));

  const startingRankList =
    t.format === "team"
      ? [...t.teams]
          .sort(
            (a, b) =>
              (a.startingRank ?? Infinity) - (b.startingRank ?? Infinity),
          )
          .map((x) => ({
            rank: x.startingRank,
            id: x.id,
            name: x.name,
            rating: x.rating,
            players: t.players
              .filter((p) => p.teamId === x.id)
              .sort(
                (a, b) =>
                  (a.startingRank ?? Infinity) - (b.startingRank ?? Infinity),
              )
              .map((p) => ({
                id: p.id,
                name: p.name,
                rating: p.rating,
                startingRank: p.startingRank,
              })),
          }))
      : [...t.players]
          .sort(
            (a, b) =>
              (a.startingRank ?? Infinity) - (b.startingRank ?? Infinity),
          )
          .map((p) => ({
            rank: p.startingRank,
            id: p.id,
            name: p.name,
            rating: p.rating,
          }));

  return {
    id: t.id,
    name: t.name,
    federation: t.federation,
    format: t.format,
    variant: t.variant,
    system: t.system,
    timeControl: t.timeControl,
    totalRounds: t.totalRounds,
    currentRound: t.currentRound,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    finishedAt: t.finishedAt,
    players: playersOut,
    teams: t.teams.map((x) => ({
      id: x.id,
      name: x.name,
      playerIds: x.playerIds,
      score: engine.formatScore(x.score),
      startingRank: x.startingRank,
    })),
    currentPairings,
    standings,
    teamStandings,
    crossTable,
    rounds,
    startingRankList,
    bracket: serializeBracket(t),
    winner: t.status === "finished" ? computeWinner(t) : null,
    chess960: t.chess960,
    currentChess960: t.currentChess960,
    registrationOpen: t.registrationOpen,
    registrationToken: t.registrationToken,
    publicViewOpen: t.publicViewOpen,
    publicViewToken: t.publicViewToken,
  };
}

function buildCrossTable(sortedComps, allIds, entities) {
  const nameOf = (id) => entities.find((e) => e.id === id)?.name || "???";
  return sortedComps.map((c, ri) => ({
    rank: ri + 1,
    id: c.id,
    name: nameOf(c.id),
    score: engine.formatScore(c.score),
    results: sortedComps.map((opp) => {
      if (opp.id === c.id) return { self: true };
      if (Object.prototype.hasOwnProperty.call(c.results, opp.id)) {
        const r = c.results[opp.id];
        return { value: r === 1 ? "1" : r === 0 ? "0" : "½", raw: r };
      }
      return { value: "·" };
    }),
  }));
}

// Returns the fixed round-robin schedule for a tournament, with seed indices
// mapped to real competitor {id, name} pairs — same mapping convention as
// roundRobinPairsForRound(), just for the whole schedule instead of one round.
function tournamentRoundRobinSchedule(id, kind) {
  const t = assertTournament(id);
  if (!isRoundRobinSystem(t)) {
    const e = new Error(
      `Tournament system is "${t.system}", not round_robin/double_round_robin`,
    );
    e.status = 400;
    throw e;
  }
  const seeds = seedList(t);
  const schedule =
    kind === "double"
      ? roundRobin.doubleRoundRobinSchedule(seeds.length)
      : roundRobin.singleRoundRobinSchedule(seeds.length);

  return schedule.map((round, idx) => ({
    round: idx + 1,
    pairings: round.map((pair) =>
      "bye" in pair
        ? { bye: { id: seeds[pair.bye].id, name: seeds[pair.bye].name } }
        : {
            home: { id: seeds[pair.home].id, name: seeds[pair.home].name },
            away: { id: seeds[pair.away].id, name: seeds[pair.away].name },
          },
    ),
  }));
}

// Number of rounds the schedule will run for this tournament's current
// system and competitor count.
function tournamentScheduleLength(id) {
  const t = assertTournament(id);
  if (!isRoundRobinSystem(t)) {
    const e = new Error(
      `Tournament system is "${t.system}", not round_robin/double_round_robin`,
    );
    e.status = 400;
    throw e;
  }
  const n = seedList(t).length;
  return { rounds: roundRobin.scheduleLength(n, t.system) };
}

module.exports = {
  createTournament,
  generateNextRound,
  submitResults,
  addLatePlayer,
  addExtraRound,
  updateTournamentDetails,
  deleteTournament,
  listTournaments,
  getTournament,
  submitBracketMatchResult,
  getBracket,
  validateBughouseTeams,
  enableRegistration,
  disableRegistration,
  getPublicRegistration,
  submitPublicRegistration,
  enablePublicView,
  disablePublicView,
  getPublicResults,
  listPublicTournaments,
  exportStandingsWorkbook,
  singleRoundRobinSchedule: roundRobin.singleRoundRobinSchedule,
  doubleRoundRobinSchedule: roundRobin.doubleRoundRobinSchedule,
  scheduleLength: roundRobin.scheduleLength,
  singleEliminationBracket: bracketEngine.singleEliminationBracket,
  doubleEliminationBracket: bracketEngine.doubleEliminationBracket,
  tournamentRoundRobinSchedule,
  tournamentScheduleLength,
};
