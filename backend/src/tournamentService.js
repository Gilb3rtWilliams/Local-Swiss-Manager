const crypto = require("crypto");
const engine = require("./swissEngine");
const store = require("./store");
const roundRobin = require("./roundRobin");
const bracketEngine = require("./bracket");
const bughouse = require("./bughouse");
const chess960 = require("./chess960");
const excelExport = require("./excelExport");
const { title } = require("process");

// `db` used to be populated synchronously at require-time via
// `store.load()`, because reading a local file is synchronous. A Postgres
// read isn't — so `db` starts empty and gets populated by init(), which the
// server's entrypoint must call (and await) once before app.listen(...).
// Every exported function below still just reads/writes this same `db`
// object exactly as before; nothing about the pairing/Swiss/bracket logic
// changes, only when the object gets filled in.
let db = { tournaments: {} };

async function persist() {
  await store.save(db);
}

// Migrate tournaments saved before the starting-rank feature existed, and
// separately, before the Chess960 feature existed. Wrapped defensively so
// one malformed legacy record can never prevent the server from starting —
// worst case that one tournament is skipped and logged. Returns whether
// anything changed, so init() knows whether a persist() is needed.
function runLegacyMigrations() {
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
      if (t.chess960 === undefined) {
        // Tournament predates the Chess960 toggle existing at all — there's
        // no reasonable way to know what the organizer would have chosen,
        // so default to off (matches createTournament's own default)
        // rather than silently turning it on for an event that was never
        // set up for it.
        t.chess960 = false;
        migrated = true;
      }
      if (t.currentChess960 === undefined) {
        t.currentChess960 = null;
        migrated = true;
      }
      if (t.thirdPlaceMatch === undefined) {
        // Tournament predates this feature — its bracket (if already built)
        // has no thirdPlaceMatchId either, which every read site already
        // treats as "no third-place match", so defaulting the flag off here
        // is enough; no bracket-rebuild needed.
        t.thirdPlaceMatch = false;
        migrated = true;
      }
    } catch (err) {
      console.error(
        `Starting-rank migration failed for tournament ${t.id} (${t.name}):`,
        err.message,
      );
    }
  });
  return migrated;
}

// Call once from the server entrypoint, before app.listen(...):
//   const tournamentService = require("./tournamentService");
//   await tournamentService.init();
//   app.listen(PORT, ...);
async function init() {
  db = await store.load();
  if (runLegacyMigrations()) await persist();
}

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
      ? // No third-place match for double elimination — see bracket.js's
        // doubleEliminationBracket() for why one isn't a natural fit there.
        bracketEngine.doubleEliminationBracket(n)
      : bracketEngine.singleEliminationBracket(n, {
          thirdPlaceMatch: !!t.thirdPlaceMatch,
        });

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
    thirdPlaceMatchId: topology.thirdPlaceMatchId ?? null,
    matches,
    seeds: seeds.map((c, i) => ({ seed: i, id: c.id, name: c.name })),
    champion: null,
    thirdPlace: null,
    roundChess960: {}, // keyed "<bracket><round>" e.g. "W1", "L2", "GF1" — see activateMatch
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
// Also assigns this match's Chess960 starting position when the feature is
// on. Brackets don't have a single synchronous "round" the way Swiss/
// round-robin does (t.currentChess960 assumes exactly one open round at a
// time), so instead every match shares one position per (bracket branch,
// round) tier — e.g. every Winners-bracket Round 1 match gets the same
// position, every Losers-bracket Round 2 match gets its own shared one, the
// Grand Final gets its own, etc. The position for a tier is rolled the
// first time any match in it activates, then reused for every other match
// in that same tier as it activates later.
function activateMatch(t, m) {
  m.status = "ready";
  if (t.chess960) {
    if (!t.bracket.roundChess960) t.bracket.roundChess960 = {};
    // The Grand Final and the third-place playoff are both effectively the
    // event's final round, decided at the same time — they should share one
    // position rather than each rolling its own, even though they carry
    // different internal bracket/round tags (the third-place match isn't
    // part of the "W" bracket's own round numbering, so it would otherwise
    // land in a different tier than the final it's paired with).
    const isFinalsPairing =
      m.id === t.bracket.grandFinalId || m.id === t.bracket.thirdPlaceMatchId;
    const tierKey = isFinalsPairing ? "FINALS" : `${m.bracket}${m.round}`;
    if (!t.bracket.roundChess960[tierKey]) {
      t.bracket.roundChess960[tierKey] = chess960.randomChess960Position();
    }
    m.chess960 = t.bracket.roundChess960[tierKey];
  }
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

  // Record the 3rd-place result as soon as it's known, independent of
  // whether the final itself is done yet — the two can be played in either
  // order. "bye" counts as decided too (e.g. one semifinal was itself a bye,
  // so its "loser" slot never had a real competitor).
  if (b.thirdPlaceMatchId) {
    const tp = bracketMatchById(t, b.thirdPlaceMatchId);
    if (tp && (tp.status === "complete" || tp.status === "bye")) {
      b.thirdPlace = tp.winnerId;
    }
  }

  if (t.system === "single_elimination") {
    const final = b.matches.find((m) => m.bracket === "W" && !m.winnerTo);
    // Don't call the tournament finished until the 3rd-place match (if one
    // exists) has also reached a decided state — otherwise a champion could
    // be crowned while a required match is still sitting there unplayed.
    const thirdPlaceDone =
      !b.thirdPlaceMatchId ||
      ["complete", "bye", "skipped"].includes(
        bracketMatchById(t, b.thirdPlaceMatchId)?.status,
      );
    if (final && final.status === "complete" && thirdPlaceDone) {
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

// ─── Constants & Validation ─────────────────────────────────────────────────
const VALID_SYSTEMS = [
  "swiss",
  "round_robin",
  "double_round_robin",
  "single_elimination",
  "double_elimination",
];

const VALID_SCORING_SYSTEMS = ["standard", "3-1-0", "double_round"];
const VALID_RATING_TYPES = ["standard", "rapid", "blitz"];

const DEFAULT_TIEBREAKS = [
  "buchholz_cut1",
  "buchholz",
  "sonneborn_berger",
  "direct_encounter",
  "wins",
];

// ─── Create Tournament ──────────────────────────────────────────────────────
async function createTournament(input) {
  const {
    // Core Identity
    name,
    description = "",
    category = "Open", // e.g., 'Open', 'U18', 'Women', 'Seniors'
    venue = "", // Physical location or 'Online'
    federation = "",

    // System & Rules
    format = "individual", // 'individual' | 'team'
    variant = "standard", // 'standard' | 'bughouse' | 'league'
    system = "swiss",
    // scoringSystem and ratingType are accepted, validated, and stored
    // below, but NOT YET enforced anywhere else in the app — scoreFromResult()
    // always scores 1/0.5/0 regardless of scoringSystem. Selecting anything
    // other than the default there currently changes what's *displayed*,
    // not what's *computed*. Treat that one as reserved for a follow-up.
    //
    // tiebreaks, by contrast, now IS enforced: swissEngine.js's
    // sortedStandings() runs the fixed cascade score -> Buchholz Cut-1 ->
    // Buchholz -> Sonneborn-Berger -> direct encounter (2-player ties only,
    // since head-to-head isn't transitive across 3+) -> number of wins.
    // That cascade order is hard-coded to match DEFAULT_TIEBREAKS below —
    // this field doesn't yet let an organizer reorder or drop individual
    // criteria, it's just recorded as-is for display/export.
    scoringSystem = "standard", // 'standard' (1/0.5/0) | '3-1-0' | 'double_round'
    ratingType = "standard", // 'standard' | 'rapid' | 'blitz'
    timeControl = "",
    tiebreaks = DEFAULT_TIEBREAKS,
    totalRounds,

    // Byes & Governance — same caveat: accepted and stored, not yet read by
    // the bye-assignment logic in swissEngine.js's generatePairings().
    maxHalfPointByes = 2,
    byeCutoffRound = null, // e.g., no byes allowed in the final 2 rounds

    // Participants
    players = [],
    teams = [],

    // Officials & Contacts
    organizerName = "",
    organizerContact = "", // Phone or email for public listings
    chiefArbiter = "",
    deputyChiefArbiter = "",

    // Dates & Flags
    dateFrom = "",
    dateTo = "",
    fideRated = false,
    isTest = false,
    chess960: chess960Enabled = false,
    // Only meaningful for system === "single_elimination" — see
    // buildBracketState()/bracket.js for why double elimination doesn't
    // get one. Harmless (just unused) to pass for any other system.
    thirdPlaceMatch = false,
  } = input;

  // 1. Strict Input Validation
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
  if (!VALID_SCORING_SYSTEMS.includes(scoringSystem)) {
    const e = new Error(`Invalid scoring system "${scoringSystem}"`);
    e.status = 400;
    throw e;
  }
  if (fideRated && !VALID_RATING_TYPES.includes(ratingType)) {
    const e = new Error(`Invalid FIDE rating type "${ratingType}"`);
    e.status = 400;
    throw e;
  }
  if (dateFrom && dateTo && dateTo < dateFrom) {
    const e = new Error("End date can't be before start date");
    e.status = 400;
    throw e;
  }

  // 2. Tournament Object Initialization
  const t = {
    id: uid(),
    name: name.trim(),
    description: description.trim(),
    category: category.trim(),
    venue: venue.trim(),
    federation: federation.trim(),

    format, // 'individual' | 'team'
    variant, // 'standard' | 'bughouse' | 'league'
    system, // 'swiss' | 'round_robin' | 'double_round_robin' | 'single_elimination' | 'double_elimination'
    scoringSystem, // reserved — see caveat above, not yet enforced
    ratingType,
    timeControl: timeControl.trim(),
    tiebreaks: Array.isArray(tiebreaks) ? tiebreaks : DEFAULT_TIEBREAKS, // reserved — see caveat above

    maxHalfPointByes: Number.isInteger(maxHalfPointByes) ? maxHalfPointByes : 2, // reserved — see caveat above
    byeCutoffRound: Number.isInteger(byeCutoffRound) ? byeCutoffRound : null, // reserved — see caveat above

    organizerName: organizerName.trim(),
    organizerContact: organizerContact.trim(),
    chiefArbiter: chiefArbiter.trim(),
    deputyChiefArbiter: deputyChiefArbiter.trim(),

    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    fideRated: Boolean(fideRated),
    isTest: Boolean(isTest),
    chess960: Boolean(chess960Enabled),
    currentChess960: null, // set by generateNextRound when chess960 is on
    thirdPlaceMatch: Boolean(thirdPlaceMatch), // read by buildBracketState() at creation time, below

    registrationOpen: false,
    registrationToken: null,
    publicViewOpen: false,
    publicViewToken: null,

    totalRounds: null,
    currentRound: 0,
    status: "setup", // 'setup' | 'active' | 'finished' — matches computeWinner(),
    // finalizeBracketIfDone(), and every frontend status check elsewhere in
    // the app. Do NOT introduce "completed" as a status value; nothing else
    // in the codebase checks for it, and a tournament left un-finalized
    // because of a status-string mismatch is a silent, hard-to-notice bug.
    players: [],
    teams: [],
    rounds: [],
    currentPairings: null,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
  };

  // 3. Competitor Processing (Team vs Individual)
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
        comp.title = p.title ? p.title.trim() : null;
        comp.fideId = p.fideId ? String(p.fideId).trim() : null;
        comp.teamId = teamId;
        comp.status = "active"; // scaffolding for a future withdrawal feature — nothing reads this yet, but nothing breaks by it being here either
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
        status: "active", // same scaffolding note as above
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
      comp.title = p.title ? p.title.trim() : null;
      comp.fideId = p.fideId ? String(p.fideId).trim() : null;
      comp.status = "active"; // same scaffolding note as above
      t.players.push(comp);
    });
  }

  // 4. Schedule Length & Seeding
  const competitorCount = format === "team" ? t.teams.length : t.players.length;
  t.totalRounds = isRoundRobinSystem(t)
    ? roundRobin.scheduleLength(competitorCount, system)
    : totalRounds && totalRounds > 0
    ? Number(totalRounds)
    : engine.suggestedRounds(competitorCount);

  // Initial rank assignment (locked in once t.status switches to 'active')
  assignStartingRanks(t.players);
  if (format === "team") assignStartingRanks(t.teams);

  // 5. Immediate Bracket Generation for Elimination Events
  if (isEliminationSystem(t)) {
    // The full bracket is known the moment seeding is set — draw it now
    // rather than waiting for a "generate round" click, and resolve any
    // immediate byes so Round 1 is ready to view/play right away.
    buildBracketState(t);
    t.totalRounds = t.bracket.wbRounds + t.bracket.lbRounds + 1; // +1 for the Grand Final (reset match isn't guaranteed)
    t.currentRound = 1;
    t.status = "active";
  }

  // 6. Persist and Return
  db.tournaments[t.id] = t;
  await persist();
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
async function generateNextRound(id, updates = {}) {
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

    // Apply Targeted Name Changes (Permitted at any time)
    // Expects frontend to send: updates.nameEdits = [{ id: "player-123", newName: "John Doe" }]
    if (updates.nameEdits && Array.isArray(updates.nameEdits)) {
      updates.nameEdits.forEach((edit) => {
        // 1. Update in the main players array
        const player = t.players.find((p) => p.id === edit.id);
        if (player) {
          if (edit.newName !== undefined) player.name = edit.newName;
          if (edit.newTitle !== undefined) player.title = edit.newTitle;
        }

        // 2. If this is a team tournament, also update the name inside the team's roster array
        if (t.format === "team" && t.teams) {
          t.teams.forEach((team) => {
            const teamMember = team.players.find((p) => p.id === edit.id);
            if (teamMember) {
              if (edit.newName !== undefined) teamMember.name = edit.newName;
              if (edit.newTitle !== undefined) teamMember.title = edit.newTitle;
            }
          });
        }
      });
    }
  }

  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

// ─── Manual round pairing ────────────────────────────────────────────────
// Alternative to generateNextRound()'s algorithmic pairing: the organizer
// specifies exactly who plays whom (and optionally who's White) themselves.
// Deliberately unconstrained beyond basic structural validity — no
// rematch/no-repeat-opponent check, no color-balance enforcement. The whole
// point of a manual override is organizer discretion; the automatic pairing
// path already exists for anyone who wants those constraints enforced.
//
// Same preconditions as generateNextRound() (open round must be closed
// first, tournament can't already be finished, elimination brackets are
// out of scope entirely — those submit results match-by-match through the
// bracket, there's no "round" here to pair by hand).
//
// payload shape:
//   {
//     pairs: [{ aId, bId, color? }],  // color: "aWhite" | "bWhite" | omit to auto-assign
//     byeId?: <competitor id>,        // required iff the field is odd
//   }
// aId/bId/byeId are player ids for individual tournaments, team ids for
// team tournaments (including bughouse — buildTeamBoards() below handles
// the board cross-pairing exactly like the automatic path does once it
// knows which team is White for the match).
function resolveManualColors(a, b, colorChoice) {
  if (colorChoice === "aWhite") return { white: a, black: b };
  if (colorChoice === "bWhite") return { white: b, black: a };
  // No explicit choice — fall back to the same fairness-aware assignment
  // (color-history/color-debt aware) the automatic pairing path uses.
  return engine.assignColors(a, b);
}

async function generateManualRound(id, payload = {}) {
  const t = assertTournament(id);
  if (isEliminationSystem(t)) {
    const e = new Error(
      "This is a bracket tournament — results are submitted match-by-match via the bracket. Manual round pairing isn't available here.",
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

  const isTeam = t.format === "team";
  const pool = isTeam ? t.teams : t.players;
  const byId = new Map(pool.map((c) => [c.id, c]));

  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
  const byeId = payload.byeId || null;

  const nameOfEntry = (cid) => byId.get(cid)?.name || cid;

  // ── Structural validation: every competitor accounted for exactly once ──
  const seen = new Set();
  pairs.forEach((pr, i) => {
    if (!pr || !pr.aId || !pr.bId) {
      const e = new Error(`Pair ${i + 1} is missing a competitor`);
      e.status = 400;
      throw e;
    }
    if (pr.aId === pr.bId) {
      const e = new Error(
        `Pair ${i + 1} pairs "${nameOfEntry(pr.aId)}" against themselves`,
      );
      e.status = 400;
      throw e;
    }
    [pr.aId, pr.bId].forEach((cid) => {
      if (!byId.has(cid)) {
        const e = new Error(`Unknown competitor id "${cid}"`);
        e.status = 400;
        throw e;
      }
      if (seen.has(cid)) {
        const e = new Error(
          `"${nameOfEntry(cid)}" appears more than once in the manual pairings`,
        );
        e.status = 400;
        throw e;
      }
      seen.add(cid);
    });
  });

  if (byeId) {
    if (!byId.has(byeId)) {
      const e = new Error(`Unknown competitor id "${byeId}" for the bye`);
      e.status = 400;
      throw e;
    }
    if (seen.has(byeId)) {
      const e = new Error("The bye competitor can't also appear in a pair");
      e.status = 400;
      throw e;
    }
    seen.add(byeId);
  }

  const missing = pool.filter((c) => !seen.has(c.id));
  if (missing.length > 0) {
    const e = new Error(
      `${
        missing.length
      } competitor(s) aren't paired or assigned a bye: ${missing
        .map((c) => c.name)
        .join(", ")}`,
    );
    e.status = 400;
    throw e;
  }
  if (pool.length % 2 === 0 && byeId) {
    const e = new Error(
      "There's an even number of competitors — no bye is needed this round",
    );
    e.status = 400;
    throw e;
  }
  if (pool.length % 2 === 1 && !byeId) {
    const e = new Error(
      "There's an odd number of competitors — one must be assigned a bye",
    );
    e.status = 400;
    throw e;
  }

  t.currentRound += 1;
  t.status = "active";
  t.currentChess960 = t.chess960 ? chess960.randomChess960Position() : null;

  if (isTeam) {
    t.currentPairings = pairs.map((pr) => {
      const a = byId.get(pr.aId);
      const b = byId.get(pr.bId);
      const { white: teamWhite, black: teamBlack } = resolveManualColors(
        a,
        b,
        pr.color,
      );
      const boards = buildTeamBoards(t, teamWhite, teamBlack);
      return {
        type: "match",
        teamWhite: teamWhite.id,
        teamBlack: teamBlack.id,
        boards,
      };
    });
    if (byeId) {
      t.currentPairings.push({ type: "bye", team: byeId, boards: [] });
    }
  } else {
    t.currentPairings = pairs.map((pr) => {
      const a = byId.get(pr.aId);
      const b = byId.get(pr.bId);
      const { white, black } = resolveManualColors(a, b, pr.color);
      return {
        type: "individual",
        white: white.id,
        black: black.id,
        result: undefined,
      };
    });
    if (byeId) {
      t.currentPairings.push({
        type: "bye",
        white: byeId,
        black: null,
        result: undefined,
      });
    }
  }

  t.updatedAt = new Date().toISOString();
  await persist();
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
      `"${result}" isn't a recognized result — expected one of ${[
        ...VALID_RESULTS,
      ].join(", ")}`,
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

async function submitResults(id, resultsInput) {
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

      // Bughouse: "a win for one teammate is a win for both." Back-fill the
      // untouched board's result from the decided one *before* scoring, so
      // the ordinary per-board applyGame loop below credits both players
      // uniformly — no separate individual-scoring branch needed. Boards
      // are cross-coupled by color (board 1's White partners board 2's
      // Black), so this has to be the mirror of the decided result, not a
      // literal copy: if White won board 1, White's *teammate* is Black on
      // board 2, so board 2 backfills as a Black win, not a White win.
      if (t.variant === "bughouse") {
        const decided = pairing.boards.find(
          (bd) => !bd.sitOut && isDecisiveResult(bd.result),
        );
        const other =
          decided && pairing.boards.find((bd) => bd !== decided && !bd.sitOut);
        if (decided && other && !other.result) {
          other.result = WHITE_WIN_RESULTS.has(decided.result) ? "0-1" : "1-0";
          other.derivedFromBoard = decided.boardNum;
        }
      }

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
          derivedFromBoard: board.derivedFromBoard || null,
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
  await persist();
  return serializeTournament(t);
}

// ─── Standings recomputation (shared by editResult & deleteRound) ──────────
// Both "edit a past result" and "delete a round" mutate t.rounds after the
// fact, which invalidates every derived stat (score, colorDiff, opponents,
// head-to-head results, byeRounds) for every player/team — those were built
// incrementally by applyGame()/submitResults() and there's no cheap way to
// patch just the delta. Instead we reset every competitor to a blank slate
// and replay t.rounds from round 1 forward, reusing the exact same scoring
// primitives (applyGame, the bughouse match-point override) that
// submitResults() uses when a round is first submitted. This guarantees
// standings/tiebreaks/cross-table are always consistent with whatever is
// currently stored in t.rounds, no matter how it was arrived at.
//
// Note this does NOT touch already-generated pairings for rounds later than
// the one edited/deleted — exactly like a real arbiter fixing a scoresheet
// after the fact, correcting history doesn't retroactively unpair rounds
// that were already played on the old numbers.
function blankCompetitorFields() {
  return {
    score: 0,
    colorDiff: 0,
    lastColor: null,
    colorHistory: [],
    opponents: new Set(),
    results: {},
    byeRounds: 0,
  };
}

function resetCompetitorState(c) {
  Object.assign(c, blankCompetitorFields());
}

// The actual round-by-round replay, factored out of recomputeStandingsFromRounds
// so it can also power standingsAtRound() below — same scoring primitives,
// just driven off whatever `pById`/`tById` maps and `rounds` slice are handed
// in, rather than always the tournament's own live players/teams/t.rounds.
function replayRoundsInto(format, variant, pById, tById, rounds) {
  rounds.forEach((roundRecord) => {
    if (format === "team") {
      roundRecord.pairings.forEach((pairing) => {
        if (pairing.type === "bye") {
          const team = tById.get(pairing.team);
          if (!team) return; // defensive: referenced team no longer exists
          team.score += 1;
          team.byeRounds += 1;
          team.colorHistory.push(null);
          [...pById.values()]
            .filter((p) => p.teamId === team.id)
            .forEach((p) => {
              p.score += 1;
              p.byeRounds += 1;
            });
          return;
        }

        const teamWhite = tById.get(pairing.teamWhite);
        const teamBlack = tById.get(pairing.teamBlack);
        if (!teamWhite || !teamBlack) return; // defensive

        // Re-derive board-level (player) stats and match points from
        // whatever results are currently stored on the boards — this is the
        // single source of truth after an edit, so we don't re-run bughouse
        // backfill here, just score what's there.
        let whitePoints = 0,
          blackPoints = 0;
        pairing.boards.forEach((board) => {
          if (board.sitOut || !board.result) return;
          if (!pById.has(board.white) || !pById.has(board.black)) return;
          const { wScore, bScore } = applyGame(
            pById,
            board.white,
            board.black,
            board.result,
          );
          whitePoints += wScore;
          blackPoints += bScore;
        });

        if (variant === "bughouse") {
          const b1 = pairing.boards[0];
          const b2 = pairing.boards[1];
          const teamWhiteWon =
            (b1 && WHITE_WIN_RESULTS.has(b1.result)) ||
            (b2 && BLACK_WIN_RESULTS.has(b2.result));
          const teamBlackWon =
            (b1 && BLACK_WIN_RESULTS.has(b1.result)) ||
            (b2 && WHITE_WIN_RESULTS.has(b2.result));
          whitePoints = teamWhiteWon ? 1 : teamBlackWon ? 0 : 0.5;
          blackPoints = teamBlackWon ? 1 : teamWhiteWon ? 0 : 0.5;
        }

        pairing.whitePoints = whitePoints;
        pairing.blackPoints = blackPoints;

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
      });
    } else {
      roundRecord.pairings.forEach((pairing) => {
        if (pairing.type === "bye") {
          const p = pById.get(pairing.white);
          if (!p) return; // defensive
          p.score += 1;
          p.byeRounds += 1;
          p.colorHistory.push(null);
          return;
        }
        if (!pById.has(pairing.white) || !pById.has(pairing.black)) return;
        applyGame(pById, pairing.white, pairing.black, pairing.result);
      });
    }
  });
}

function recomputeStandingsFromRounds(t) {
  t.players.forEach(resetCompetitorState);
  if (t.format === "team") t.teams.forEach(resetCompetitorState);

  const pById = byId(t.players);
  const tById = t.format === "team" ? byId(t.teams) : null;

  replayRoundsInto(t.format, t.variant, pById, tById, t.rounds);
}

// ─── Edit a previously-submitted result ─────────────────────────────────────
// Lets the organizer correct a scoresheet mistake in ANY past round — not
// just the most recent one — since standings are always rebuilt from
// t.rounds afterward. Only round-based systems (Swiss/round-robin) are
// supported; elimination brackets record results on the match graph itself
// (see submitBracketMatchResult) and aren't touched here.
//
// edit shape:
//   individual: { pairIndex, result }
//   team:       { pairIndex, boardNum, result }
async function editResult(id, roundNumber, edit = {}) {
  const t = assertTournament(id);
  if (isEliminationSystem(t)) {
    const e = new Error(
      "This is a bracket tournament — there's no round to edit. Bracket match results are corrected by resubmitting that match.",
    );
    e.status = 400;
    throw e;
  }

  const roundRecord = t.rounds.find((r) => r.round === roundNumber);
  if (!roundRecord) {
    const e = new Error(`Round ${roundNumber} hasn't been played yet`);
    e.status = 404;
    throw e;
  }

  if (t.format === "team") {
    const { pairIndex, boardNum, result } = edit;
    const pairing = roundRecord.pairings[pairIndex];
    if (!pairing || pairing.type !== "match") {
      const e = new Error(
        "No editable match at that pairIndex (byes don't have a result to edit)",
      );
      e.status = 400;
      throw e;
    }
    const board = pairing.boards.find((bd) => bd.boardNum === boardNum);
    if (!board || board.sitOut) {
      const e = new Error(`No editable board ${boardNum} in that match`);
      e.status = 400;
      throw e;
    }
    assertValidResult(result);
    board.result = result;
    board.derivedFromBoard = null; // now an explicit, independently-set result
  } else {
    const { pairIndex, result } = edit;
    const pairing = roundRecord.pairings[pairIndex];
    if (!pairing || pairing.type !== "individual") {
      const e = new Error(
        "No editable game at that pairIndex (byes don't have a result to edit)",
      );
      e.status = 400;
      throw e;
    }
    assertValidResult(result);
    pairing.result = result;
  }

  recomputeStandingsFromRounds(t);

  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

// ─── Delete a round ──────────────────────────────────────────────────────
// Only the most recently completed round can be deleted (or the currently
// open, not-yet-submitted round, which is simply cancelled) — Swiss/
// round-robin pairings for round N+1 are generated from the standings after
// round N, so deleting an earlier round out from under a later one would
// leave that later round's pairings resting on numbers that no longer
// exist. To go back further, delete rounds one at a time from the end.
//
// After deleting, t.currentRound drops back so the organizer can call
// generateNextRound() again to draw fresh pairings for that round.
async function deleteRound(id, roundNumber) {
  const t = assertTournament(id);
  if (isEliminationSystem(t)) {
    const e = new Error(
      "This is a bracket tournament — it doesn't have rounds to delete.",
    );
    e.status = 400;
    throw e;
  }
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    const e = new Error("Invalid round number");
    e.status = 400;
    throw e;
  }

  // Currently open, unsubmitted round: cancel it rather than "delete" it —
  // there are no results or standings to unwind yet.
  if (t.currentPairings) {
    if (roundNumber !== t.currentRound) {
      const e = new Error(
        `Round ${t.currentRound} is still open — finish or cancel it before deleting round ${roundNumber}.`,
      );
      e.status = 409;
      throw e;
    }
    t.currentPairings = null;
    t.currentRound -= 1;
    t.currentChess960 = null;
    t.updatedAt = new Date().toISOString();
    await persist();
    return serializeTournament(t);
  }

  const lastRound = t.rounds[t.rounds.length - 1];
  if (!lastRound || lastRound.round !== roundNumber) {
    const e = new Error(
      lastRound
        ? `Only the most recently completed round (round ${lastRound.round}) can be deleted. Delete rounds from the end backwards.`
        : "There are no completed rounds to delete.",
    );
    e.status = 409;
    throw e;
  }

  t.rounds.pop();
  t.currentRound -= 1;
  if (t.status === "finished") {
    t.status = "active";
    t.finishedAt = null;
  }

  recomputeStandingsFromRounds(t);

  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

// ─── Bracket result submission ──────────────────────────────────────────────
// One match at a time, unlike the round-batch submitResults() above. Accepts:
//   individual: { winner: "A" | "B" }
//   team:       { boards: [{ boardNum, result }], winnerOverride?: "A" | "B" }
//               (winnerOverride is required only if the boards tie)
async function submitBracketMatchResult(id, matchId, payload = {}) {
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

    // Same rule as the Swiss/round-robin team path: a win for one teammate
    // is a win for both. Back-fill before scoring so the ordinary per-board
    // loop below credits both players uniformly.
    if (t.variant === "bughouse") {
      const decided = m.boards.find(
        (bd) => !bd.sitOut && isDecisiveResult(bd.result),
      );
      const other =
        decided && m.boards.find((bd) => bd !== decided && !bd.sitOut);
      if (decided && other && !other.result) {
        other.result = WHITE_WIN_RESULTS.has(decided.result) ? "0-1" : "1-0";
        other.derivedFromBoard = decided.boardNum;
      }
    }

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
  await persist();
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

// ─── Player profile ─────────────────────────────────────────────────────────
// Scoped entirely to this one tournament — deliberately not a cross-event
// player history. Walks t.rounds (not the player's own `results`/`opponents`
// fields) because those only ever hold one entry per opponent id, so a
// double round-robin rematch would silently overwrite the first meeting.
// t.rounds is the full, ordered game-by-game record, so it's the only
// source that can't lose a repeat pairing.
//
// Works for both formats: individual pairings are read directly off each
// round's pairings; team format instead looks inside each "match" pairing's
// per-board results, since a team member's real opponent is whoever they
// shared a board with, not the opposing team as a whole.
//
// Takes an already-resolved tournament rather than an id, so both the
// admin path (getPlayerProfile, resolved via assertTournament) and the
// public path (getPublicPlayerProfile, resolved via findByPublicViewToken)
// can share this one implementation instead of maintaining two copies of
// the game-walking and performance-rating logic below.
function buildPlayerProfile(t, playerId) {
  const player = (t.players || []).find((p) => p.id === playerId);
  if (!player) {
    const e = new Error("Player not found");
    e.status = 404;
    throw e;
  }
  const playersById = new Map((t.players || []).map((p) => [p.id, p]));

  // Chronological, oldest round first; reversed just before returning so
  // the "last opponents" the frontend wants are first in the array.
  const games = [];

  function recordGame(
    round,
    opponentId,
    side,
    result,
    { bughouseDerived } = {},
  ) {
    const opponent = playersById.get(opponentId);
    games.push({
      round,
      opponentId,
      opponentName: opponent ? opponent.name : "Unknown player",
      opponentTitle: opponent ? opponent.title || "" : "",
      opponentFideId: opponent ? opponent.fideId || null : null,
      opponentRating: opponent ? opponent.rating ?? null : null,
      color: side === "white" ? "W" : "B",
      result,
      points: scoreFromResult(result, side),
      bughouseDerived: bughouseDerived || false,
    });
  }

  (t.rounds || []).forEach((roundRecord) => {
    roundRecord.pairings.forEach((pairing) => {
      if (pairing.type === "bye" && pairing.white === playerId) {
        games.push({
          round: roundRecord.round,
          opponentId: null,
          opponentName: null,
          opponentTitle: "",
          opponentRating: null,
          color: null,
          result: "bye",
          points: 1,
          bughouseDerived: false,
        });
        return;
      }

      if (pairing.type === "individual") {
        if (pairing.white === playerId) {
          recordGame(roundRecord.round, pairing.black, "white", pairing.result);
        } else if (pairing.black === playerId) {
          recordGame(roundRecord.round, pairing.white, "black", pairing.result);
        }
        return;
      }

      if (pairing.type === "match") {
        (pairing.boards || []).forEach((board) => {
          if (board.sitOut || !board.result) return;
          if (board.white === playerId) {
            recordGame(roundRecord.round, board.black, "white", board.result, {
              bughouseDerived: !!board.derivedFromBoard,
            });
          } else if (board.black === playerId) {
            recordGame(roundRecord.round, board.white, "black", board.result, {
              bughouseDerived: !!board.derivedFromBoard,
            });
          }
        });
      }
    });
  });

  // Per-opponent totals — the "score against them" part of the request.
  // Keyed by opponent id so a repeat pairing (double round-robin) accumulates
  // instead of overwriting.
  const byOpponent = new Map();
  games.forEach((g) => {
    if (!g.opponentId) return; // byes have no opponent to attribute to
    if (!byOpponent.has(g.opponentId)) {
      byOpponent.set(g.opponentId, {
        opponentId: g.opponentId,
        name: g.opponentName,
        title: g.opponentTitle,
        fideId: g.opponentFideId,
        rating: g.opponentRating,
        gamesPlayed: 0,
        points: 0,
      });
    }
    const rec = byOpponent.get(g.opponentId);
    rec.gamesPlayed += 1;
    rec.points += g.points;
  });

  // Performance rating, FIDE-style: TPR = average opponent rating + dp(p),
  // where p is the percentage score against those opponents and dp is the
  // rating difference implied by Elo's expected-score model:
  //   dp(p) = 400 * log10(p / (1 - p))
  // This is the actual basis of FIDE's published dp lookup table (FIDE
  // Rating Regulations B.02, Annex) — the table is this formula's output,
  // rounded to fixed percentage steps for lookup by hand. Computing it
  // directly is at least as accurate as reading the table and needs no
  // embedded table. dp is capped at +-800, matching FIDE's current
  // regulations (extended from an older +-400 cap), and p=0%/100% are
  // special-cased since the raw formula is undefined at those exact
  // extremes (log of 0 or of infinity).
  //
  // This is meaningfully different from a linear "avg rating +- N points
  // per game" approximation, especially at high or low score percentages —
  // the logistic curve is steep near 0%/100% and flattens near 50%, so a
  // near-perfect score implies a much bigger rating gap than a linear
  // formula would credit, and the linear version has no cap at all.
  //
  // Byes and games against unrated opponents are excluded — a performance
  // estimate built on a made-up opponent rating is worse than no estimate.
  const PERFORMANCE_DP_CAP = 800;
  function performanceDp(percentageScore) {
    if (percentageScore <= 0) return -PERFORMANCE_DP_CAP;
    if (percentageScore >= 1) return PERFORMANCE_DP_CAP;
    const dp = 400 * Math.log10(percentageScore / (1 - percentageScore));
    return Math.max(-PERFORMANCE_DP_CAP, Math.min(PERFORMANCE_DP_CAP, dp));
  }

  const decisive = games.filter(
    (g) => g.opponentId && typeof g.opponentRating === "number",
  );
  let performanceRating = null;
  if (decisive.length > 0) {
    const avgOpponentRating =
      decisive.reduce((sum, g) => sum + g.opponentRating, 0) / decisive.length;
    const totalPoints = decisive.reduce((sum, g) => sum + g.points, 0);
    const percentageScore = totalPoints / decisive.length;
    performanceRating = Math.round(
      avgOpponentRating + performanceDp(percentageScore),
    );
  }

  return {
    id: player.id,
    name: player.name,
    title: player.title || "",
    fideId: player.fideId || null,
    rating: player.rating ?? null,
    teamId: player.teamId || null,
    score: player.score,
    gamesPlayed: games.filter((g) => g.opponentId).length,
    byes: games.filter((g) => !g.opponentId).length,
    performanceRating,
    games: [...games].reverse(), // most recent round first
    opponents: [...byOpponent.values()],
  };
}

// Admin path — same auth posture as getTournament/everything else gated by
// requireAdmin in the router.
function getPlayerProfile(id, playerId) {
  const t = assertTournament(id);
  return buildPlayerProfile(t, playerId);
}

// Public path — same resolution and "is this actually public yet" check as
// getPublicResults, so a profile can't be viewed via a guessed tournament
// id, and can't be viewed at all before the organizer turns public view on
// for this event, even with a valid token.
function getPublicPlayerProfile(token, playerId) {
  const t = findByPublicViewToken(token);
  if (!t.publicViewOpen) {
    const e = new Error("Results aren't public for this tournament right now");
    e.status = 403;
    throw e;
  }
  return buildPlayerProfile(t, playerId);
}

// Team counterpart to buildPlayerProfile() above — same shape of idea
// (round-by-round history, reversed to most-recent-first before returning),
// adapted for a team match being several boards at once rather than one
// game. Only meaningful for team-format tournaments.
function buildTeamProfile(t, teamId) {
  if (t.format !== "team") {
    const e = new Error("This tournament doesn't have teams.");
    e.status = 400;
    throw e;
  }
  const team = (t.teams || []).find((x) => x.id === teamId);
  if (!team) {
    const e = new Error("Team not found");
    e.status = 404;
    throw e;
  }
  const teamsById = byId(t.teams || []);
  const playersById = byId(t.players || []);

  const matches = [];
  (t.rounds || []).forEach((roundRecord) => {
    roundRecord.pairings.forEach((pairing) => {
      if (pairing.type === "bye" && pairing.team === teamId) {
        matches.push({
          round: roundRecord.round,
          opponentId: null,
          opponentName: null,
          boards: [],
          ourScore: 1,
          opponentScore: 0,
          result: "bye",
        });
        return;
      }
      if (pairing.type !== "match") return;
      const isWhite = pairing.teamWhite === teamId;
      const isBlack = pairing.teamBlack === teamId;
      if (!isWhite && !isBlack) return;

      const opponentTeamId = isWhite ? pairing.teamBlack : pairing.teamWhite;
      const opponentTeam = teamsById.get(opponentTeamId);

      let ourScore = 0;
      let opponentScore = 0;
      let anyUndecided = false;
      // Which team is White vs Black *alternates by board index* within a
      // match (see buildTeamBoards()'s evenBoard logic) — it is NOT fixed
      // for the whole match the way pairing.teamWhite/teamBlack might
      // suggest. So "which side is ours" is determined per board, from
      // each actual player's own teamId, not inherited from the match
      // level. Same two committed shapes buildPlayerProfile/
      // computeBoardNumbers deal with: sit-outs store a single `player`
      // id, played (or still-in-progress) boards store `white`/`black`
      // ids directly.
      const boards = [];
      (pairing.boards || []).forEach((board) => {
        if (board.sitOut) {
          const soloId = board.player ?? board.white ?? board.black;
          const solo = soloId ? playersById.get(soloId) : null;
          // A sit-out means the OTHER side ran short of players, so the
          // lone player is usually the opponent's — only show this board
          // in OUR profile if that lone player is actually one of ours
          // (i.e. WE were the side that ran short, and it's our own
          // player recorded as sitting out unopposed).
          if (!solo || solo.teamId !== teamId) return;
          boards.push({
            boardNum: board.boardNum,
            sitOut: true,
            ourPlayerId: solo.id,
            ourPlayerName: solo.name,
            opponentPlayerId: null,
            opponentPlayerName: null,
            color: null,
            result: null,
            points: null,
          });
          return;
        }

        const whitePlayer = playersById.get(board.white);
        const blackPlayer = playersById.get(board.black);
        const ourIsWhite = whitePlayer?.teamId === teamId;
        const ourPlayer = ourIsWhite ? whitePlayer : blackPlayer;
        const opponentPlayer = ourIsWhite ? blackPlayer : whitePlayer;
        if (!ourPlayer) return; // shouldn't happen, but don't fabricate a row

        if (!board.result) {
          anyUndecided = true;
          boards.push({
            boardNum: board.boardNum,
            sitOut: false,
            ourPlayerId: ourPlayer.id,
            ourPlayerName: ourPlayer.name,
            opponentPlayerId: opponentPlayer?.id || null,
            opponentPlayerName: opponentPlayer?.name || null,
            color: ourIsWhite ? "W" : "B",
            result: null,
            points: null,
          });
          return;
        }

        const ourSide = ourIsWhite ? "white" : "black";
        const points = scoreFromResult(board.result, ourSide);
        ourScore += points;
        opponentScore += scoreFromResult(
          board.result,
          ourIsWhite ? "black" : "white",
        );
        boards.push({
          boardNum: board.boardNum,
          sitOut: false,
          ourPlayerId: ourPlayer.id,
          ourPlayerName: ourPlayer.name,
          opponentPlayerId: opponentPlayer?.id || null,
          opponentPlayerName: opponentPlayer?.name || null,
          color: ourIsWhite ? "W" : "B",
          result: board.result,
          points,
        });
      });

      matches.push({
        round: roundRecord.round,
        opponentId: opponentTeamId,
        opponentName: opponentTeam ? opponentTeam.name : "Unknown team",
        boards,
        ourScore,
        opponentScore,
        result: anyUndecided
          ? null
          : ourScore > opponentScore
          ? "W"
          : ourScore < opponentScore
          ? "L"
          : "D",
      });
    });
  });

  const teamComps = t.teams.map(teamCompetitor);
  const teamByIdMap = byId(teamComps);
  const thisComp = teamComps.find((c) => c.id === teamId);
  const sortedTeams = engine.sortedStandings(teamComps);
  const rank = sortedTeams.findIndex((c) => c.id === teamId) + 1;

  const boardNumbers = computeBoardNumbers(t);
  const roster = (team.playerIds || [])
    .map((id) => playersById.get(id))
    .filter(Boolean)
    .map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title || null,
      fideId: p.fideId || null,
      rating: p.rating ?? null,
      boardNum: boardNumbers.get(p.id) ?? null,
      score: engine.formatScore(p.score),
    }));

  return {
    id: team.id,
    name: team.name,
    rank: rank || null,
    teamCount: t.teams.length,
    score: engine.formatScore(team.score),
    buchholzCut1: engine.buchholzCut1(thisComp, teamByIdMap).toFixed(1),
    buchholz: engine.buchholz(thisComp, teamByIdMap).toFixed(1),
    sb: engine.sonnenbornBerger(thisComp, teamByIdMap).toFixed(2),
    wins: engine.numberOfWins(thisComp),
    roster,
    matches: [...matches].reverse(), // most recent round first
  };
}

// Admin path — same auth posture as getPlayerProfile/everything else gated
// by requireAdmin in the router.
function getTeamProfile(id, teamId) {
  const t = assertTournament(id);
  return buildTeamProfile(t, teamId);
}

// Public path — same resolution and "is this actually public yet" check as
// getPublicPlayerProfile.
function getPublicTeamProfile(token, teamId) {
  const t = findByPublicViewToken(token);
  if (!t.publicViewOpen) {
    const e = new Error("Results aren't public for this tournament right now");
    e.status = 403;
    throw e;
  }
  return buildTeamProfile(t, teamId);
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
// A player can be added at any point in the tournament's life — round 1,
// mid-event, even after several rounds — as long as the format's schedule
// isn't fixed up front. round-robin/elimination/bughouse are blocked
// permanently (not just "early"), since their whole structure is drawn for
// a fixed field and there's no round-based cutoff that would make it safe.
async function addLatePlayer(id, { name, title, rating, teamId, fideId }) {
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
  comp.title = title ? title.trim() : null;
  comp.fideId = fideId ? String(fideId).trim() : null;
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
    if (t.currentPairings) (comp.score += 1), (comp.byeRounds += 1);
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
  await persist();
  return serializeTournament(t);
}

// Renumbers startingRank 1..N for the given list, preserving each entry's
// existing relative order rather than re-sorting by rating (that re-sort is
// only appropriate at creation time, via assignStartingRanks). Used after a
// player is removed so ranks stay contiguous.
function compactStartingRanks(list) {
  [...list]
    .sort((a, b) => (a.startingRank ?? Infinity) - (b.startingRank ?? Infinity))
    .forEach((c, i) => {
      c.startingRank = i + 1;
    });
}

// ─── Remove player ──────────────────────────────────────────────────────────
// Blocked for the same structurally-fixed formats as addLatePlayer
// (round-robin/elimination/bughouse). Unlike adding, removal keeps its own
// round-1 cutoff: past that point a player may already have results and
// pairings baked into rounds, and unwinding those safely isn't handled here.
async function deletePlayer(id, playerId) {
  const t = assertTournament(id);
  if (isRoundRobinSystem(t)) {
    const e = new Error(
      "Players can't be removed from a round-robin tournament — the schedule is fixed for the full field before Round 1.",
    );
    e.status = 409;
    throw e;
  }
  if (isEliminationSystem(t)) {
    const e = new Error(
      "Players can't be removed from an elimination bracket — the draw is fixed for the full field before Round 1.",
    );
    e.status = 409;
    throw e;
  }
  if (t.variant === "bughouse") {
    const e = new Error(
      "Players can't be removed from bughouse — every team must stay at exactly 2 players for board pairing to work.",
    );
    e.status = 409;
    throw e;
  }
  if (t.currentRound > 1) {
    const e = new Error("Players can only be removed during round 1");
    e.status = 409;
    throw e;
  }

  const player = t.players.find((p) => p.id === playerId);
  if (!player) {
    const e = new Error("Player not found");
    e.status = 404;
    throw e;
  }

  if (t.currentPairings) {
    const pairing = t.currentPairings.find(
      (p) => p.white === playerId || p.black === playerId,
    );
    if (pairing) {
      if (pairing.type !== "bye") {
        const e = new Error(
          "Can't remove a player who's already paired this round — submit or clear the round first.",
        );
        e.status = 409;
        throw e;
      }
      // It's this player's own bye pairing for the open round — reverse the
      // bye credit that was granted for it and drop the pairing entry.
      player.score -= 1;
      player.byeRounds -= 1;
      t.currentPairings = t.currentPairings.filter((p) => p !== pairing);
    }
  }

  if (t.format === "team" && player.teamId) {
    const team = t.teams.find((x) => x.id === player.teamId);
    if (team) team.playerIds = team.playerIds.filter((pid) => pid !== playerId);
  }

  t.players = t.players.filter((p) => p.id !== playerId);
  compactStartingRanks(t.players);

  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

// ─── Extend tournament (add an extra round after it finished) ─────────────
async function addExtraRound(id) {
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
  await persist();
  return serializeTournament(t);
}

// ─── Self-registration links ────────────────────────────────────────────────
// Lets the organizer share a link so players/teams can add themselves,
// instead of the organizer typing every entry in by hand. Blocked for the
// same structurally-fixed formats as addLatePlayer (round-robin/elimination),
// and — unlike organizer-driven addLatePlayer — closes once the tournament
// is past Round 1, since an unattended public link staying open indefinitely
// isn't something an organizer necessarily wants.

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

async function enableRegistration(id) {
  const t = assertTournament(id);
  assertRegistrationWindowOpen(t);
  if (!t.registrationToken) t.registrationToken = uid();
  t.registrationOpen = true;
  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

async function disableRegistration(id) {
  const t = assertTournament(id);
  t.registrationOpen = false;
  t.updatedAt = new Date().toISOString();
  await persist();
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
async function submitPublicRegistration(token, payload = {}) {
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
      comp.title = p.title ? p.title.trim() : null;
      comp.fideId = p.fideId ? String(p.fideId).trim() : null;
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
    await persist();
    return { ok: true, teamId: team.id, teamName: team.name };
  }

  // Individual format
  const { name, title, rating, fideId } = payload;
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
  comp.title = title ? title.trim() : null;
  comp.fideId = fideId ? String(fideId).trim() : null;
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
  await persist();
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

async function enablePublicView(id) {
  const t = assertTournament(id);
  assertPublicViewSupported(t);
  if (!t.publicViewToken) t.publicViewToken = uid();
  t.publicViewOpen = true;
  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

async function disablePublicView(id) {
  const t = assertTournament(id);
  t.publicViewOpen = false;
  t.updatedAt = new Date().toISOString();
  await persist();
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
    currentChess960: full.currentChess960,
    chess960: full.chess960,
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
          bracketProgress: isEliminationSystem(t) ? bracketProgress(t) : null,
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

function buildIndividualRoster(playersInput) {
  if (!Array.isArray(playersInput) || playersInput.length < 2) {
    const e = new Error("Need at least 2 players for an individual tournament");
    e.status = 400;
    throw e;
  }
  const cleaned = playersInput.map((p) => ({
    name: p?.name?.trim(),
    title: p?.title?.trim() || null,
    fideId: p?.fideId ? String(p.fideId).trim() : null,
    rating: Number(p?.rating) || 0,
  }));
  if (cleaned.some((p) => !p.name)) {
    const e = new Error("Every player needs a name");
    e.status = 400;
    throw e;
  }
  const names = cleaned.map((p) => p.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    const e = new Error("Duplicate player names are not allowed");
    e.status = 400;
    throw e;
  }
  return cleaned.map((p) => {
    const comp = engine.newCompetitor(uid(), p.rating);
    comp.name = p.name;
    comp.title = p.title;
    comp.fideId = p.fideId;
    comp.status = "active";
    return comp;
  });
}

function buildTeamRoster(teamInput, variant) {
  if (!Array.isArray(teamInput) || teamInput.length < 2) {
    const e = new Error("Need at least 2 teams for a team tournament");
    e.status = 400;
    throw e;
  }
  const teamNames = new Set();
  const teams = [];
  const players = [];

  teamInput.forEach((team) => {
    const teamName = team?.name?.trim();
    if (!teamName) {
      const e = new Error("Every team needs a name");
      e.status = 400;
      throw e;
    }
    if (teamNames.has(teamName.toLowerCase())) {
      const e = new Error(`Duplicate team name "${teamName}"`);
      e.status = 400;
      throw e;
    }
    teamNames.add(teamName.toLowerCase());

    const playerList = Array.isArray(team.players) ? team.players : [];
    if (playerList.length === 0) {
      const e = new Error(`Team "${teamName}" needs at least 1 player`);
      e.status = 400;
      throw e;
    }
    if (variant === "bughouse" && playerList.length !== 2) {
      const e = new Error(
        `Bughouse requires exactly 2 players per team — team "${teamName}" has ${playerList.length}.`,
      );
      e.status = 400;
      throw e;
    }

    const teamId = uid();
    const teamPlayers = playerList.map((p) => {
      const name = p?.name?.trim();
      if (!name) {
        const e = new Error(`Every player in team "${teamName}" needs a name`);
        e.status = 400;
        throw e;
      }
      const comp = engine.newCompetitor(uid(), Number(p?.rating) || 0);
      comp.name = name;
      comp.title = p?.title?.trim() || null;
      comp.fideId = p?.fideId ? String(p.fideId).trim() : null;
      comp.teamId = teamId;
      comp.status = "active";
      players.push(comp);
      return comp;
    });

    const avgRating = Math.round(
      teamPlayers.reduce((sum, player) => sum + player.rating, 0) /
        teamPlayers.length,
    );

    teams.push({
      id: teamId,
      name: teamName,
      rating: avgRating,
      status: "active",
      score: 0,
      colorDiff: 0,
      lastColor: null,
      colorHistory: [],
      opponents: new Set(),
      results: {},
      byeRounds: 0,
      playerIds: teamPlayers.map((p) => p.id),
    });
  });

  return { players, teams };
}

async function updateTournamentDetails(id, updates = {}) {
  const t = assertTournament(id);

  // These determine how pairings/brackets get generated — changing them
  // mid-event doesn't relabel data, it invalidates everything already
  // computed from the old value. Rejected by comparing against the CURRENT
  // value, not just checking whether the field is present: a form that
  // echoes back the tournament's existing (unchanged) chess960/format/system
  // value alongside real edits shouldn't trip this — only an actual attempt
  // to change one of them should. Still fails loudly for a genuine change,
  // which is the case this guard exists to catch.
  for (const locked of [
    "format",
    "system",
    "variant",
    "chess960",
    "thirdPlaceMatch",
  ]) {
    if (updates[locked] !== undefined && updates[locked] !== t[locked]) {
      const e = new Error(
        `"${locked}" can't be changed after creation — it determines how pairings/brackets are generated.`,
      );
      e.status = 400;
      throw e;
    }
  }

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

  if (updates.description !== undefined) {
    t.description = updates.description.trim();
  }
  if (updates.category !== undefined) {
    t.category = updates.category.trim();
  }
  if (updates.venue !== undefined) {
    t.venue = updates.venue.trim();
  }

  if (updates.organizerName !== undefined) {
    t.organizerName = updates.organizerName.trim();
  }
  if (updates.organizerContact !== undefined) {
    t.organizerContact = updates.organizerContact.trim();
  }
  if (updates.chiefArbiter !== undefined) {
    t.chiefArbiter = updates.chiefArbiter.trim();
  }
  if (updates.deputyChiefArbiter !== undefined) {
    t.deputyChiefArbiter = updates.deputyChiefArbiter.trim();
  }
  if (updates.fideRated !== undefined) {
    t.fideRated = Boolean(updates.fideRated);
  }
  if (updates.isTest !== undefined) {
    t.isTest = Boolean(updates.isTest);
  }

  if (updates.scoringSystem !== undefined) {
    if (!VALID_SCORING_SYSTEMS.includes(updates.scoringSystem)) {
      const e = new Error(`Invalid scoring system "${updates.scoringSystem}"`);
      e.status = 400;
      throw e;
    }
    t.scoringSystem = updates.scoringSystem;
  }
  if (updates.ratingType !== undefined) {
    // Use the *effective* fideRated (the value being set in this same call,
    // if any, otherwise the tournament's current value) — not t.fideRated
    // read after a possibly-still-pending mutation above.
    const effectiveFideRated =
      updates.fideRated !== undefined
        ? Boolean(updates.fideRated)
        : t.fideRated;
    if (
      effectiveFideRated &&
      !VALID_RATING_TYPES.includes(updates.ratingType)
    ) {
      const e = new Error(`Invalid FIDE rating type "${updates.ratingType}"`);
      e.status = 400;
      throw e;
    }
    t.ratingType = updates.ratingType;
  }
  if (updates.tiebreaks !== undefined) {
    t.tiebreaks = Array.isArray(updates.tiebreaks)
      ? updates.tiebreaks
      : DEFAULT_TIEBREAKS;
  }
  if (updates.maxHalfPointByes !== undefined) {
    t.maxHalfPointByes = Number.isInteger(updates.maxHalfPointByes)
      ? updates.maxHalfPointByes
      : t.maxHalfPointByes;
  }
  if (updates.byeCutoffRound !== undefined) {
    t.byeCutoffRound = Number.isInteger(updates.byeCutoffRound)
      ? updates.byeCutoffRound
      : null;
  }

  // ─── ADD THIS: Player Rating & Details Updates ─────────────────────────────
  // Expects updates.playerEdits = [{ id: "player-123", rating: 1850 }]
  if (updates.playerEdits && Array.isArray(updates.playerEdits)) {
    updates.playerEdits.forEach((edit) => {
      const player = t.players.find((p) => p.id === edit.id);
      if (player) {
        if (edit.rating !== undefined) {
          player.rating = Number(edit.rating) || 0; // Update current rating
          // Note: player.startingRank is intentionally NOT updated here
        }
        if (edit.name !== undefined) player.name = edit.name.trim();
        if (edit.title !== undefined)
          player.title = edit.title ? edit.title.trim() : null;
        if (edit.fideId !== undefined)
          player.fideId = edit.fideId ? String(edit.fideId).trim() : null;
      }
    });

    // If it's a team event, recalculate team average ratings without altering starting ranks
    if (t.format === "team" && t.teams) {
      t.teams.forEach((team) => {
        const teamPlayers = t.players.filter((p) => p.teamId === team.id);
        if (teamPlayers.length > 0) {
          team.rating = Math.round(
            teamPlayers.reduce((s, p) => s + p.rating, 0) / teamPlayers.length,
          );
        }
      });
    }
  }

  // ─── Full roster replacement (setup-phase roster editor) ────────────────
  // The editor on the frontend only sends updates.players / updates.teams
  // while the roster is still editable — i.e. before Round 1 exists — and
  // sends the WHOLE roster each time (add/remove/edit are all expressed as
  // "here is the new list"), same shape as createTournament's own players/
  // teams input. Mirrors the frontend's own `editableRoster` gate
  // (status === "setup" && currentRound === 0) so a stale request can't
  // blow away a roster that already has rounds/results tied to it.
  if (updates.players !== undefined || updates.teams !== undefined) {
    if (!(t.status === "setup" && t.currentRound === 0)) {
      const e = new Error(
        "The full roster can only be replaced before Round 1 — use the add/remove player actions instead.",
      );
      e.status = 409;
      throw e;
    }

    if (t.format === "team") {
      if (!Array.isArray(updates.teams) || updates.teams.length < 2) {
        const e = new Error("Need at least 2 teams for a team tournament");
        e.status = 400;
        throw e;
      }
      const newTeams = [];
      const newPlayers = [];
      updates.teams.forEach((teamInput) => {
        const teamId = uid();
        const teamPlayers = (teamInput.players || []).map((p) => {
          const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
          comp.name = p.name.trim();
          comp.title = p.title ? p.title.trim() : null;
          comp.fideId = p.fideId ? String(p.fideId).trim() : null;
          comp.teamId = teamId;
          comp.status = "active";
          return comp;
        });
        if (teamPlayers.length === 0) {
          const e = new Error(
            `Team "${teamInput.name}" needs at least 1 player`,
          );
          e.status = 400;
          throw e;
        }
        if (t.variant === "bughouse" && teamPlayers.length !== 2) {
          const e = new Error(
            `Bughouse requires exactly 2 players per team — team "${teamInput.name}" has ${teamPlayers.length}.`,
          );
          e.status = 400;
          throw e;
        }
        const avgRating = Math.round(
          teamPlayers.reduce((s, p) => s + p.rating, 0) / teamPlayers.length,
        );
        newTeams.push({
          id: teamId,
          name: teamInput.name.trim(),
          rating: avgRating,
          status: "active",
          score: 0,
          colorDiff: 0,
          lastColor: null,
          colorHistory: [],
          opponents: new Set(),
          results: {},
          byeRounds: 0,
          playerIds: teamPlayers.map((p) => p.id),
        });
        newPlayers.push(...teamPlayers);
      });
      t.teams = newTeams;
      t.players = newPlayers;
      assignStartingRanks(t.players);
      assignStartingRanks(t.teams);
    } else {
      if (!Array.isArray(updates.players) || updates.players.length < 2) {
        const e = new Error("Need at least 2 players");
        e.status = 400;
        throw e;
      }
      const names = updates.players.map((p) => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) {
        const e = new Error("Duplicate player names");
        e.status = 400;
        throw e;
      }
      t.players = updates.players.map((p) => {
        const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
        comp.name = p.name.trim();
        comp.title = p.title ? p.title.trim() : null;
        comp.fideId = p.fideId ? String(p.fideId).trim() : null;
        comp.status = "active";
        return comp;
      });
      assignStartingRanks(t.players);
    }

    // Re-suggest total rounds for the new field size, same as creation time
    // — only ever raises it, never silently shrinks a value the organizer
    // already set. An explicit updates.totalRounds later in this function
    // (if the form also sent one) still wins over this suggestion.
    const competitorCount =
      t.format === "team" ? t.teams.length : t.players.length;
    const suggested = isRoundRobinSystem(t)
      ? roundRobin.scheduleLength(competitorCount, t.system)
      : engine.suggestedRounds(competitorCount);
    if (isRoundRobinSystem(t) || suggested > t.totalRounds) {
      t.totalRounds = suggested;
    }
  }

  if (updates.dateFrom !== undefined || updates.dateTo !== undefined) {
    const newDateFrom =
      updates.dateFrom !== undefined ? updates.dateFrom || null : t.dateFrom;
    const newDateTo =
      updates.dateTo !== undefined ? updates.dateTo || null : t.dateTo;
    if (newDateFrom && newDateTo && newDateTo < newDateFrom) {
      const e = new Error("End date can't be before start date");
      e.status = 400;
      throw e;
    }
    t.dateFrom = newDateFrom;
    t.dateTo = newDateTo;
  }

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
  await persist();
  return serializeTournament(t);
}

async function deleteTournament(id) {
  assertTournament(id);
  delete db.tournaments[id];
  await persist();
}

// ─── Reads / serialization ──────────────────────────────────────────────────
// Real matches only — "skipped" entries are structural placeholders (one
// bye advancing straight into another bye slot) that never represented an
// actual decision, so they're excluded from both sides of the fraction
// rather than counted as either done or pending. A "bye" advance IS counted
// as done: it's a genuine bracket slot, just one that resolved without
// requiring admin input. By construction (resolveBracket only activates a
// match once both its input slots are resolved), this reaches exactly
// 100% at the same moment finalizeBracketIfDone marks the tournament
// finished — no separate reconciliation needed between the two.
function bracketProgress(t) {
  const real = t.bracket.matches.filter((m) => m.status !== "skipped");
  const completed = real.filter(
    (m) => m.status === "complete" || m.status === "bye",
  ).length;
  return { completed, total: real.length };
}

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
        system: t.system,
        timeControl: t.timeControl,
        status: t.status,
        currentRound: t.currentRound,
        totalRounds: t.totalRounds,
        bracketProgress: isEliminationSystem(t) ? bracketProgress(t) : null,
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
  // A decider in progress (or stuck) means 1st place genuinely isn't
  // decided yet — report no winner rather than an arbitrary name from
  // standings[0], which would otherwise look like someone already won.
  if (t.decider) {
    return t.decider.status === "complete"
      ? deciderCompetitorName(t, t.decider.winnerId)
      : null;
  }
  if (detectTopTie(t)) return null; // genuine tie, no decider started yet
  if (t.format === "team") {
    const standings = engine.sortedStandings(t.teams.map(teamCompetitor));
    const top = standings[0];
    return top ? t.teams.find((x) => x.id === top.id).name : null;
  }
  const standings = engine.sortedStandings(t.players);
  const top = standings[0];
  return top ? top.name : null;
}

// ─── Tiebreak Decider (playoff) system ──────────────────────────────────────
// Triggered only once a Swiss/round-robin tournament has actually finished
// (every round played) and the top spot is a genuine tie — same score AND
// every math tiebreak the app computes (see swissEngine.js's
// topTieGroup(): score -> Buchholz Cut-1 -> Buchholz -> Sonneborn-Berger ->
// direct encounter -> wins). Elimination brackets never reach this — a
// bracket already produces a sole winner through decisive matches by
// construction.
//
// Deliberately scoped to just the top place (crowning a sole champion), not
// every tied position in the standings. A resolved decider only promotes
// its winner to rank 1 — anyone else in the originally-tied group keeps
// whatever relative order the normal cascade already gave them (which was
// arbitrary among them anyway, since they were fully tied). Fully ranking
// 2nd/3rd/etc. within a tied group is out of scope; the decider's own leg
// history (round-robin scores, match games) is still there for organizers
// who want the detail, it's just not reflected in standings order.
//
// Shape of t.decider once created — never touches t.rounds, so these extra
// games can never leak into anyone's Buchholz/SB/wins:
//   {
//     id, type: "player" | "team",
//     originalTiedIds: [...],       // who was tied when the decider started
//     bestOf,                        // configured match length for 2-player legs
//     legs: [ leg, ... ],            // legs[legs.length - 1] is the current/last one
//     status: "active" | "complete" | "stuck",
//     winnerId: id | null,           // set once status === "complete"
//     resolvedOrder: [...] | null,   // [winnerId, ...rest], set once complete
//   }
//
// A leg is one of:
//   { kind: "round_robin", participants: [...], games: [{id,a,b,white,black,result}] }
//   { kind: "match",       participants: [idA, idB], games: [{id,gameNum,white,black,result}] }
//   { kind: "armageddon",  participants: [idA, idB], white, black, result }

function deciderCompetitorName(t, id) {
  return t.format === "team"
    ? t.teams.find((x) => x.id === id)?.name || "???"
    : t.players.find((p) => p.id === id)?.name || "???";
}

// Genuine tie for 1st, or null. Only meaningful once every round is in —
// mid-event score ties aren't what this feature is for.
function detectTopTie(t) {
  if (isEliminationSystem(t)) return null;
  if (t.status !== "finished") return null;

  if (t.format === "team") {
    const tied = engine.topTieGroup(t.teams.map(teamCompetitor));
    if (tied.length < 2) return null;
    return {
      type: "team",
      ids: tied.map((c) => c.id),
      names: tied.map((c) => deciderCompetitorName(t, c.id)),
    };
  }
  const tied = engine.topTieGroup(t.players);
  if (tied.length < 2) return null;
  return {
    type: "player",
    ids: tied.map((c) => c.id),
    names: tied.map((c) => deciderCompetitorName(t, c.id)),
  };
}

function assertNoDecider(t) {
  if (!t.decider) return;
  const messages = {
    active: "A decider is already in progress for this tournament.",
    stuck:
      "A decider is stuck awaiting manual resolution — resolve or cancel it first.",
    complete:
      "A decider has already resolved this tie. Cancel it first if you need to redo it.",
  };
  const e = new Error(
    messages[t.decider.status] || "A decider already exists.",
  );
  e.status = 409;
  throw e;
}

// Colors alternate strictly game-to-game, starting with the first
// participant as White in game 1. Who that "first" participant is (and so
// who gets first-game White) is whatever order detectTopTie()/topTieGroup()
// happened to return them in — organizers who want a coin flip for that can
// just flip one before starting the decider.
function makeMatchLeg(participants, bestOf) {
  const [a, b] = participants;
  const games = [];
  for (let i = 0; i < bestOf; i++) {
    const aIsWhite = i % 2 === 0;
    games.push({
      id: `g${i + 1}`,
      gameNum: i + 1,
      white: aIsWhite ? a : b,
      black: aIsWhite ? b : a,
      result: null,
    });
  }
  return { kind: "match", participants: [a, b], games };
}

// One game per pairing, single round-robin. Nothing meaningful rides on who
// gets White in a specific game here (unlike the 2-player match leg, no
// fixed color count needs balancing across an odd-sized group), so colors
// just alternate by pairing order for a reasonably even split.
function makeRoundRobinLeg(participants) {
  const games = [];
  let n = 0;
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      n++;
      const aIsWhite = n % 2 === 1;
      games.push({
        id: `g${n}`,
        a: participants[i],
        b: participants[j],
        white: aIsWhite ? participants[i] : participants[j],
        black: aIsWhite ? participants[j] : participants[i],
        result: null,
      });
    }
  }
  return { kind: "round_robin", participants: [...participants], games };
}

async function startDecider(id, options = {}) {
  const t = assertTournament(id);
  assertNoDecider(t);

  const tie = detectTopTie(t);
  if (!tie) {
    const e = new Error("There's no tie for 1st to resolve right now.");
    e.status = 409;
    throw e;
  }

  const bestOf = Number(options.bestOf) || 4;
  if (!Number.isInteger(bestOf) || bestOf < 1) {
    const e = new Error("bestOf must be a positive integer");
    e.status = 400;
    throw e;
  }

  const firstLeg =
    tie.ids.length === 2
      ? makeMatchLeg(tie.ids, bestOf)
      : makeRoundRobinLeg(tie.ids);

  t.decider = {
    id: uid(),
    type: tie.type,
    originalTiedIds: tie.ids,
    bestOf,
    legs: [firstLeg],
    status: "active",
    winnerId: null,
    resolvedOrder: null,
  };
  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

function finishDecider(d, winnerId) {
  d.status = "complete";
  d.winnerId = winnerId;
  d.resolvedOrder = [
    winnerId,
    ...d.originalTiedIds.filter((id) => id !== winnerId),
  ];
}

function findGame(leg, gameId) {
  const game = leg.games.find((g) => g.id === gameId);
  if (!game) {
    const e = new Error("Unknown game id for the current decider leg.");
    e.status = 400;
    throw e;
  }
  return game;
}

function recordGameResult(leg, payload) {
  const game = findGame(leg, payload.gameId);
  assertValidResult(payload.result);
  game.result = payload.result;
}

function recordArmageddonResult(leg, payload) {
  const { white, black, result } = payload;
  if (
    !leg.participants.includes(white) ||
    !leg.participants.includes(black) ||
    white === black
  ) {
    const e = new Error(
      "white/black must be the two decider participants (set from a real coin flip), and different from each other.",
    );
    e.status = 400;
    throw e;
  }
  assertValidResult(result);
  leg.white = white;
  leg.black = black;
  leg.result = result;
}

// Black has draw odds in Armageddon: anything other than a clean White win
// goes to Black, including a draw or a double forfeit — this always
// produces a decisive result by construction.
function armageddonWinner(leg) {
  return WHITE_WIN_RESULTS.has(leg.result) ? leg.white : leg.black;
}

function matchScores(leg) {
  const [a, b] = leg.participants;
  let aScore = 0,
    bScore = 0;
  leg.games.forEach((g) => {
    if (!g.result) return;
    const aIsWhite = g.white === a;
    aScore += scoreFromResult(g.result, aIsWhite ? "white" : "black");
    bScore += scoreFromResult(g.result, aIsWhite ? "black" : "white");
  });
  return { aScore, bScore };
}

function advanceMatchLeg(d, leg) {
  const { aScore, bScore } = matchScores(leg);
  const [a, b] = leg.participants;
  const halfPoint = leg.games.length / 2;

  // "First to more than half the available points wins outright" — checked
  // after every game, so a decisive match is called the moment it's
  // mathematically settled rather than always playing out every game.
  if (aScore > halfPoint) return finishDecider(d, a);
  if (bScore > halfPoint) return finishDecider(d, b);

  const allPlayed = leg.games.every((g) => g.result);
  if (allPlayed) {
    // aScore === bScore === halfPoint at this point (only possible when
    // bestOf is even) — Armageddon decides it.
    d.legs.push({
      kind: "armageddon",
      participants: [a, b],
      white: null,
      black: null,
      result: null,
    });
  }
}

function roundRobinScores(leg) {
  const scores = new Map(leg.participants.map((id) => [id, 0]));
  leg.games.forEach((g) => {
    if (!g.result) return;
    const aIsWhite = g.white === g.a;
    scores.set(
      g.a,
      scores.get(g.a) + scoreFromResult(g.result, aIsWhite ? "white" : "black"),
    );
    scores.set(
      g.b,
      scores.get(g.b) + scoreFromResult(g.result, aIsWhite ? "black" : "white"),
    );
  });
  return scores;
}

function advanceRoundRobinLeg(d, leg) {
  const allPlayed = leg.games.every((g) => g.result);
  if (!allPlayed) return;

  const scores = roundRobinScores(leg);
  const topScore = Math.max(...scores.values());
  const stillTied = leg.participants.filter(
    (id) => scores.get(id) === topScore,
  );

  if (stillTied.length === 1) return finishDecider(d, stillTied[0]);
  if (stillTied.length === 2)
    return d.legs.push(makeMatchLeg(stillTied, d.bestOf));

  // 3+ still tied after a full round-robin among them. Cap the recursion:
  // if this exact group also failed to shrink on its immediately preceding
  // round-robin attempt, running a third identical-sized re-run isn't
  // likely to converge either — hand it to the organizer instead of
  // spinning forever.
  const sameGroup = (x, y) =>
    x.length === y.length && x.every((id) => y.includes(id));
  const priorLeg = d.legs[d.legs.length - 2];
  const noProgressThisTime = sameGroup(stillTied, leg.participants);
  const noProgressLastTimeToo =
    priorLeg &&
    priorLeg.kind === "round_robin" &&
    sameGroup(priorLeg.participants, leg.participants);

  if (noProgressThisTime && noProgressLastTimeToo) {
    d.status = "stuck";
    return;
  }

  d.legs.push(makeRoundRobinLeg(stillTied));
}

async function recordDeciderResult(id, payload = {}) {
  const t = assertTournament(id);
  if (!t.decider || t.decider.status !== "active") {
    const e = new Error("No decider is currently in progress.");
    e.status = 409;
    throw e;
  }
  const d = t.decider;
  const leg = d.legs[d.legs.length - 1];

  if (leg.kind === "match") {
    recordGameResult(leg, payload);
    advanceMatchLeg(d, leg);
  } else if (leg.kind === "round_robin") {
    recordGameResult(leg, payload);
    advanceRoundRobinLeg(d, leg);
  } else if (leg.kind === "armageddon") {
    recordArmageddonResult(leg, payload);
    finishDecider(d, armageddonWinner(leg));
  }

  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

// Escape hatch for the "stuck" cap above, or simply an organizer who wants
// to abandon the decider and accept the shared placement instead.
async function cancelDecider(id) {
  const t = assertTournament(id);
  if (!t.decider) {
    const e = new Error("No decider to cancel.");
    e.status = 409;
    throw e;
  }
  t.decider = null;
  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

// The other side of the "stuck" escape hatch: let the organizer pick the
// winner directly (e.g. by whatever the tied players agree to off-system)
// rather than leaving the tie unresolved forever.
async function resolveDeciderManually(id, winnerId) {
  const t = assertTournament(id);
  if (
    !t.decider ||
    (t.decider.status !== "active" && t.decider.status !== "stuck")
  ) {
    const e = new Error("No in-progress decider to resolve.");
    e.status = 409;
    throw e;
  }
  if (!t.decider.originalTiedIds.includes(winnerId)) {
    const e = new Error(
      "winnerId must be one of the originally tied competitors.",
    );
    e.status = 400;
    throw e;
  }
  finishDecider(t.decider, winnerId);
  t.updatedAt = new Date().toISOString();
  await persist();
  return serializeTournament(t);
}

function serializeDecider(t) {
  if (!t.decider) return null;
  const d = t.decider;
  const nameOf = (id) => deciderCompetitorName(t, id);
  return {
    id: d.id,
    type: d.type,
    status: d.status,
    bestOf: d.bestOf,
    originalTiedIds: d.originalTiedIds,
    originalTiedNames: d.originalTiedIds.map(nameOf),
    winnerId: d.winnerId,
    winnerName: d.winnerId ? nameOf(d.winnerId) : null,
    legs: d.legs.map((leg) => {
      const base = {
        kind: leg.kind,
        participants: leg.participants,
        participantNames: leg.participants.map(nameOf),
      };
      if (leg.kind === "armageddon") {
        return {
          ...base,
          white: leg.white,
          whiteName: leg.white ? nameOf(leg.white) : null,
          black: leg.black,
          blackName: leg.black ? nameOf(leg.black) : null,
          result: leg.result,
        };
      }
      return {
        ...base,
        games: leg.games.map((g) => ({
          id: g.id,
          white: g.white,
          whiteName: nameOf(g.white),
          black: g.black,
          blackName: nameOf(g.black),
          result: g.result,
        })),
      };
    }),
  };
}

// Splices the decider's resolved order into an already-sorted standings
// array, in place of the ids it originally covered — everyone outside the
// originally-tied group keeps their existing position untouched.
function applyDeciderToStandings(list, decider) {
  if (!decider || decider.status !== "complete" || !Array.isArray(list)) {
    return list;
  }
  const order = decider.resolvedOrder;
  const orderSet = new Set(order);
  const positions = [];
  list.forEach((row, idx) => {
    if (orderSet.has(row.id)) positions.push(idx);
  });
  if (positions.length !== order.length) return list; // ids didn't line up — leave as-is rather than guess
  const byId = new Map(list.map((row) => [row.id, row]));
  const result = [...list];
  positions.forEach((idx, i) => {
    result[idx] = byId.get(order[i]);
  });
  return result;
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
    thirdPlaceMatchId: t.bracket.thirdPlaceMatchId || null,
    champion: t.bracket.champion
      ? { id: t.bracket.champion, name: nameOf(t.bracket.champion) }
      : null,
    thirdPlace: t.bracket.thirdPlace
      ? { id: t.bracket.thirdPlace, name: nameOf(t.bracket.thirdPlace) }
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
      chess960: m.chess960 || null,
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
              derivedFromBoard: b.derivedFromBoard || null,
            }))
          : null,
    })),
  };
}

// Standings/tiebreaks/cross-table computation, extracted out of
// serializeTournament() so standingsAtRound() (below) can produce the exact
// same shape of output from a replayed historical snapshot instead of the
// live tournament state. Takes plain players/teams arrays (each already
// carrying score/colorDiff/opponents/results/byeRounds — either the live
// competitor objects or a replayed snapshot) rather than closing over `t`.
// ─── Per-board breakdowns (team format) ─────────────────────────────────────
// Board number isn't stored as a persistent field on a player — buildTeamBoards()
// re-derives it every round from each team's roster sorted by rating
// descending. In practice that's stable round to round (rosters and ratings
// don't change mid-event outside late registration), but to be robust
// against the rare case where it isn't, this takes the *mode* (most
// frequent) board number a player was actually assigned across every
// completed round rather than trusting just the latest one. Players who've
// never appeared on a team board yet (no completed rounds) aren't included.
function computeBoardNumbers(t) {
  const counts = new Map(); // playerId -> Map<boardNum, timesAssigned>
  function bump(pid, boardNum) {
    if (!pid) return;
    if (!counts.has(pid)) counts.set(pid, new Map());
    const perBoard = counts.get(pid);
    perBoard.set(boardNum, (perBoard.get(boardNum) || 0) + 1);
  }

  (t.rounds || []).forEach((roundRecord) => {
    roundRecord.pairings.forEach((pairing) => {
      if (pairing.type !== "match") return;
      (pairing.boards || []).forEach((board) => {
        // Committed round records store two different shapes depending on
        // whether the board was actually played (see submitResults()):
        // sit-outs/no-result boards get a single `player` id, played
        // boards get `white`/`black` ids directly (already unwrapped from
        // the live pairing's player-object references at commit time).
        if (board.sitOut) {
          bump(board.player, board.boardNum);
          return;
        }
        bump(board.white, board.boardNum);
        bump(board.black, board.boardNum);
      });
    });
  });

  const boardNumbers = new Map();
  counts.forEach((perBoard, pid) => {
    let best = null,
      bestCount = -1;
    perBoard.forEach((count, boardNum) => {
      if (count > bestCount) {
        best = boardNum;
        bestCount = count;
      }
    });
    boardNumbers.set(pid, best);
  });
  return boardNumbers;
}

// Ranks players separately within each board number — every team's Board 1
// player against every other team's Board 1 player, then Board 2 against
// Board 2, etc. Different from the existing flat "individual board
// standings" (computeStandingsBlock's team-branch `standings`), which mixes
// every board into one list.
//
// Caveat: buchholzCut1/buchholz/sb below are computed with the tiebreak
// cascade's byId lookup scoped to just this board's group of players, not
// the whole field. Since buildTeamBoards() always pairs same-index boards
// against each other, a player's real opponents already fall inside their
// own board group in the overwhelming common case, so this is equivalent to
// the "real" tiebreak numbers in practice — it would only silently
// undercount if a mid-event roster/rating change ever caused a genuine
// cross-board pairing in some round. Score and wins are unaffected either
// way, since neither needs an opponent lookup.
function computeBoardRankings(t) {
  if (t.format !== "team") return [];

  const boardNumbers = computeBoardNumbers(t);
  const byBoard = new Map(); // boardNum -> player[]
  t.players.forEach((p) => {
    const bn = boardNumbers.get(p.id);
    if (bn == null) return;
    if (!byBoard.has(bn)) byBoard.set(bn, []);
    byBoard.get(bn).push(p);
  });

  return [...byBoard.keys()]
    .sort((a, b) => a - b)
    .map((boardNum) => {
      const group = byBoard.get(boardNum);
      const sorted = engine.sortedStandings(group);
      const groupByIdMap = byId(group);
      return {
        boardNum,
        players: sorted.map((p) => ({
          id: p.id,
          name: p.name,
          title: p.title || null,
          fideId: p.fideId || null,
          rating: p.rating,
          teamId: p.teamId,
          teamName: t.teams.find((x) => x.id === p.teamId)?.name || "???",
          score: engine.formatScore(p.score),
          buchholzCut1: engine.buchholzCut1(p, groupByIdMap).toFixed(1),
          buchholz: engine.buchholz(p, groupByIdMap).toFixed(1),
          sb: engine.sonnenbornBerger(p, groupByIdMap).toFixed(2),
          wins: engine.numberOfWins(p),
        })),
      };
    });
}

// Top 3 of the flat "individual board standings" (every player across every
// board/team, ranked by the same score+tiebreak cascade as everything
// else) — surfaced separately so the frontend (WinnerReveal) doesn't need
// to know that's where these medalists come from, and so it doesn't have
// to re-derive "top 3" itself from the full standings array.
function computeBoardMVPs(t) {
  if (t.format !== "team" || t.players.length === 0) return [];
  const sorted = engine.sortedStandings(t.players);
  return sorted.slice(0, 3).map((p, i) => ({
    place: i + 1,
    id: p.id,
    name: p.name,
    title: p.title || null,
    fideId: p.fideId || null,
    teamId: p.teamId,
    teamName: t.teams.find((x) => x.id === p.teamId)?.name || "???",
    score: engine.formatScore(p.score),
  }));
}

function computeStandingsBlock(format, players, teams, remainingRounds) {
  let standings,
    teamStandings = null,
    crossTable = null;

  if (format === "team") {
    const teamComps = teams.map(teamCompetitor);
    const sortedTeams = engine.sortedStandings(teamComps);
    const teamByIdMap = byId(teams);
    const leaderScore = sortedTeams.length ? sortedTeams[0].score : 0;
    teamStandings = sortedTeams.map((c) => {
      const team = teamByIdMap.get(c.id);
      const byIdMap = byId(teamComps);
      const maxGainPerRound = Math.max(team.playerIds.length, 1);
      const inContention =
        c.score + remainingRounds * maxGainPerRound >= leaderScore;
      const resolvedPlayers = team.playerIds
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) // Safely remove undefined
        .map((p) => ({
          name: p.name,
          title: p.title || null,
          fideId: p.fideId || null,
        }));
      return {
        id: team.id,
        name: team.name,

        score: engine.formatScore(c.score),
        inContention,
        buchholzCut1: engine.buchholzCut1(c, byIdMap).toFixed(1),
        buchholz: engine.buchholz(c, byIdMap).toFixed(1),
        sb: engine.sonnenbornBerger(c, byIdMap).toFixed(2),
        wins: engine.numberOfWins(c),
        playerCount: team.playerIds.length,
        players: resolvedPlayers,
      };
    });
    // Individual board standings within the team event.
    const sortedPlayers = engine.sortedStandings(players);
    standings = sortedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title || null,
      fideId: p.fideId || null,
      rating: p.rating,
      teamId: p.teamId,
      teamName: teams.find((x) => x.id === p.teamId)?.name || "???",
      score: engine.formatScore(p.score),
    }));
    crossTable = buildCrossTable(
      sortedTeams,
      teams.map((x) => x.id),
      teams,
    );
  } else {
    const sortedPlayers = engine.sortedStandings(players);
    const byIdMap = byId(players);
    const leaderScore = sortedPlayers.length ? sortedPlayers[0].score : 0;
    standings = sortedPlayers.map((p) => {
      const inContention = p.score + remainingRounds >= leaderScore;
      return {
        id: p.id,
        name: p.name,
        title: p.title || null,
        fideId: p.fideId || null,
        rating: p.rating,
        score: engine.formatScore(p.score),
        inContention,
        buchholzCut1: engine.buchholzCut1(p, byIdMap).toFixed(1),
        buchholz: engine.buchholz(p, byIdMap).toFixed(1),
        sb: engine.sonnenbornBerger(p, byIdMap).toFixed(2),
        wins: engine.numberOfWins(p),
      };
    });
    crossTable = buildCrossTable(
      sortedPlayers,
      players.map((x) => x.id),
      players,
    );
  }

  return { standings, teamStandings, crossTable };
}

// Builds the standings table as it stood right after a specific past round,
// without touching the live tournament state — lets an organizer or
// spectator look back at any round's table, including after the event has
// finished. Works by replaying a snapshot of blank competitors through only
// t.rounds[0..roundNumber] using the exact same scoring primitives as
// recomputeStandingsFromRounds(), so results are guaranteed consistent with
// the live standings once roundNumber reaches the most recent round.
//
// Only meaningful for round-based systems (Swiss/round-robin) — elimination
// brackets don't have a round-by-round standings table, just the bracket
// itself (see getBracket()).
function standingsAtRound(id, roundNumber) {
  const t = assertTournament(id);
  return standingsAtRoundForTournament(t, roundNumber);
}

// Public: same standings-as-of-a-past-round lookup as standingsAtRound()
// above, but resolved from a public results token instead of the real
// tournament id — same auth story as getPublicResults() (requires
// t.publicViewOpen), so a spectator link never needs or exposes the id-based
// admin route.
function getPublicStandingsAtRound(token, roundNumber) {
  const t = findByPublicViewToken(token);
  if (!t.publicViewOpen) {
    const e = new Error("Results aren't public for this tournament right now");
    e.status = 403;
    throw e;
  }
  return standingsAtRoundForTournament(t, roundNumber);
}

function standingsAtRoundForTournament(t, roundNumber) {
  if (isEliminationSystem(t)) {
    const e = new Error(
      "This is a bracket tournament — there's no round-by-round standings table, only the bracket itself.",
    );
    e.status = 400;
    throw e;
  }

  const n = Number(roundNumber);
  const roundsPlayed = t.rounds.length;
  if (!Number.isInteger(n) || n < 1 || n > roundsPlayed) {
    const e = new Error(
      roundsPlayed
        ? `roundNumber must be an integer between 1 and ${roundsPlayed} (rounds played so far)`
        : "No rounds have been played yet",
    );
    e.status = 400;
    throw e;
  }

  const players = t.players.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.title || null,
    fideId: p.fideId || null,
    rating: p.rating,
    teamId: p.teamId || null,
    startingRank: p.startingRank,
    ...blankCompetitorFields(),
  }));
  const teams =
    t.format === "team"
      ? t.teams.map((team) => ({
          id: team.id,
          name: team.name,
          playerIds: [...team.playerIds],
          ...blankCompetitorFields(),
        }))
      : [];

  const pById = byId(players);
  const tById = t.format === "team" ? byId(teams) : null;
  const roundsThrough = t.rounds.filter((r) => r.round <= n);
  replayRoundsInto(t.format, t.variant, pById, tById, roundsThrough);

  const remainingRounds = Math.max(t.totalRounds - n, 0);
  const { standings, teamStandings, crossTable } = computeStandingsBlock(
    t.format,
    players,
    teams,
    remainingRounds,
  );

  return {
    id: t.id,
    round: n,
    roundsPlayed,
    totalRounds: t.totalRounds,
    isFinalRound: n === roundsPlayed,
    standings,
    teamStandings,
    crossTable,
  };
}

function serializeTournament(t) {
  const playersOut = t.players.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.title || null,
    fideId: p.fideId || null,
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

  const remainingRounds = Math.max(t.totalRounds - t.rounds.length, 0);
  let { standings, teamStandings, crossTable } = computeStandingsBlock(
    t.format,
    t.players,
    t.teams,
    remainingRounds,
  );
  // A resolved decider promotes its winner to rank 1 in the live standings
  // only — historical per-round snapshots (standingsAtRound, above) predate
  // any decider by definition and are deliberately left untouched. The
  // cross table gets the same reordering (and its rank column recomputed)
  // so it doesn't visually contradict the standings table right next to it.
  if (t.decider && t.decider.status === "complete") {
    if (t.decider.type === "team") {
      teamStandings = applyDeciderToStandings(teamStandings, t.decider);
    } else {
      standings = applyDeciderToStandings(standings, t.decider);
    }
    crossTable = applyDeciderToStandings(crossTable, t.decider).map(
      (row, i) => ({ ...row, rank: i + 1 }),
    );
  }
  // Team-format extras — empty arrays for individual-format tournaments.
  // Independent of the decider above: that's about who wins the whole
  // event, these are about individual board performance, which the
  // decider never touches.
  const boardRankings = computeBoardRankings(t);
  const boardMVPs = computeBoardMVPs(t);

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
                  derivedFromBoard: b.derivedFromBoard || null,
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
            title: x.title || null,
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
                fideId: p.fideId || null,
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
            fideId: p.fideId || null,
            rating: p.rating,
          }));

  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    venue: t.venue,
    federation: t.federation,
    format: t.format,
    variant: t.variant,
    system: t.system,
    scoringSystem: t.scoringSystem,
    ratingType: t.ratingType,
    timeControl: t.timeControl,
    tiebreaks: t.tiebreaks,
    maxHalfPointByes: t.maxHalfPointByes,
    byeCutoffRound: t.byeCutoffRound,
    organizerName: t.organizerName,
    organizerContact: t.organizerContact,
    chiefArbiter: t.chiefArbiter,
    deputyChiefArbiter: t.deputyChiefArbiter,
    dateFrom: t.dateFrom,
    dateTo: t.dateTo,
    fideRated: t.fideRated,
    isTest: t.isTest,
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
    boardRankings,
    boardMVPs,
    rounds,
    startingRankList,
    bracket: serializeBracket(t),
    winner: t.status === "finished" ? computeWinner(t) : null,
    decider: serializeDecider(t),
    // Only surface the "you could start a decider" prompt when there isn't
    // already one — active/complete/stuck deciders carry everything the UI
    // needs via the `decider` field above instead.
    tieAlert: t.decider ? null : detectTopTie(t),
    chess960: t.chess960,
    currentChess960: t.currentChess960,
    thirdPlaceMatch: t.thirdPlaceMatch,
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
  init,
  createTournament,
  generateNextRound,
  generateManualRound,
  submitResults,
  editResult,
  deleteRound,
  addLatePlayer,
  deletePlayer,
  addExtraRound,
  updateTournamentDetails,
  deleteTournament,
  listTournaments,
  getTournament,
  standingsAtRound,
  submitBracketMatchResult,
  getBracket,
  getPlayerProfile,
  getPublicPlayerProfile,
  getTeamProfile,
  getPublicTeamProfile,
  validateBughouseTeams,
  enableRegistration,
  disableRegistration,
  getPublicRegistration,
  submitPublicRegistration,
  enablePublicView,
  disablePublicView,
  getPublicResults,
  getPublicStandingsAtRound,
  listPublicTournaments,
  exportStandingsWorkbook,
  singleRoundRobinSchedule: roundRobin.singleRoundRobinSchedule,
  doubleRoundRobinSchedule: roundRobin.doubleRoundRobinSchedule,
  scheduleLength: roundRobin.scheduleLength,
  singleEliminationBracket: bracketEngine.singleEliminationBracket,
  doubleEliminationBracket: bracketEngine.doubleEliminationBracket,
  tournamentRoundRobinSchedule,
  tournamentScheduleLength,
  startDecider,
  recordDeciderResult,
  cancelDecider,
  resolveDeciderManually,
  buildIndividualRoster,
  buildTeamRoster,
};
