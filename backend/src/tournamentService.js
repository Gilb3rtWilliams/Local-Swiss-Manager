const crypto = require('crypto');
const engine = require('./swissEngine');
const store = require('./store');

const db = store.load();
function persist() { store.save(db); }

function uid() { return crypto.randomUUID(); }

// ─── Helpers ────────────────────────────────────────────────────────────────
function assertTournament(id) {
  const t = db.tournaments[id];
  if (!t) { const e = new Error('Tournament not found'); e.status = 404; throw e; }
  return t;
}

function playerToCompetitor(p) {
  // Player already stores competitor fields directly.
  return p;
}

function byId(list) { return new Map(list.map(x => [x.id, x])); }

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
function createTournament(input) {
  const {
    name, federation = '', format = 'individual', variant = 'standard',
    timeControl = '', totalRounds, players = [], teams = [],
  } = input;

  if (!name || !name.trim()) { const e = new Error('Tournament name is required'); e.status = 400; throw e; }

  const t = {
    id: uid(),
    name: name.trim(),
    federation,
    format,        // 'individual' | 'team'
    variant,        // 'standard' | 'bughouse' | 'league' ...
    timeControl,
    totalRounds: null,
    currentRound: 0,
    status: 'setup',
    players: [],
    teams: [],
    rounds: [],
    currentPairings: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
  };

  if (format === 'team') {
    if (!Array.isArray(teams) || teams.length < 2) {
      const e = new Error('Need at least 2 teams for a team tournament'); e.status = 400; throw e;
    }
    teams.forEach(teamInput => {
      const teamId = uid();
      const teamPlayers = (teamInput.players || []).map(p => {
        const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
        comp.name = p.name.trim();
        comp.teamId = teamId;
        return comp;
      });
      if (teamPlayers.length === 0) { const e = new Error(`Team "${teamInput.name}" needs at least 1 player`); e.status = 400; throw e; }
      const avgRating = Math.round(teamPlayers.reduce((s, p) => s + p.rating, 0) / teamPlayers.length);
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
        playerIds: teamPlayers.map(p => p.id),
      };
      t.teams.push(team);
      t.players.push(...teamPlayers);
    });
  } else {
    if (!Array.isArray(players) || players.length < 2) {
      const e = new Error('Need at least 2 players'); e.status = 400; throw e;
    }
    const names = players.map(p => p.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) { const e = new Error('Duplicate player names'); e.status = 400; throw e; }
    players.forEach(p => {
      const comp = engine.newCompetitor(uid(), Number(p.rating) || 0);
      comp.name = p.name.trim();
      t.players.push(comp);
    });
  }

  const competitorCount = format === 'team' ? t.teams.length : t.players.length;
  t.totalRounds = totalRounds && totalRounds > 0 ? Number(totalRounds) : engine.suggestedRounds(competitorCount);

  db.tournaments[t.id] = t;
  persist();
  return serializeTournament(t);
}

// ─── Round generation ───────────────────────────────────────────────────────
function generateNextRound(id) {
  const t = assertTournament(id);
  if (t.currentPairings) { const e = new Error('Current round is still open — submit results first'); e.status = 409; throw e; }
  if (t.status === 'finished') { const e = new Error('Tournament already finished'); e.status = 409; throw e; }

  t.currentRound += 1;
  t.status = 'active';

  if (t.format === 'team') {
    const teamComps = t.teams.map(teamCompetitor);
    const teamPairings = engine.generatePairings(teamComps);
    // Sync any bye bookkeeping changes back before board expansion (colors not yet set for byes).
    t.teams.forEach((team, i) => {
      const comp = teamComps.find(c => c.id === team.id);
      syncTeamFromCompetitor(team, comp);
    });

    t.currentPairings = teamPairings.map(pair => {
      const teamWhite = t.teams.find(x => x.id === pair.white.id);
      const teamBlack = pair.black ? t.teams.find(x => x.id === pair.black.id) : null;

      if (!teamBlack) {
        // Bye team: every player on the team gets an individual bye point.
        return { type: 'bye', team: teamWhite.id, boards: [] };
      }

      const whitePlayers = t.players.filter(p => p.teamId === teamWhite.id).sort((a, b) => b.rating - a.rating);
      const blackPlayers = t.players.filter(p => p.teamId === teamBlack.id).sort((a, b) => b.rating - a.rating);
      const boardCount = Math.max(whitePlayers.length, blackPlayers.length);
      const boards = [];
      for (let bIdx = 0; bIdx < boardCount; bIdx++) {
        const evenBoard = bIdx % 2 === 0; // board 1,3,5... teamWhite plays White
        const wp = whitePlayers[bIdx] || null;
        const bp = blackPlayers[bIdx] || null;
        if (!wp || !bp) {
          boards.push({ boardNum: bIdx + 1, white: evenBoard ? wp : bp, black: evenBoard ? bp : wp, sitOut: true, result: undefined });
          continue;
        }
        boards.push(
          evenBoard
            ? { boardNum: bIdx + 1, white: wp, black: bp, result: undefined }
            : { boardNum: bIdx + 1, white: bp, black: wp, result: undefined }
        );
      }
      return { type: 'match', teamWhite: teamWhite.id, teamBlack: teamBlack.id, boards };
    });
  } else {
    const comps = t.players.map(playerToCompetitor);
    const pairings = engine.generatePairings(comps);
    t.currentPairings = pairings.map(pair => ({
      type: pair.black === null ? 'bye' : 'individual',
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
function scoreFromResult(result, side) {
  // side: 'white' | 'black'
  if (result === '1-0') return side === 'white' ? 1 : 0;
  if (result === '0-1') return side === 'white' ? 0 : 1;
  return 0.5; // draw
}

function applyGame(playersById, whiteId, blackId, result) {
  const w = playersById.get(whiteId);
  const b = playersById.get(blackId);
  w.opponents.add(blackId);
  b.opponents.add(whiteId);
  w.colorHistory.push('W'); b.colorHistory.push('B');
  w.lastColor = 'W'; b.lastColor = 'B';
  w.colorDiff++; b.colorDiff--;
  const wScore = scoreFromResult(result, 'white');
  const bScore = scoreFromResult(result, 'black');
  w.score += wScore; b.score += bScore;
  w.results[blackId] = wScore; b.results[whiteId] = bScore;
  return { wScore, bScore };
}

function submitResults(id, resultsInput) {
  const t = assertTournament(id);
  if (!t.currentPairings) { const e = new Error('No open round to submit'); e.status = 409; throw e; }

  const pById = byId(t.players);

  if (t.format === 'team') {
    const tById = byId(t.teams);
    // Merge submitted results into board slots.
    resultsInput.forEach(r => {
      const pairing = t.currentPairings[r.pairIndex];
      if (!pairing || pairing.type !== 'match') return;
      const board = pairing.boards.find(bd => bd.boardNum === r.boardNum);
      if (board && !board.sitOut) board.result = r.result;
    });

    const incomplete = t.currentPairings.some(p => p.type === 'match' && p.boards.some(bd => !bd.sitOut && !bd.result));
    if (incomplete) { const e = new Error('All boards must have a result'); e.status = 400; throw e; }

    const roundRecord = { round: t.currentRound, pairings: [] };

    t.currentPairings.forEach(pairing => {
      if (pairing.type === 'bye') {
        const team = tById.get(pairing.team);
        team.score += 1;
        team.byeRounds += 1;
        team.colorHistory.push(null);
        t.players.filter(p => p.teamId === team.id).forEach(p => { p.score += 1; p.byeRounds += 1; });
        roundRecord.pairings.push({ type: 'bye', team: team.id });
        return;
      }

      const teamWhite = tById.get(pairing.teamWhite);
      const teamBlack = tById.get(pairing.teamBlack);
      let whitePoints = 0, blackPoints = 0;
      const boardResults = [];

      pairing.boards.forEach(board => {
        if (board.sitOut) { boardResults.push({ boardNum: board.boardNum, sitOut: true, player: (board.white || board.black)?.id }); return; }
        const { wScore, bScore } = applyGame(pById, board.white.id, board.black.id, board.result);
        whitePoints += wScore; blackPoints += bScore;
        boardResults.push({ boardNum: board.boardNum, white: board.white.id, black: board.black.id, result: board.result });
      });

      teamWhite.opponents.add(teamBlack.id); teamBlack.opponents.add(teamWhite.id);
      teamWhite.colorHistory.push('W'); teamBlack.colorHistory.push('B');
      teamWhite.lastColor = 'W'; teamBlack.lastColor = 'B';
      teamWhite.colorDiff++; teamBlack.colorDiff--;
      teamWhite.score += whitePoints; teamBlack.score += blackPoints;
      teamWhite.results[teamBlack.id] = whitePoints; teamBlack.results[teamWhite.id] = blackPoints;

      roundRecord.pairings.push({ type: 'match', teamWhite: teamWhite.id, teamBlack: teamBlack.id, boards: boardResults, whitePoints, blackPoints });
    });

    t.rounds.push(roundRecord);
  } else {
    resultsInput.forEach(r => {
      const pairing = t.currentPairings[r.pairIndex];
      if (pairing && pairing.type === 'individual') pairing.result = r.result;
    });
    const incomplete = t.currentPairings.some(p => p.type === 'individual' && !p.result);
    if (incomplete) { const e = new Error('All games must have a result'); e.status = 400; throw e; }

    const roundRecord = { round: t.currentRound, pairings: [] };
    t.currentPairings.forEach(pairing => {
      if (pairing.type === 'bye') {
        const p = pById.get(pairing.white);
        p.score += 1; p.byeRounds += 1; p.colorHistory.push(null);
        roundRecord.pairings.push({ type: 'bye', white: p.id });
      } else {
        applyGame(pById, pairing.white, pairing.black, pairing.result);
        roundRecord.pairings.push({ type: 'individual', white: pairing.white, black: pairing.black, result: pairing.result });
      }
    });
    t.rounds.push(roundRecord);
  }

  t.currentPairings = null;

  if (t.currentRound >= t.totalRounds) {
    t.status = 'finished';
    t.finishedAt = new Date().toISOString();
  }

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// ─── Late registration ──────────────────────────────────────────────────────
function addLatePlayer(id, { name, rating, teamId }) {
  const t = assertTournament(id);
  if (t.currentRound > 1) { const e = new Error('Late registration only allowed during round 1'); e.status = 409; throw e; }
  if (!name || !name.trim()) { const e = new Error('Name is required'); e.status = 400; throw e; }
  if (t.players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
    const e = new Error('A player with that name already exists'); e.status = 400; throw e;
  }

  const comp = engine.newCompetitor(uid(), Number(rating) || 0);
  comp.name = name.trim();

  if (t.format === 'team') {
    if (!teamId || !t.teams.find(x => x.id === teamId)) { const e = new Error('Valid teamId required for team tournaments'); e.status = 400; throw e; }
    comp.teamId = teamId;
    t.teams.find(x => x.id === teamId).playerIds.push(comp.id);
    t.players.push(comp);
    // Give the new player a personal bye credit for round 1 if a round is already open.
    if (t.currentPairings) comp.score += 1, comp.byeRounds += 1;
  } else {
    t.players.push(comp);
    if (t.currentPairings) {
      comp.score += 1; comp.byeRounds += 1;
      t.currentPairings.push({ type: 'bye', white: comp.id, black: null, result: undefined });
    }
  }

  const competitorCount = t.format === 'team' ? t.teams.length : t.players.length;
  const suggested = engine.suggestedRounds(competitorCount);
  if (suggested > t.totalRounds) t.totalRounds = suggested;

  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

// ─── Extend tournament (add an extra round after it finished) ─────────────
function addExtraRound(id) {
  const t = assertTournament(id);
  if (t.status !== 'finished') { const e = new Error('Only finished tournaments can be extended'); e.status = 409; throw e; }
  t.totalRounds += 1;
  t.status = 'active';
  t.finishedAt = null;
  t.updatedAt = new Date().toISOString();
  persist();
  return serializeTournament(t);
}

function updateTotalRounds(id, totalRounds) {
  const t = assertTournament(id);
  if (t.status === 'finished') { const e = new Error('Cannot edit a finished tournament — use extend instead'); e.status = 409; throw e; }
  if (!totalRounds || totalRounds < t.currentRound) { const e = new Error('Total rounds must be >= current round'); e.status = 400; throw e; }
  t.totalRounds = Number(totalRounds);
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
    .map(t => {
      const winner = t.status === 'finished' ? computeWinner(t) : null;
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
        competitorCount: t.format === 'team' ? t.teams.length : t.players.length,
        createdAt: t.createdAt,
        finishedAt: t.finishedAt,
        winner,
      };
    });
}

function computeWinner(t) {
  if (t.format === 'team') {
    const standings = engine.sortedStandings(t.teams.map(teamCompetitor));
    const top = standings[0];
    return top ? t.teams.find(x => x.id === top.id).name : null;
  }
  const standings = engine.sortedStandings(t.players);
  const top = standings[0];
  return top ? top.name : null;
}

function getTournament(id) {
  const t = assertTournament(id);
  return serializeTournament(t);
}

function serializeTournament(t) {
  const playersOut = t.players.map(p => ({
    id: p.id, name: p.name, rating: p.rating, score: p.score,
    teamId: p.teamId || null, byeRounds: p.byeRounds,
  }));

  const nameOf = (id) => t.players.find(p => p.id === id)?.name || '???';
  const teamNameOf = (id) => t.teams.find(x => x.id === id)?.name || '???';

  const currentPairings = t.currentPairings ? t.currentPairings.map((p, idx) => {
    if (t.format === 'team') {
      if (p.type === 'bye') return { idx, type: 'bye', teamId: p.team, teamName: teamNameOf(p.team) };
      return {
        idx, type: 'match', teamWhiteId: p.teamWhite, teamWhiteName: teamNameOf(p.teamWhite),
        teamBlackId: p.teamBlack, teamBlackName: teamNameOf(p.teamBlack),
        boards: p.boards.map(b => ({
          boardNum: b.boardNum,
          sitOut: !!b.sitOut,
          white: b.white ? { id: b.white.id, name: b.white.name, rating: b.white.rating } : null,
          black: b.black ? { id: b.black.id, name: b.black.name, rating: b.black.rating } : null,
          result: b.result,
        })),
      };
    }
    if (p.type === 'bye') return { idx, type: 'bye', playerId: p.white, playerName: nameOf(p.white) };
    return {
      idx, type: 'individual',
      whiteId: p.white, whiteName: nameOf(p.white),
      blackId: p.black, blackName: nameOf(p.black),
      result: p.result,
    };
  }) : null;

  let standings, teamStandings = null, crossTable = null;

  if (t.format === 'team') {
    const teamComps = t.teams.map(teamCompetitor);
    const sortedTeams = engine.sortedStandings(teamComps);
    const teamByIdMap = byId(t.teams);
    teamStandings = sortedTeams.map(c => {
      const team = teamByIdMap.get(c.id);
      const byIdMap = byId(teamComps);
      return {
        id: team.id, name: team.name, score: engine.formatScore(c.score),
        buchholz: engine.buchholz(c, byIdMap).toFixed(1),
        sb: engine.sonnenbornBerger(c, byIdMap).toFixed(2),
        playerCount: team.playerIds.length,
      };
    });
    // Individual board standings within the team event.
    const sortedPlayers = engine.sortedStandings(t.players);
    standings = sortedPlayers.map(p => ({
      id: p.id, name: p.name, rating: p.rating, teamId: p.teamId, teamName: teamNameOf(p.teamId),
      score: engine.formatScore(p.score),
    }));
    crossTable = buildCrossTable(sortedTeams, t.teams.map(x => x.id), t.teams);
  } else {
    const sortedPlayers = engine.sortedStandings(t.players);
    const byIdMap = byId(t.players);
    standings = sortedPlayers.map(p => ({
      id: p.id, name: p.name, rating: p.rating,
      score: engine.formatScore(p.score),
      buchholz: engine.buchholz(p, byIdMap).toFixed(1),
      sb: engine.sonnenbornBerger(p, byIdMap).toFixed(2),
    }));
    crossTable = buildCrossTable(sortedPlayers, t.players.map(x => x.id), t.players);
  }

  return {
    id: t.id, name: t.name, federation: t.federation, format: t.format, variant: t.variant,
    timeControl: t.timeControl, totalRounds: t.totalRounds, currentRound: t.currentRound,
    status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, finishedAt: t.finishedAt,
    players: playersOut,
    teams: t.teams.map(x => ({ id: x.id, name: x.name, playerIds: x.playerIds, score: engine.formatScore(x.score) })),
    currentPairings,
    standings,
    teamStandings,
    crossTable,
    rounds: t.rounds,
    winner: t.status === 'finished' ? computeWinner(t) : null,
  };
}

function buildCrossTable(sortedComps, allIds, entities) {
  const nameOf = (id) => entities.find(e => e.id === id)?.name || '???';
  return sortedComps.map((c, ri) => ({
    rank: ri + 1,
    id: c.id,
    name: nameOf(c.id),
    score: engine.formatScore(c.score),
    results: sortedComps.map((opp) => {
      if (opp.id === c.id) return { self: true };
      if (Object.prototype.hasOwnProperty.call(c.results, opp.id)) {
        const r = c.results[opp.id];
        return { value: r === 1 ? '1' : r === 0 ? '0' : '½', raw: r };
      }
      return { value: '·' };
    }),
  }));
}

module.exports = {
  createTournament, generateNextRound, submitResults, addLatePlayer,
  addExtraRound, updateTotalRounds, deleteTournament, listTournaments, getTournament,
};
