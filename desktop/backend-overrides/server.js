// Desktop-only Express entrypoint — lives outside desktop/backend/ so
// prep.js's wholesale copy of backend/ can never overwrite it; prep.js
// copies this file on top of the freshly-copied cloud tree afterward.
//
// This is exactly what desktop/main.js's startLocalServer() requires:
//   const createApp = require("./backend/server");
//   const expressApp = createApp(db);
//
// Wires up the core tournament routes against the local SQLite handle —
// no auth router, no Socket.IO, no publish.js/tournamentsPublic.js (those
// stay on Railway; the desktop app only ever talks outbound to them via
// OutboxWorker's HTTP calls, never by hosting them locally), and no
// reviews router (reviewsService.js talks directly to Postgres's pool,
// bypassing tournamentService's load/save contract entirely, and the
// feature itself is cloud-dashboard testimonial content — not something
// the local desktop app needs).

const express = require("express");
const cors = require("cors");
const path = require("path");

const sqliteStore = require("./src/store"); // the SQLite override, not Postgres
const tournamentService = require("./src/tournamentService");
const tournamentsRouter = require("./src/routes/tournaments");
const uploadsRouter = require("./src/routes/uploads");

module.exports = function createApp(db) {
  sqliteStore.setDb(db);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // tournamentService.init() is async (awaits store.load()) but this
  // factory is called synchronously in main.js (`const expressApp =
  // createApp(db);`, no await). Kick init off here and gate every request
  // behind it, rather than changing main.js's contract.
  const ready = tournamentService.init();
  app.use((req, res, next) => {
    ready.then(() => next()).catch(next);
  });

  app.use("/api/tournaments", tournamentsRouter);
  app.use("/api/uploads", uploadsRouter);

  // Serves back whatever imageUpload.js writes to src/uploads (Cage Match
  // competitor pictures, etc.) at the /uploads/<file> URLs
  // POST /api/uploads/image returns.
  app.use("/uploads", express.static(path.join(__dirname, "src", "uploads")));

  app.get("/api/health", async (req, res) => {
    try {
      await sqliteStore.ping();
      res.json({ ok: true, db: "connected (sqlite)" });
    } catch (err) {
      res.status(503).json({ ok: false, db: "unreachable" });
    }
  });

  // Same static-frontend + SPA fallback as the cloud server.js, just
  // reading desktop/frontend/dist (prep.js copies the whole frontend/
  // project tree there) instead of repo/frontend/dist.
  const frontendDist = path.join(__dirname, "..", "frontend", "dist");
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) next();
    });
  });

  return app;
};
