// applyLiveEvent.js  (web -- shared by WatchPage.jsx's socket and catch-up paths)
// ─────────────────────────────────────────────────────────────────────────
// Applies ONE event (as delivered by the socket's 'event' message, or one
// row of GET /tournaments/:id/events's response) to the viewer's local
// `rounds` state -- the same shape GET /tournaments/:id returns:
//   [{ roundNumber, games: [{ boardNumber, whiteName, blackName, startFen,
//                              moves, lastMove, status, result }] }]
//
// Pure and side-effect-free on purpose: both the live socket handler and
// the reconnect catch-up handler in WatchPage.jsx call this same function,
// so there is exactly one place that knows how an event changes state --
// they can never disagree with each other.

function findOrCreateRound(rounds, roundNumber) {
  let round = rounds.find((r) => r.roundNumber === roundNumber);
  if (!round) {
    round = { roundNumber, games: [] };
    rounds = [...rounds, round].sort((a, b) => a.roundNumber - b.roundNumber);
    round = rounds.find((r) => r.roundNumber === roundNumber);
  }
  return rounds;
}

function updateGame(rounds, roundNumber, boardNumber, patch) {
  rounds = findOrCreateRound(rounds, roundNumber);
  return rounds.map((round) => {
    if (round.roundNumber !== roundNumber) return round;
    const exists = round.games.some((g) => g.boardNumber === boardNumber);
    const games = exists
      ? round.games.map((g) =>
          g.boardNumber === boardNumber ? { ...g, ...patch } : g,
        )
      : [
          ...round.games,
          {
            boardNumber,
            whiteName: null,
            blackName: null,
            startFen: null,
            moves: [],
            lastMove: null,
            status: { kind: "in_progress" },
            result: null,
            ...patch,
          },
        ].sort((a, b) => a.boardNumber - b.boardNumber);
    return { ...round, games };
  });
}

export function applyLiveEvent(rounds, event) {
  const { type, payload } = event;

  if (type === "round_created") {
    return findOrCreateRound(rounds, payload.roundNumber);
  }
  if (type === "game_registered") {
    return updateGame(rounds, payload.roundNumber, payload.boardNumber, {
      whiteName: payload.whiteName ?? null,
      blackName: payload.blackName ?? null,
      startFen: payload.startFen ?? null,
    });
  }
  if (type === "game_move") {
    return updateGame(rounds, payload.roundNumber, payload.boardNumber, {
      moves: payload.moves,
      lastMove: payload.lastMove,
      status: payload.status,
      ...(payload.startFen ? { startFen: payload.startFen } : {}),
    });
  }
  if (type === "game_result") {
    return updateGame(rounds, payload.roundNumber, payload.boardNumber, {
      result: payload.result,
    });
  }
  return rounds; // unknown event type -- ignore rather than throw, forward-compatible
}
