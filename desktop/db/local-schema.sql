-- Local SQLite schema for the Swiss Manager desktop app.
--
-- `tournaments` is a blob store, matching the cloud Postgres store.js's
-- interface exactly: tournamentService.js only ever calls store.load()
-- (SELECT id, data) and store.save(db) (upsert one row per tournament),
-- never queries rounds/games as separate relations. A full tournament --
-- players, teams, rounds, bracket, decider, cageMatch, everything -- is
-- one JSON blob in `data`, same as the Postgres version.
--
-- Everything here is local-first: this file is the single source of truth
-- for a running tournament. Nothing about running or scoring a tournament
-- depends on outbox/publish_state/entitlement_cache being populated --
-- those only matter if/when the arbiter opts to publish.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tournaments (
  id          TEXT PRIMARY KEY,            -- uuid, generated locally
  data        TEXT NOT NULL,               -- JSON blob -- the whole tournament object
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Publishing-specific tables ────────────────────────────────────────────

-- One row per tournament the arbiter has ever opted to publish -- created on
-- first "publish" and kept forever after (even once toggled off), so
-- toggling back on reuses the same server_tournament_id instead of creating
-- a duplicate. `enabled` is the arbiter's CURRENT desired state (what the
-- toggle in the UI shows); `synced_visible` is the last visibility state the
-- SERVER has actually confirmed -- these two are allowed to disagree
-- briefly (e.g. right after flipping the toggle while offline), and
-- outboxWorker.js's job is to bring synced_visible in line with enabled.
CREATE TABLE IF NOT EXISTS publish_state (
  tournament_id        TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  server_tournament_id TEXT,               -- NULL until first registration
  enabled              INTEGER NOT NULL DEFAULT 1, -- 0/1 -- the toggle's current position
  synced_visible       INTEGER,            -- 0/1/NULL -- last confirmed with the server
  enabled_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- The outbox: every publishable change is written here in the SAME local
-- transaction as the change itself, so "recorded a move" and "queued it for
-- publishing" can never disagree after a crash mid-write.
-- `client_event_id` is generated once, at enqueue time, and never changes on
-- retry -- that's what makes a resend to the server a safe no-op (see
-- publish.js's UNIQUE (tournament_id, client_event_id) on the server side).
CREATE TABLE IF NOT EXISTS outbox (
  id               INTEGER PRIMARY KEY AUTOINCREMENT, -- local ordering only
  tournament_id    TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  client_event_id  TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL, -- 'round_created' | 'game_registered' | 'game_move' | 'game_result'
  payload          TEXT NOT NULL, -- JSON
  occurred_at      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent'
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TEXT,
  last_error       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Picking the next pending batch for a tournament, in order, is the worker's
-- single most common query.
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox (tournament_id, status, id);

-- Cached subscription check, so the app can run at a venue with no internet.
-- Single row (id = 1). `valid_until` is when the CACHE itself expires (the
-- offline grace period), independent of the subscription's own renewal date.
CREATE TABLE IF NOT EXISTS entitlement_cache (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  user_id         TEXT,
  active          INTEGER NOT NULL DEFAULT 0, -- 0/1
  checked_at      TEXT,
  valid_until     TEXT
);