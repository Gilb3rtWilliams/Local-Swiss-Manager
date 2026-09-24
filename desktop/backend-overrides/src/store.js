// SQLite-backed replacement for the cloud store.js — same {load, save}
// contract tournamentService.js already depends on via require("./store"),
// just backed by the local better-sqlite3 handle instead of Postgres. Lives
// outside desktop/backend/ so prep.js's wholesale copy can never overwrite
// it; prep.js copies this file on top of the freshly-copied cloud tree.
//
// The db handle isn't available at require-time (main.js opens it, then
// hands it to desktop/backend/server.js's createApp(db) factory) — so this
// module starts uninitialized. setDb() must be called once, before
// tournamentService.init() runs; every function below throws clearly if
// called before that instead of failing silently.

let db = null;

function setDb(sqliteDb) {
  db = sqliteDb;
}

function requireDb() {
  if (!db) {
    throw new Error(
      "storeSqlite: setDb(db) must be called before load()/save() — see desktop/backend/server.js's createApp().",
    );
  }
  return db;
}

// Identical Set<->Array replacer/reviver to the cloud store.js — unchanged,
// since competitor.opponents is still a runtime Set regardless of backend.
function replacer(key, value) {
  if (value instanceof Set) return { __set: true, values: [...value] };
  return value;
}
function reviver(key, value) {
  if (value && typeof value === "object" && value.__set) {
    return new Set(value.values);
  }
  return value;
}

async function load() {
  const sqlite = requireDb();
  const rows = sqlite.prepare("SELECT id, data FROM tournaments").all();
  const tournaments = {};
  for (const row of rows) {
    try {
      tournaments[row.id] = JSON.parse(row.data, reviver);
    } catch (err) {
      console.error(
        `Failed to parse tournament ${row.id} from local SQLite, skipping:`,
        err.message,
      );
    }
  }
  return { tournaments };
}

// Mirrors the cloud save()'s full-rewrite-plus-delete-missing semantics,
// via better-sqlite3's synchronous transaction API instead of a pg
// client/BEGIN/COMMIT.
async function save(dbObj) {
  const sqlite = requireDb();
  const upsert = sqlite.prepare(
    `INSERT INTO tournaments (id, data, updated_at)
     VALUES (@id, @data, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  );
  const ids = Object.keys(dbObj.tournaments);

  const tx = sqlite.transaction(() => {
    ids.forEach((id) => {
      upsert.run({ id, data: JSON.stringify(dbObj.tournaments[id], replacer) });
    });
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      sqlite
        .prepare(`DELETE FROM tournaments WHERE id NOT IN (${placeholders})`)
        .run(...ids);
    } else {
      sqlite.prepare("DELETE FROM tournaments").run();
    }
  });
  tx();
}

async function ping() {
  requireDb();
}

module.exports = { load, save, ping, setDb };
