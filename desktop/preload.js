// preload.js
// ─────────────────────────────────────────────────────────────────────────
// Exposes a minimal, safe surface to the renderer (your existing React
// app). It talks to the local Express server directly over HTTP for
// everything tournament-related, same as it talks to Railway today -- this
// bridge is ONLY for the two things that aren't HTTP calls: checking
// entitlement synchronously for UI gating, and nudging the outbox after a
// local action so a publish feels instant rather than waiting for the next
// poll.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("swissManagerDesktop", {
  isEntitled: () => ipcRenderer.invoke("entitlement:isEntitled"),
  kickOutbox: () => ipcRenderer.invoke("outbox:kick"),
  enablePublishing: (tournamentId) =>
    ipcRenderer.invoke("publish:enable", tournamentId),
  disablePublishing: (tournamentId) =>
    ipcRenderer.invoke("publish:disable", tournamentId),
  publishStatus: (tournamentId) =>
    ipcRenderer.invoke("publish:status", tournamentId),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  login: (password) => ipcRenderer.invoke("auth:login", { password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
});
