// db/localDb.js
// ─────────────────────────────────────────────────────────────────────────
// Opens the local SQLite file and applies local-schema.sql. Uses
// better-sqlite3 (synchronous, no async overhead -- the right choice for a
// single-process Electron main-process database; there's no concurrent
// writer to coordinate with).
//
// WAL mode is on so the renderer's reads (if it ever queries the DB
// directly instead of going through the local Express API) don't block the
// outbox worker's writes.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

function openLocalDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(
    path.join(__dirname, "local-schema.sql"),
    "utf8",
  );
  db.exec(schema);

  return db;
}

module.exports = { openLocalDb };
