// ─── Elimination Bracket Topology Engine (single & double) ─────────────────
// Mirrors roundRobin.js's contract: pure functions that operate on 0-based
// *seed indices* (seed 0 = highest starting rank), not competitor IDs — the
// caller (tournamentService.js) maps seed index -> real competitor.
//
// This module only builds the *shape* of the bracket: which match feeds which,
// via slot descriptors. It does not know who wins anything. That's the job of
// tournamentService.js's resolveBracket()/resolveBracketSlot(), which walks
// the graph this module produces.
//
// Slot descriptor shapes consumed by resolveBracketSlot():
//   { type: 'seed', seed: <0-based index> }   -> real competitor, or a bye if
//                                                 seed >= real seed count
//   { type: 'winner', matchId }               -> winner of another match
//   { type: 'loser',  matchId }               -> loser of another match
//   { type: 'resetA' } / { type: 'resetB' }   -> Grand Final bracket-reset slots
//
// Match shape produced here (tournamentService fills in the rest at runtime):
//   { id, bracket: 'W'|'L'|'GF', round, slotA, slotB, winnerTo, loserTo }
//
// winnerTo/loserTo are forward pointers used only for display/detection
// (e.g. "the single-elimination final is the W match with no winnerTo") —
// the actual advancement logic is driven by slotA/slotB back-references.

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standard recursive bracket-seeding order (the same method used by NCAA-style
// brackets): for a field of `size` (power of 2), returns the 1-indexed seed
// numbers in bracket-position order, so that pairing consecutive positions
// gives the conventional 1v8/4v5/2v7/3v6-style matchups and byes land on the
// top seeds first when size > the real number of competitors.
function standardSeedOrder(size) {
  let seeds = [1];
  const rounds = Math.log2(size);
  for (let r = 0; r < rounds; r++) {
    const sum = Math.pow(2, r + 1) + 1;
    const next = [];
    for (const s of seeds) next.push(s, sum - s);
    seeds = next;
  }
  return seeds;
}

// ─── Single elimination ─────────────────────────────────────────────────────
// options.thirdPlaceMatch: when true and the bracket has an actual semifinal
// round (rounds >= 2, i.e. at least 4 entrants once padded to a power of 2),
// adds one extra match pairing the two semifinal losers, played alongside
// the final. With only 1 round (a 2-competitor bracket) there's no
// semifinal to draw losers from, so the flag is a no-op in that case.
function singleEliminationBracket(n, options = {}) {
  const { thirdPlaceMatch = false } = options;
  if (n < 2)
    return { size: n, rounds: 0, matches: [], thirdPlaceMatchId: null };

  const size = nextPowerOfTwo(n);
  const rounds = Math.log2(size);
  const order = standardSeedOrder(size);
  const matches = [];
  let idCounter = 0;
  const nextId = () => `W-${++idCounter}`;

  let roundMatches = [];
  for (let i = 0; i < size / 2; i++) {
    const m = {
      id: nextId(),
      bracket: "W",
      round: 1,
      slotA: { type: "seed", seed: order[2 * i] - 1 },
      slotB: { type: "seed", seed: order[2 * i + 1] - 1 },
      winnerTo: null,
      loserTo: null,
    };
    matches.push(m);
    roundMatches.push(m);
  }

  for (let r = 2; r <= rounds; r++) {
    const next = [];
    for (let i = 0; i < roundMatches.length / 2; i++) {
      const src1 = roundMatches[2 * i];
      const src2 = roundMatches[2 * i + 1];
      const m = {
        id: nextId(),
        bracket: "W",
        round: r,
        slotA: { type: "winner", matchId: src1.id },
        slotB: { type: "winner", matchId: src2.id },
        winnerTo: null,
        loserTo: null,
      };
      src1.winnerTo = m.id;
      src2.winnerTo = m.id;
      matches.push(m);
      next.push(m);
    }
    roundMatches = next;
  }
  // roundMatches now holds just the final — its winnerTo is left null on
  // purpose, so finalizeBracketIfDone() can find it with `!m.winnerTo`.

  // ── Optional third-place playoff ──
  // The final's slotA/slotB are always { type: 'winner', matchId: <semi> }
  // pointing at the two semifinal matches (see the loop above), so we can
  // read those ids straight off the final instead of tracking them
  // separately. Reuses the same 'loser' slot type resolveBracketSlot()
  // already knows how to handle — no new slot type needed.
  let thirdPlaceMatchId = null;
  if (thirdPlaceMatch && rounds >= 2) {
    const final = roundMatches[0];
    const m = {
      id: "3P",
      bracket: "3P",
      round: rounds,
      slotA: { type: "loser", matchId: final.slotA.matchId },
      slotB: { type: "loser", matchId: final.slotB.matchId },
      winnerTo: null,
      loserTo: null,
    };
    matches.push(m);
    thirdPlaceMatchId = m.id;
  }

  return { size, rounds, matches, thirdPlaceMatchId };
}

// ─── Double elimination ─────────────────────────────────────────────────────
// Winners bracket (WB) is built exactly like single elimination. Losers
// bracket (LB) alternates "drop" rounds (losers/survivors paired against
// each other) and "cross" rounds (LB survivors vs freshly-dropped WB losers).
// This follows the standard construction used by most bracket generators;
// like roundRobin.js's color-alternation note, this pairs LB drop-round
// opponents consecutively rather than using hand-tuned rematch-avoidance
// tables — functionally correct double elimination, just not guaranteed to
// match an official seeded reference implementation match-for-match.
function doubleEliminationBracket(n) {
  if (n < 2)
    return {
      size: n,
      wbRounds: 0,
      lbRounds: 0,
      grandFinalId: null,
      grandFinalResetId: null,
      thirdPlaceMatchId: null,
      matches: [],
    };

  const size = nextPowerOfTwo(n);
  const wbRounds = Math.log2(size);
  const order = standardSeedOrder(size);
  const matches = [];
  let idCounter = 0;
  const wbId = () => `WB-${++idCounter}`;
  const lbId = () => `LB-${++idCounter}`;

  // ── Winners bracket ──
  const wbRoundsArr = [];
  let roundMatches = [];
  for (let i = 0; i < size / 2; i++) {
    const m = {
      id: wbId(),
      bracket: "W",
      round: 1,
      slotA: { type: "seed", seed: order[2 * i] - 1 },
      slotB: { type: "seed", seed: order[2 * i + 1] - 1 },
      winnerTo: null,
      loserTo: null,
    };
    matches.push(m);
    roundMatches.push(m);
  }
  wbRoundsArr.push(roundMatches);

  for (let r = 2; r <= wbRounds; r++) {
    const next = [];
    for (let i = 0; i < roundMatches.length / 2; i++) {
      const src1 = roundMatches[2 * i];
      const src2 = roundMatches[2 * i + 1];
      const m = {
        id: wbId(),
        bracket: "W",
        round: r,
        slotA: { type: "winner", matchId: src1.id },
        slotB: { type: "winner", matchId: src2.id },
        winnerTo: null,
        loserTo: null,
      };
      src1.winnerTo = m.id;
      src2.winnerTo = m.id;
      matches.push(m);
      next.push(m);
    }
    wbRoundsArr.push(next);
    roundMatches = next;
  }
  const wbFinal = wbRoundsArr[wbRoundsArr.length - 1][0];

  // ── Losers bracket ──
  // Degenerate case: with only 1 WB round (2 competitors total) there's no
  // room for a real losers bracket — the WB match's loser goes straight to
  // the Grand Final as the "LB champion" with zero LB rounds played.
  const lbRoundsArr = [];
  let lbFinalMatch = null;

  if (wbRounds >= 2) {
    // LB round 1 ("drop"): losers of WB round 1 paired against each other.
    let dropMatches = [];
    const r1 = wbRoundsArr[0];
    for (let i = 0; i < r1.length / 2; i++) {
      const src1 = r1[2 * i];
      const src2 = r1[2 * i + 1];
      const m = {
        id: lbId(),
        bracket: "L",
        round: 1,
        slotA: { type: "loser", matchId: src1.id },
        slotB: { type: "loser", matchId: src2.id },
        winnerTo: null,
        loserTo: null,
      };
      src1.loserTo = m.id;
      src2.loserTo = m.id;
      matches.push(m);
      dropMatches.push(m);
    }
    lbRoundsArr.push(dropMatches);

    let lbRoundNum = 1;
    let prevRoundMatches = dropMatches;
    for (let wbR = 2; wbR <= wbRounds; wbR++) {
      // Cross round: LB survivors vs freshly-dropped losers of WB round wbR,
      // paired in reverse order to cut down on immediate rematches.
      lbRoundNum++;
      const wbLosers = wbRoundsArr[wbR - 1];
      const crossMatches = [];
      for (let i = 0; i < prevRoundMatches.length; i++) {
        const winnerSrc = prevRoundMatches[i];
        const loserSrc = wbLosers[wbLosers.length - 1 - i];
        const m = {
          id: lbId(),
          bracket: "L",
          round: lbRoundNum,
          slotA: { type: "winner", matchId: winnerSrc.id },
          slotB: { type: "loser", matchId: loserSrc.id },
          winnerTo: null,
          loserTo: null,
        };
        winnerSrc.winnerTo = m.id;
        loserSrc.loserTo = m.id;
        matches.push(m);
        crossMatches.push(m);
      }
      lbRoundsArr.push(crossMatches);
      prevRoundMatches = crossMatches;

      if (wbR === wbRounds) {
        // wbLosers here was the WB final (only 1 match) -> this cross round
        // IS the LB final.
        lbFinalMatch = crossMatches[0];
        break;
      }

      // Drop round: pair up this cross round's winners among themselves.
      lbRoundNum++;
      const nextDrop = [];
      for (let i = 0; i < crossMatches.length / 2; i++) {
        const src1 = crossMatches[2 * i];
        const src2 = crossMatches[2 * i + 1];
        const m = {
          id: lbId(),
          bracket: "L",
          round: lbRoundNum,
          slotA: { type: "winner", matchId: src1.id },
          slotB: { type: "winner", matchId: src2.id },
          winnerTo: null,
          loserTo: null,
        };
        src1.winnerTo = m.id;
        src2.winnerTo = m.id;
        matches.push(m);
        nextDrop.push(m);
      }
      lbRoundsArr.push(nextDrop);
      prevRoundMatches = nextDrop;
    }
  }

  const lbRounds = lbRoundsArr.length;

  // ── Grand Final (+ Challonge-style bracket reset) ──
  // slotA is always the WB champion; slotB is always the LB champion. The
  // reset-eligibility check in resolveBracketSlot() depends on that exact
  // ordering (reset only fires if slotB/competitorB wins the Grand Final).
  const gf = {
    id: "GF",
    bracket: "GF",
    round: 1,
    slotA: { type: "winner", matchId: wbFinal.id },
    slotB:
      wbRounds === 1
        ? { type: "loser", matchId: wbFinal.id }
        : { type: "winner", matchId: lbFinalMatch.id },
    winnerTo: null,
    loserTo: null,
  };
  wbFinal.winnerTo = gf.id;
  if (wbRounds === 1) {
    wbFinal.loserTo = gf.id;
  } else {
    lbFinalMatch.winnerTo = gf.id;
  }
  matches.push(gf);

  const gfReset = {
    id: "GF-RESET",
    bracket: "GF",
    round: 2,
    slotA: { type: "resetA" },
    slotB: { type: "resetB" },
    winnerTo: null,
    loserTo: null,
  };
  matches.push(gfReset);

  return {
    size,
    wbRounds,
    lbRounds,
    grandFinalId: gf.id,
    grandFinalResetId: gfReset.id,
    // Double elimination intentionally has no third-place match: the
    // losers bracket already eliminates people one at a time down to a
    // single LB final, so there's no natural "semifinal losers" pair the
    // way there is in single elimination — see tournamentService.js's
    // buildBracketState() for the decision not to bolt one on here.
    thirdPlaceMatchId: null,
    matches,
  };
}

module.exports = {
  singleEliminationBracket,
  doubleEliminationBracket,
};
