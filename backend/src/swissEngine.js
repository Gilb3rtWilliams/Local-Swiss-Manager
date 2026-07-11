// ─── Swiss Pairing Engine (pure functions, no DOM) ─────────────────────────
// Ported from the original swiss64.js prototype. Operates on generic
// "competitor" objects — used directly for individual players, and again
// for team-vs-team pairing in team tournaments (a team is just another
// competitor with an aggregate rating/score).
//
// Competitor shape:
// { id, rating, score, colorDiff, lastColor, colorHistory: [], opponents: Set<id>,
//   results: { [oppId]: scoreAgainstThem }, byeRounds }

function newCompetitor(id, rating) {
  return {
    id,
    rating,
    score: 0,
    colorDiff: 0,
    lastColor: null,
    colorHistory: [],
    opponents: new Set(),
    results: {},
    byeRounds: 0,
  };
}

function suggestedRounds(n) {
  if (n < 2) return 1;
  return Math.ceil(Math.log2(n));
}

// ─── Bracket pairing (Dutch system) ─────────────────────────────────────────
function doPairing(sorted) {
  const brackets = [];
  for (const p of sorted) {
    const last = brackets[brackets.length - 1];
    if (last && last[0].score === p.score) last.push(p);
    else brackets.push([p]);
  }

  const pairs = [];
  let downfloaters = [];

  for (let bi = 0; bi < brackets.length; bi++) {
    const bracket = [...downfloaters, ...brackets[bi]];
    downfloaters = [];
    const result = pairBracket(bracket, pairs);
    pairs.push(...result.pairs);
    downfloaters.push(...result.leftover);
  }

  if (downfloaters.length > 1) {
    const result = pairBracket(downfloaters, pairs);
    pairs.push(...result.pairs);
    downfloaters = result.leftover;
  }

  return { pairs, leftover: downfloaters };
}

// ─── Relaxed fallback for players the strict bracket solver couldn't place ──
// Real Swiss events hit this in later rounds once a subset of players has
// nearly played the whole field — a legal same-bracket pairing may not exist
// at all. Rather than dropping those players from the round, pair them with
// progressively relaxed constraints. Each stage only runs if the previous one
// couldn't fully clear the list, and a genuine rematch is a last resort, not
// a first choice.
function pairLeftoversRelaxed(leftover) {
  let remaining = [...leftover];
  const pairs = [];

  function sweep(canUse) {
    let progress = true;
    while (progress && remaining.length >= 2) {
      progress = false;
      for (let i = 0; i < remaining.length && !progress; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          if (canUse(remaining[i], remaining[j])) {
            pairs.push([remaining[i], remaining[j]]);
            remaining = remaining.filter((_, idx) => idx !== i && idx !== j);
            progress = true;
            break;
          }
        }
      }
    }
  }

  // Stage 1: no rematches, but color-preference conflicts are OK.
  sweep((a, b) => !a.opponents.has(b.id));
  // Stage 2: last resort — allow a repeat pairing so nobody sits out unpaired.
  sweep(() => true);

  return { pairs, leftover: remaining };
}

function pairBracket(players) {
  if (players.length === 0) return { pairs: [], leftover: [] };
  if (players.length === 1) return { pairs: [], leftover: [players[0]] };

  const n = players.length;
  const half = Math.floor(n / 2);
  const S1 = players.slice(0, half);
  const S2 = players.slice(half);

  const s2Perms = limitedPermutations(S2, 500);

  for (const s2 of s2Perms) {
    const pairs = [];
    const usedS1 = new Set();
    const usedS2 = new Set();
    let valid = true;

    for (let i = 0; i < S1.length; i++) {
      const a = S1[i];
      let paired = false;
      for (let j = 0; j < s2.length; j++) {
        if (usedS2.has(j)) continue;
        const b = s2[j];
        if (canPair(a, b)) {
          pairs.push([a, b]);
          usedS1.add(i);
          usedS2.add(j);
          paired = true;
          break;
        }
      }
      if (!paired) {
        valid = false;
        break;
      }
    }

    if (valid) {
      const leftover = s2.filter((_, j) => !usedS2.has(j));
      return { pairs, leftover };
    }
  }

  return greedyPair(players);
}

function canPair(a, b) {
  if (a.opponents.has(b.id)) return false;
  const aPref = absolutePref(a);
  const bPref = absolutePref(b);
  if (aPref && bPref && aPref === bPref) return false;
  return true;
}

function absolutePref(p) {
  if (p.colorHistory.length >= 2) {
    const last2 = p.colorHistory.slice(-2);
    if (last2[0] === "W" && last2[1] === "W") return "B";
    if (last2[0] === "B" && last2[1] === "B") return "W";
  }
  if (p.colorDiff <= -1) return "W";
  if (p.colorDiff >= 1) return "B";
  return null;
}

function greedyPair(players) {
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < players.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < players.length; j++) {
      if (used.has(j)) continue;
      if (canPair(players[i], players[j])) {
        pairs.push([players[i], players[j]]);
        used.add(i);
        used.add(j);
        break;
      }
    }
  }
  const leftover = players.filter((_, i) => !used.has(i));
  return { pairs, leftover };
}

function limitedPermutations(arr, maxCount) {
  const results = [arr.slice()];
  if (arr.length <= 1) return results;
  const a = arr.slice();
  const c = new Array(a.length).fill(0);
  let i = 0;
  while (i < a.length && results.length < maxCount) {
    if (c[i] < i) {
      if (i % 2 === 0) [a[0], a[i]] = [a[i], a[0]];
      else [a[c[i]], a[i]] = [a[i], a[c[i]]];
      results.push(a.slice());
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return results;
}

function assignColors(a, b) {
  const aPref = absolutePref(a);
  const bPref = absolutePref(b);

  if (aPref === "W" && bPref !== "W") return { white: a, black: b };
  if (aPref === "B" && bPref !== "B") return { white: b, black: a };
  if (bPref === "W" && aPref !== "W") return { white: b, black: a };
  if (bPref === "B" && aPref !== "B") return { white: a, black: b };

  const aStrong = a.colorDiff === -1 ? "W" : a.colorDiff === 1 ? "B" : null;
  const bStrong = b.colorDiff === -1 ? "W" : b.colorDiff === 1 ? "B" : null;

  if (aStrong === "W" && bStrong !== "W") return { white: a, black: b };
  if (aStrong === "B" && bStrong !== "B") return { white: b, black: a };
  if (bStrong === "W" && aStrong !== "W") return { white: b, black: a };
  if (bStrong === "B" && aStrong !== "B") return { white: a, black: b };

  if (a.lastColor === "W") return { white: b, black: a };
  if (a.lastColor === "B") return { white: a, black: b };
  if (b.lastColor === "W") return { white: a, black: b };
  if (b.lastColor === "B") return { white: b, black: a };

  return a.rating >= b.rating ? { white: a, black: b } : { white: b, black: a };
}

// ─── Full round generation (handles odd-count byes) ────────────────────────
function generatePairings(competitors) {
  const sorted = [...competitors].sort(
    (a, b) => b.score - a.score || b.rating - a.rating,
  );

  if (competitors.length % 2 === 0) {
    const { pairs, leftover } = doPairing(sorted);
    let finalPairs = pairs;
    if (leftover.length > 0) {
      const resolved = pairLeftoversRelaxed(leftover);
      finalPairs = [...pairs, ...resolved.pairs];
    }
    return finalPairs.map(([a, b]) => assignColors(a, b));
  }

  const candidates = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].byeRounds === 0) candidates.push(sorted[i]);
  }
  if (candidates.length === 0) candidates.push(sorted[sorted.length - 1]);

  let byeCompetitor = candidates[0];
  let bestPairs = null;
  let fewestLeftover = Infinity;

  for (const candidate of candidates) {
    const unpaired = sorted.filter((p) => p.id !== candidate.id);
    const { pairs, leftover } = doPairing(unpaired);
    let allPairs = pairs;
    let unresolved = leftover;
    if (leftover.length > 0) {
      const resolved = pairLeftoversRelaxed(leftover);
      allPairs = [...pairs, ...resolved.pairs];
      unresolved = resolved.leftover;
    }
    if (unresolved.length < fewestLeftover) {
      fewestLeftover = unresolved.length;
      bestPairs = allPairs;
      byeCompetitor = candidate;
      if (fewestLeftover === 0) break;
    }
  }

  const coloredPairings = bestPairs.map(([a, b]) => assignColors(a, b));
  coloredPairings.push({ white: byeCompetitor, black: null });
  return coloredPairings;
}

// ─── Tiebreaks ───────────────────────────────────────────────────────────
function buchholz(competitor, byId) {
  let sum = 0;
  competitor.opponents.forEach((oppId) => {
    const opp = byId.get(oppId);
    if (opp) sum += opp.score;
  });
  return sum;
}

function sonnenbornBerger(competitor, byId) {
  let sb = 0;
  for (const [oppIdStr, result] of Object.entries(competitor.results)) {
    const opp =
      byId.get(isNaN(oppIdStr) ? oppIdStr : Number(oppIdStr)) ||
      byId.get(oppIdStr);
    if (opp) sb += result * opp.score;
  }
  return sb;
}

function sortedStandings(competitors) {
  const byId = new Map(competitors.map((c) => [c.id, c]));
  return [...competitors].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const bh = buchholz(b, byId) - buchholz(a, byId);
    if (bh !== 0) return bh;
    return sonnenbornBerger(b, byId) - sonnenbornBerger(a, byId);
  });
}

function formatScore(s) {
  if (s % 1 === 0) return s.toString();
  return Math.floor(s) + "½";
}

module.exports = {
  newCompetitor,
  suggestedRounds,
  doPairing,
  pairBracket,
  canPair,
  absolutePref,
  greedyPair,
  limitedPermutations,
  assignColors,
  generatePairings,
  buchholz,
  sonnenbornBerger,
  sortedStandings,
  formatScore,
};
