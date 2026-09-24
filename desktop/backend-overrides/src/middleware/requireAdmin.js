// Desktop stub — the local Express server only listens on 127.0.0.1 inside
// Electron's own process, so there's no one to authenticate against. App
// auth happens via IPC (main.js's auth:login), a separate concern
// (subscription/publish entitlement), not local tournament CRUD access.
// Same (req, res, next) signature as the cloud version it replaces.
module.exports = (req, res, next) => next();
