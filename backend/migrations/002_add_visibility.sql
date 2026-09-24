-- 002_add_visibility.sql
-- Adds real on/off support to publishing: `visible` controls whether a
-- tournament shows up in the public list/snapshot/catch-up endpoints at
-- all. Separate from `status` (which tracks tournament progress --
-- in_progress/complete) -- a tournament can be complete AND visible, or
-- in_progress AND hidden (arbiter toggled it off mid-event).
--
-- Defaults to true so every tournament published before this migration
-- keeps behaving exactly as it did (visible to anyone who could already see
-- it).

ALTER TABLE published_tournaments ADD COLUMN visible boolean NOT NULL DEFAULT true;