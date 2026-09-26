// main.js  (Electron main process)
// ─────────────────────────────────────────────────────────────────────────
// Reuses your existing Express app almost unchanged: it's started here
// bound to localhost instead of Railway, pointed at SQLite instead of
// Postgres, and the React frontend (your existing build) is loaded into a
// BrowserWindow that talks to it exactly like it talks to the deployed
// backend today. Nothing about your bracket engine, chessGame.js, or the
// React components needs to know it's running inside Electron.
//
// ASSUMPTIONS (flagging clearly):
//   - Your Express app is exported as a function `createApp(dbAdapter)` --
//     adjust vendor/server/app.js (copied in by scripts/prep.js) to match
//     if your real entry point differs. If your app currently constructs
//     its `pg` Pool at import time rather than accepting one as a
//     parameter, that's the one real change needed to make it
//     SQLite-portable: thread a db handle through instead.
//   - That same app already serves your built React frontend as static
//     files (e.g. `express.static(...)` + an SPA fallback route) -- which
//     is presumably how it works in production today too, since
//     BrowserWindow just points at this local server's URL below rather
//     than loading a file directly.
//   - Auth: login goes through ipcMain's "auth:login" handler below, which
//     calls POST /api/account/login and stores the returned token via
//     publishing/authStore.js (OS keychain, via keytar). The renderer
//     (LoginScreen.jsx) only ever talks to window.swissManagerDesktop's
//     login/logout/status methods -- it never sees the token itself.

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const PUBLIC_WEB_ORIGIN = (
  process.env.PUBLIC_WEB_ORIGIN || "https://local-swiss-manager.onrender.com"
).replace(/\/+$/, "");

const { openLocalDb } = require("./db/localDb");
const { OutboxWorker } = require("./publishing/outboxWorker");
const { Entitlement } = require("./publishing/entitlement");
const {
  enablePublishing,
  pushTournamentSnapshot,
  disablePublishing,
} = require("./publishing/outboxWriter");
const authStore = require("./publishing/authStore");

const API_BASE_URL = (
  process.env.SWISS_MANAGER_API_URL ||
  "https://local-swiss-manager.onrender.com"
).replace(/\/+$/, "");
const LOCAL_PORT = 4321; // the local Express server's port inside Electron

let mainWindow;
let db;
let outboxWorker;
let entitlement;

function getAuthToken() {
  return authStore.getToken(); // already resolves to null on any keychain error
}

function startLocalServer() {
  // This is your CORE tournament app (tournament CRUD, pairings,
  // chessGame.js move routes) as copied into vendor/server by
  // scripts/prep.js -- NOT the publish.js/tournamentsPublic.js cloud-sync
  // routes, which stay deployed on Railway and never run locally.
  const createApp = require("./backend/server"); // e.g. module.exports = (db) => expressApp
  const expressApp = createApp(db);
  return new Promise((resolve) => {
    const server = http.createServer(expressApp);
    server.listen(LOCAL_PORT, "127.0.0.1", () => resolve(server));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${LOCAL_PORT}`);
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath("userData"), "swissmanager.sqlite");
  db = openLocalDb(dbPath);

  outboxWorker = new OutboxWorker(db, {
    apiBaseUrl: API_BASE_URL,
    getAuthToken,
    onEvent: (name, detail) => {
      // Surface failures somewhere visible eventually (a status icon,
      // "3 updates pending" indicator) -- console for now.
      if (name.endsWith("_error") || name.endsWith("_failed")) {
        console.warn("[publish]", name, detail);
      }
    },
  });
  outboxWorker.start();

  entitlement = new Entitlement(db, { apiBaseUrl: API_BASE_URL, getAuthToken });
  await entitlement.refresh();
  setInterval(() => entitlement.refresh(), 60 * 60 * 1000); // hourly; refresh() itself throttles further

  ipcMain.handle(
    "entitlement:isEntitled",
    () => entitlement?.isEntitled() ?? false,
  );
  ipcMain.handle("outbox:kick", () => {
    outboxWorker?.kick();
    return true;
  });
  ipcMain.handle("publish:enable", (_event, tournamentId) => {
    if (!entitlement?.isEntitled()) {
      return { ok: false, error: "Subscription required to publish." };
    }
    enablePublishing(db, tournamentId);
    outboxWorker?.kick();
    return { ok: true };
  });

  ipcMain.handle("publish:pushSnapshot", (_event, tournamentId) => {
    return pushTournamentSnapshot(tournamentId);
  });

  ipcMain.handle("publish:status", (_event, tournamentId) => {
    const row = db
      .prepare(`SELECT enabled FROM publish_state WHERE tournament_id = ?`)
      .get(tournamentId);
    if (!row) return { enabled: false, synced: true, publicUrl: null };
    const enabled = Boolean(row.enabled);
    return {
      enabled,
      synced: true, // whole-blob push is synchronous-ish; no separate sync state needed
      publicUrl: enabled
        ? `https://local-swiss-manager.onrender.com/tournament/${tournamentId}`
        : null,
    };
  });

  ipcMain.handle("publish:disable", (_event, tournamentId) => {
    // Turning OFF deliberately doesn't check entitlement -- a lapsed
    // subscription shouldn't trap someone unable to unpublish their own
    // tournament. Only turning on (publish:enable, above) is gated.
    disablePublishing(db, tournamentId);
    outboxWorker?.kick();
    return { ok: true };
  });

  ipcMain.handle("auth:status", async () => ({
    loggedIn: !!(await authStore.getToken()),
  }));

  ipcMain.handle("auth:login", async (_event, { password }) => {
    let res;
    try {
      res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch (err) {
      return {
        ok: false,
        error: "Couldn't reach the server. Check your internet connection.",
      };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || "Login failed." };
    }
    const body = await res.json();

    try {
      await authStore.saveToken(body.token);
    } catch (err) {
      return {
        ok: false,
        error:
          "Logged in, but couldn't securely store your session on this device.",
      };
    }

    await entitlement.refresh();
    outboxWorker?.kick();
    return { ok: true, email: null, subscriptionActive: true };
  });
  ipcMain.handle("auth:logout", async () => {
    await authStore.clearToken();
    return { ok: true };
  });

  await startLocalServer();
  createWindow();
});

app.on("window-all-closed", () => {
  outboxWorker?.stop();
  db?.close();
  if (process.platform !== "darwin") app.quit();
});
