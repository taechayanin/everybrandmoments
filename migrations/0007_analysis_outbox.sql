-- Migration number: 0007	2026-08-23
-- Durable AI-analysis dispatch (Step-6 review P0): the outbox state rides on
-- the activity row itself, written in the SAME batch as the activity insert —
-- an activity can never exist without its dispatch record.
--
-- Lifecycle: PENDING (written with the activity) → QUEUED (enqueue confirmed)
-- → PROCESSED (consumer finished: suggestion stored or safe-skip). NULL =
-- not eligible (system rows / pre-0007 rows — no backfill by design).
-- A cron reconciler re-enqueues stale PENDING/QUEUED rows; the deterministic
-- suggestion id (SUG-<activityId>) keeps duplicate delivery harmless.

ALTER TABLE activities ADD COLUMN analysis_status TEXT
  CHECK (analysis_status IS NULL OR analysis_status IN ('PENDING','QUEUED','PROCESSED'));

CREATE INDEX idx_activities_analysis_outbox
  ON activities(analysis_status, updated_at)
  WHERE analysis_status IN ('PENDING','QUEUED');
