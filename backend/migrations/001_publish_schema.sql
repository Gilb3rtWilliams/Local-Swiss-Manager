-- Publish / live-viewing schema for Swiss Manager desktop -> cloud sync.
--
-- Design: the desktop app is the single source of truth for its own
-- tournament (local SQLite). It never receives writes back from the server,
-- so there is no merge/conflict problem here -- this is a one-way,
-- append-only event log. `publish_events` is the real source of truth on
-- the server side; `published_games` / `published_rounds` are just a
-- materialized read model kept in sync as events arrive, so the viewer page
-- can load a tournament's current state in one query instead of replaying
-- every event on every page load.
--
-- Assumes a `users` table already exists (id uuid or serial primary key).
-- Adjust the FK type below (users.id) to match your existing schema.

CREATE TABLE published_tournaments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      integer NOT NULL REFERENCES users(id),
  -- The tournament's id in the arbiter's local SQLite install. Publishing
  -- the same local tournament twice (e.g. app restart) must upsert, not
  -- duplicate -- that's what this unique pair is for.
  local_tournament_id text NOT NULL,
  name               text NOT NULL,
  format             text NOT NULL DEFAULT 'swiss', -- 'swiss' | 'match_play' | ...
  status             text NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'complete'
  -- Monotonic per-tournament cursor for event ordering / catch-up, cheaper
  -- to reason about than relying on publish_events.id directly if events
  -- are ever partitioned or archived later.
  last_event_seq     bigint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, local_tournament_id)
);

CREATE TABLE published_rounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES published_tournaments(id) ON DELETE CASCADE,
  round_number    integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_number)
);

CREATE TABLE published_games (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES published_tournaments(id) ON DELETE CASCADE,
  round_id        uuid NOT NULL REFERENCES published_rounds(id) ON DELETE CASCADE,
  board_number    integer NOT NULL,
  white_name      text,
  black_name      text,
  -- Chess960-aware: standard games publish with start_fen = NULL.
  start_fen       text,
  moves           jsonb NOT NULL DEFAULT '[]', -- SAN list, current snapshot
  last_move       jsonb,                       -- { from, to, san } | null
  status          jsonb NOT NULL DEFAULT '{"kind":"in_progress"}',
  result          text,                        -- '1-0' | '0-1' | '1/2-1/2' | null
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_id, board_number)
);

-- The append-only event log. Every move, result, or round-creation the
-- desktop app's outbox sends lands here first; published_rounds/games are
-- then updated to match. `client_event_id` is generated locally by the
-- outbox (a UUID) so a retried push after a dropped connection is a no-op
-- on the server rather than a duplicate move.
CREATE TABLE publish_events (
  id               bigserial PRIMARY KEY,
  tournament_id    uuid NOT NULL REFERENCES published_tournaments(id) ON DELETE CASCADE,
  client_event_id  uuid NOT NULL,
  type             text NOT NULL, -- 'tournament_created' | 'round_created' | 'game_move' | 'game_result' | ...
  payload          jsonb NOT NULL,
  occurred_at      timestamptz NOT NULL, -- when the arbiter's app recorded it, not when it arrived
  received_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, client_event_id)
);

-- Catch-up queries are always "events after seq N for this tournament".
CREATE INDEX idx_publish_events_tournament_id
  ON publish_events (tournament_id, id);

CREATE INDEX idx_published_games_tournament_id
  ON published_games (tournament_id);