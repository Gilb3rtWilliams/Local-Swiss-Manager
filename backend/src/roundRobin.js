// ─── Round-Robin Scheduler (circle method) ──────────────────────────────────
// Produces a fixed schedule up front, unlike Swiss which pairs adaptively each
// round. Operates on 0-based *seed indices* (seed 0 = highest starting rank),
// not on competitor IDs directly — the caller maps seed index -> ID.
//
// Single round robin: every competitor faces every other exactly once.
//   - n even -> n-1 rounds, nobody ever sits out.
//   - n odd  -> n rounds, exactly one competitor byes each round.
//
// Double round robin: the exact same round-by-round pairing order as the
// single cycle, repeated once more with colors swapped — i.e. you face the
// same opponent you faced in round k of cycle 1 again in round k of cycle 2,
// this time with the opposite color.
//
// Color balance note: this uses the classic "circle method" color-alternation
// rule (flip the White/Black assignment of every board on odd rounds). It's
// the standard textbook approach and keeps colors reasonably even, but it is
// not identical to the official FIDE Berger tables, which use precomputed,
// hand-balanced color assignments. For most club/local events the difference
// is negligible; competitors with an odd number of games can't be perfectly
// balanced 50/50 regardless of method.

function singleRoundRobinSchedule(n) {
  if (n < 2) return [];

  const hasByeSlot = n % 2 !== 0;
  const size = hasByeSlot ? n + 1 : n; // even "virtual" field size
  let arr = Array.from({ length: size }, (_, i) => (i < n ? i : null)); // null = bye slot
  const totalRounds = size - 1;
  const schedule = [];

  for (let r = 0; r < totalRounds; r++) {
    const pairs = [];
    for (let i = 0; i < size / 2; i++) {
      const a = arr[i];
      const b = arr[size - 1 - i];
      if (a === null || b === null) {
        const byePlayer = a === null ? b : a;
        pairs.push({ bye: byePlayer });
        continue;
      }
      // Alternate which side is White each round to keep colors reasonably balanced.
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    schedule.push(pairs);

    // Rotate: keep seat 0 fixed, cycle everyone else by one position.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }

  return schedule;
}

function doubleRoundRobinSchedule(n) {
  const single = singleRoundRobinSchedule(n);
  const secondCycle = single.map((round) =>
    round.map((pair) =>
      "bye" in pair ? pair : { home: pair.away, away: pair.home },
    ),
  );
  return [...single, ...secondCycle];
}

function scheduleLength(n, system) {
  if (n < 2) return 0;
  const single = n % 2 === 0 ? n - 1 : n;
  return system === "double_round_robin" ? single * 2 : single;
}

module.exports = {
  singleRoundRobinSchedule,
  doubleRoundRobinSchedule,
  scheduleLength,
};
