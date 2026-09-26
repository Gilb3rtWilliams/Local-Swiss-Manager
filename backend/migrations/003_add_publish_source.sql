-- backend/migrations/003_add_publish_source.sql
-- Tags which tournaments came from the desktop app vs. created directly on
-- the website, so the dashboard can badge them. Defaults to 'web' so every
-- existing tournament keeps behaving exactly as before this migration.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';