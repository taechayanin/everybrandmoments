-- Migration number: 0006	2026-08-23
-- System moment activities (Step 5): MOMENT_DETECTED rows are written by the
-- detection worker / rule cron — there is no human actor, so created_by
-- becomes nullable (SQLite cannot drop NOT NULL in place → rebuild).
-- Human-write paths still always set created_by at the application layer.

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
  deleted_by TEXT REFERENCES users(id)
);

INSERT INTO activities_new SELECT * FROM activities;

DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;

CREATE INDEX idx_activities_org_account_date
  ON activities(organization_id, account_id, occurred_at DESC);
CREATE INDEX idx_activities_org_creator_date
  ON activities(organization_id, created_by, occurred_at DESC);
CREATE UNIQUE INDEX uq_activities_client_request
  ON activities(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
