# Local Swiss Manager
*by Gilbert Williams*

A personalized administration and pairing app for chess tournaments — Dutch-system
Swiss pairings, individual **and** team events, running entirely on your own machine.

Built on top of your original `index.html` / `swiss64.js` prototype: the same pairing
engine, round-by-round flow, and standings/cross-table screens, rebuilt as a
React frontend + Node.js/Express backend so tournaments persist between sessions
and can be managed from a dashboard.

## Features

- **Welcome screen → Dashboard.** Landing page redirects into a dashboard listing
  every past and in-progress tournament (stored locally in `backend/data/tournaments.json`).
- **Create Tournament** with name, federation/club, format, time control, and players.
- **Individual or Team formats.** Team mode covers leagues (Team A vs Team B) and
  bughouse-style events: teams are paired against each other with the same Swiss
  engine, then broken into boards (board 1 = each team's top-rated player, etc.),
  with colors alternating by board the way Olympiad team matches are run. Team
  score = sum of board points each round; individual board standings are tracked too.
- **No round limit.** Set any number of rounds at creation (or let the app suggest
  one via the standard `ceil(log2(n))` formula) — and you can add an extra round
  (e.g. a playoff) even after a tournament has "finished."
- **Late registration** during round 1, for both individual players and team members.
- **Standings, tiebreaks (Buchholz, Sonnenborn–Berger), and a full cross table** —
  same look as your original prototype, shown after every round.
- **Finish celebration**: confetti burst + a short Web-Audio victory fanfare when
  the last round is submitted. No external image/audio assets required.

## Tech stack

- **Frontend:** React 18 + Vite + React Router (`/frontend`)
- **Backend:** Node.js + Express, JSON-file storage, zero external DB required (`/backend`)
- The Swiss pairing algorithm (`backend/src/swissEngine.js`) is a direct, tested port
  of your `swiss64.js` prototype's Dutch-system logic (score brackets, S1/S2 split
  with transpositions, absolute color preference, downfloats, bye handling) — now
  used for both individual players and team-vs-team pairing.

## Getting started

Requires Node.js 18+.

```bash
# from the project root
npm run install:all   # installs backend + frontend dependencies

npm run dev            # runs backend (:4000) and frontend (:5173) together
```

Then open **http://localhost:5173**.

(If you'd rather run them separately: `cd backend && npm install && npm run dev`
in one terminal, `cd frontend && npm install && npm run dev` in another.)

### Production build

```bash
npm run build   # builds the frontend into frontend/dist
npm start        # serves the built frontend from the Express backend on :4000
```

## Project layout

```
swiss-manager/
├── backend/
│   ├── server.js                 Express entrypoint
│   ├── data/tournaments.json     local persistence (auto-created)
│   └── src/
│       ├── swissEngine.js        pure Dutch-system pairing algorithm
│       ├── tournamentService.js  tournament CRUD, round generation, results, standings
│       ├── store.js              JSON file read/write
│       └── routes/tournaments.js REST API
└── frontend/
    └── src/
        ├── pages/                Welcome, Dashboard, NewTournament, Tournament
        ├── components/           pairing tables, standings, cross table, confetti
        └── api.js                fetch wrapper for the backend API
```

## Notes & known limitations

- **Bughouse** is currently supported as a team-format *label* (metadata + team
  scoring) — the pairing/board-splitting logic doesn't yet model the swapped-board,
  shared-clock mechanics unique to bughouse. It works well as-is for standard team
  leagues (Team A vs Team B, board order by rating).
- Data lives in a single local JSON file — perfect for a personal/club tool, but
  not intended for concurrent multi-organizer use.
- Ratings are optional; unrated players default to 0 and are seeded lowest.
