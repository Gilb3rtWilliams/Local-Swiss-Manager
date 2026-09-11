// Postgres-backed replacement for the old file-based store.js.
//
// Same interface contract the rest of the app already depends on — a
// tournament collection shaped as { tournaments: { [id]: tournament } } —
// just persisted outside the local filesystem instead of to a JSON file.
// The Set<->Array replacer/reviver pair is carried over UNCHANGED from the
// old file-based store.js, since competitor.opponents is still a runtime
// Set and still needs the same treatment regardless of where the bytes end
// up. Each tournament is stored as one JSONB row rather than the whole
// collection as one file, but the serialization format inside each row is
// identical to what used to be written to disk.
//
// Needs the `pg` package: npm install pg
//
// Needs DATABASE_URL set in the environment, e.g.:
//   postgres://user:password@host:5432/dbname
// Managed providers (Render, Railway, Supabase, Neon) give you this
// connection string directly — paste it in as an environment variable,
// never into source control.

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Local file storage has been retired — " +
      "point this at a Postgres instance (see store.js header comment).",
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most managed Postgres providers (Render, Railway, Supabase) require SSL
  // but use a certificate chain the default Node trust store won't
  // recognize. rejectUnauthorized:false is the standard pragmatic setting
  // for these — the connection is still encrypted, just not chain-verified.
  // Skip this entirely for a local/self-hosted Postgres with no TLS.
  ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
});

// competitor.opponents is a Set at runtime; must be array in storage.
// Identical to the old file-based store.js — the format inside each row
// hasn't changed, only where the row lives.
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

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id UUID PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  schemaReady = true;
  // Fine for getting off local storage quickly with a single table that
  // never changes shape. If you outgrow this (e.g. move to per-player rows
  // later), switch to a real migration tool (node-pg-migrate, Prisma
  // Migrate) instead of extending this function — auto-create-if-missing
  // stops being appropriate once more than one table/column shape exists.
}

// Call this once at server startup, before app.listen(...), and use its
// return value as the in-memory `db` object — same role the old
// `const db = store.load()` played, just now async because the read comes
// over the network instead of from disk.
async function load() {
  await ensureSchema();
  const { rows } = await pool.query("SELECT id, data FROM tournaments");
  const tournaments = {};
  for (const row of rows) {
    try {
      tournaments[row.id] = JSON.parse(row.data, reviver);
    } catch (err) {
      // Same defensive stance as the old load(): one corrupted row should
      // never take the whole server down at boot. Skip it and keep going.
      console.error(
        `Failed to parse tournament ${row.id} from the database, skipping:`,
        err.message,
      );
    }
  }
  return { tournaments };
}

// Upserts every tournament currently in memory and removes any row for a
// tournament that's no longer present (covers deleteTournament()). This
// mirrors the old file-based save()'s behavior of rewriting the entire
// collection on every call — same semantics, different backend. Fine at
// the tournament counts this app runs today; if that ever becomes a
// bottleneck, the fix is passing the single changed tournament's id through
// from persist() so save() can do one targeted UPDATE instead of a full
// pass, not re-architecting the schema.
async function save(db) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ids = Object.keys(db.tournaments);
    for (const id of ids) {
      const data = JSON.stringify(db.tournaments[id], replacer);
      await client.query(
        `INSERT INTO tournaments (id, data, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [id, data],
      );
    }

    if (ids.length > 0) {
      await client.query(
        `DELETE FROM tournaments WHERE id != ALL($1::uuid[])`,
        [ids],
      );
    } else {
      await client.query("DELETE FROM tournaments");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Cheap connectivity check for the health endpoint — doesn't touch the
// tournaments table, just confirms the pool can reach Postgres at all.
async function ping() {
  await pool.query("SELECT 1");
}

module.exports = { load, save, ping, pool };
