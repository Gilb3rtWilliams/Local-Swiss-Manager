// scripts/prep.js
// ─────────────────────────────────────────────────────────────────────────
// Copies your EXISTING server code and EXISTING built React frontend into
// vendor/, which is what gets bundled into the Electron app. Run before
// `npm start` (dev) and automatically before `npm run dist` (packaging).
//
// ASSUMPTION: this project (desktop/) sits as a sibling to your existing
// `server/` and `client/` folders, i.e.:
//   repo/
//     server/          <- existing Express backend
//     client/           <- existing React app; client/build is the CRA/Vite
//                          production build output
//     desktop/          <- this project
// Adjust SOURCE_SERVER_DIR / SOURCE_CLIENT_BUILD_DIR below if your layout
// differs (e.g. `client/dist` instead of `client/build` for Vite).
//
// IMPORTANT: vendor/server must be your CORE tournament app (tournament
// CRUD, pairings, chessGame.js move routes) -- NOT the publish.js /
// tournamentsPublic.js routes from the cloud-sync work. Those talk to the
// cloud Postgres database directly and stay deployed on Railway; they have
// no reason to run inside the desktop app.
//
// desktop/backend and desktop/frontend below are REGENERATED build output,
// wiped and recreated by copyDir() on every run -- they should be
// git-ignored, not committed. desktop/backend-overrides/ is the actual
// source of truth for the three desktop-only files (server.js, store.js,
// middleware/requireAdmin.js) that must survive the wholesale copy from
// backend/ -- see applyOverrides() below.

const fs = require("fs");
const path = require("path");

const SOURCE_SERVER_DIR = path.join(__dirname, "..", "..", "backend");
const SOURCE_CLIENT_BUILD_DIR = path.join(__dirname, "..", "..", "frontend");

const DEST_SERVER_DIR = path.join(__dirname, "..", "backend");
const DEST_CLIENT_BUILD_DIR = path.join(__dirname, "..", "frontend");

const OVERRIDES_DIR = path.join(__dirname, "..", "backend-overrides");
const OVERRIDE_FILES = [
  "server.js",
  path.join("src", "store.js"),
  path.join("src", "middleware", "requireAdmin.js"),
];

function copyDir(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(`✗ ${label} not found at ${src}`);
    console.error(
      `  Edit scripts/prep.js's SOURCE_* constants to match your repo layout.`,
    );
    process.exitCode = 1;
    return false;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, {
    recursive: true,
    // node_modules gets reinstalled fresh for the desktop build (native
    // modules need Electron-specific rebuilding anyway -- see
    // package.json's postinstall), so skip copying it wholesale.
    filter: (p) =>
      !p.includes(`${path.sep}node_modules${path.sep}`) &&
      !p.endsWith(`${path.sep}node_modules`),
  });
  console.log(`✓ ${label}: ${src} -> ${dest}`);
  return true;
}

// Applies the desktop-only overrides (SQLite store, no-op admin gate,
// desktop server.js factory) on top of the freshly-copied cloud backend/
// tree -- these three files must NEVER come from backend/, since that copy
// is the Postgres/cloud version. Runs only after copyDir(backend) succeeds.
function applyOverrides() {
  if (!fs.existsSync(OVERRIDES_DIR)) {
    console.error(`✗ desktop-only overrides not found at ${OVERRIDES_DIR}`);
    console.error(
      `  These are desktop/backend/server.js, desktop/backend/src/store.js, and`,
    );
    console.error(
      `  desktop/backend/src/middleware/requireAdmin.js's SQLite/desktop versions`,
    );
    console.error(
      `  -- they must exist and never come from the backend/ copy.`,
    );
    process.exitCode = 1;
    return false;
  }
  for (const rel of OVERRIDE_FILES) {
    const src = path.join(OVERRIDES_DIR, rel);
    const dest = path.join(DEST_SERVER_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`✓ desktop override applied: ${rel}`);
  }
  return true;
}

const serverOk = copyDir(SOURCE_SERVER_DIR, DEST_SERVER_DIR, "backend");
const overridesOk = serverOk && applyOverrides();
const clientOk = copyDir(
  SOURCE_CLIENT_BUILD_DIR,
  DEST_CLIENT_BUILD_DIR,
  "frontend",
);

if (!serverOk || !overridesOk || !clientOk) {
  console.error(
    "\nprep failed -- fix the paths/overrides above before running `npm start` or `npm run dist`.",
  );
  process.exit(1);
}
