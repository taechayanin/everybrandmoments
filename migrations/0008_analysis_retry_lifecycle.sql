-- Migration number: 0008	2026-08-23
-- Bounded analysis retry lifecycle (Step-6 review round 2): the outbox gains
-- FAILED/BLOCKED terminal states plus durable retry metadata. SQLite cannot
-- widen a CHECK in place → rebuild.
--
--   PENDING/QUEUED  — retryable while attempt budget remains
--   PROCESSED       — intentionally completed (success or approved skip)
--   BLOCKED         — configuration failure; operator reset required
--   FAILED          — attempt budget exhausted; operator reset required

PRAGMA defer_foreign_keys = on;

CREATE TABLE activities_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  contact_id TEXT REFERENCES contacts(id),
  opportunity_id TEXT REFERENCES opportunities(id),
  moment_event_id TEXT REFERENCES moment_events(id),

  activity_type TEXT NOT NULL CHECK (activity_type IN
    ('NOTE','CALL','MEETING','EMAIL','LINE','VISIT',
     'TASK','TASK_COMPLETED',
     'MOMENT_DETECTED','MOMENT_VERIFIED','MOMENT_REJECTED',
     'OPPORTUNITY_CREATED','OPPORTUNITY_STAGE_CHANGED',
     'OPPORTUNITY_WON','OPPORTUNITY_LOST',
     'SYSTEM')),

  title TEXT,
  body TEXT,

  outcome TEXT,
  next_action TEXT,
  next_action_at TEXT,

  occurred_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  metadata_json TEXT,

  client_request_id TEXT,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),

  analysis_status TEXT CHECK (analysis_status IS NULL OR analysis_status IN
    ('PENDING','QUEUED','PROCESSED','FAILED','BLOCKED')),
  analysis_attempt_count INTEGER NOT NULL DEFAULT 0,
  analysis_last_error TEXT,
  analysis_last_attempt_at TEXT,
  analysis_next_retry_at TEXT
);

INSERT INTO activities_new (
  id, organization_id, account_id, contact_id, opportunity_id, moment_event_id,
  activity_type, title, body, outcome, next_action, next_action_at,
  occurred_at, created_by, created_at, updated_at, metadata_json,
  client_request_id, deleted_at, deleted_by, analysis_status
)
SELECT
  id, organization_id, account_id, contact_id, opportunity_id, moment_event_id,
  activity_type, title, body, outcome, next_action, next_action_at,
  occurred_at, created_by, created_at, updated_at, metadata_json,
  client_request_id, deleted_at, deleted_by, analysis_status
FROM activities;

DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;

CREATE INDEX idx_activities_org_account_date
  ON activities(organization_id, account_id, occurred_at DESC);
CREATE INDEX idx_activities_org_creator_date
  ON activities(organization_id, created_by, occurred_at DESC);
CREATE UNIQUE INDEX uq_activities_client_request
  ON activities(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX idx_activities_analysis_outbox
  ON activities(analysis_status, updated_at)
  WHERE analysis_status IN ('PENDING','QUEUED');
