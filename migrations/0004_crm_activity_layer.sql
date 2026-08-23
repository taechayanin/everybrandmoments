-- Migration number: 0004	2026-08-23
-- CRM Activity Layer (sprint spec §9–§17, §40–§41; plan rev 4 Step 1).
-- Forward-only. Ordering: contacts rebuild → tasks rebuild → activities →
-- activity_ai_suggestions, so every FK targets its final table.
-- Enum CHECK lists mirror lib/domain/activity.ts — pinned by the drift test
-- in tests/crm-contracts.test.ts.

-- Old-row FKs are checked at commit, not mid-rebuild.
PRAGMA defer_foreign_keys = on;

-- ============================================================
-- 1) contacts — rebuild with tenant scope + buying committee
--    (plan rev 3 item 1: organization_id derives from the owning
--    account via LEFT JOIN; an orphaned contact yields NULL and
--    violates NOT NULL, failing this migration loudly instead of
--    silently dropping rows.)
-- ============================================================

CREATE TABLE contacts_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  line_id TEXT,
  buying_role TEXT CHECK (buying_role IS NULL OR buying_role IN
    ('DECISION_MAKER','INFLUENCER','CHAMPION','PROCUREMENT','USER','FINANCE','GATEKEEPER','OTHER')),
  influence_level TEXT CHECK (influence_level IS NULL OR influence_level IN
    ('HIGH','MEDIUM','LOW')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO contacts_new (
  id, organization_id, account_id, name, job_title, email, phone,
  is_primary, status, created_at, updated_at
)
SELECT
  c.id,
  a.organization_id,        -- tenant-safe: derived, never hardcoded
  c.account_id,
  c.name,
  c.role,                   -- legacy free-text role was a job title
  c.email,
  c.phone,
  c.is_primary,
  'ACTIVE',
  c.created_at,
  c.created_at
FROM contacts c
LEFT JOIN accounts a ON a.id = c.account_id;

DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;

CREATE INDEX idx_contacts_org_account ON contacts(organization_id, account_id);

-- ============================================================
-- 2) tasks — rebuild with the full FK set + idempotency key
--    (plan rev 3 item 2 / rev 4 item 1). Unknown legacy statuses
--    map to NULL and violate NOT NULL + CHECK → fail loudly, never
--    silently OPEN.
-- ============================================================

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  account_id TEXT REFERENCES accounts(id),
  contact_id TEXT REFERENCES contacts(id),
  moment_event_id TEXT REFERENCES moment_events(id),
  opportunity_id TEXT REFERENCES opportunities(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  assignee_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status TEXT NOT NULL CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  completed_at TEXT,
  client_request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO tasks_new (
  id, organization_id, account_id, moment_event_id, opportunity_id,
  title, due_date, assignee_id, priority, status, created_at, updated_at
)
SELECT
  id, organization_id, account_id, moment_event_id, opportunity_id,
  title, due_date, assignee_id, 'NORMAL',
  CASE lower(status)
    WHEN 'open' THEN 'OPEN'
    WHEN 'in_progress' THEN 'IN_PROGRESS'
    WHEN 'done' THEN 'DONE'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE NULL  -- unknown legacy status → NOT NULL violation → migration fails
  END,
  created_at, created_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_org_assignee_due ON tasks(organization_id, assignee_id, due_date);
CREATE UNIQUE INDEX uq_tasks_client_request
  ON tasks(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ============================================================
-- 3) activities — the unified Account Timeline (spec §9)
-- ============================================================

CREATE TABLE activities (
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
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  metadata_json TEXT,

  client_request_id TEXT,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);

-- Timeline read path (spec §24, §40): keyset on (occurred_at DESC, id DESC).
CREATE INDEX idx_activities_org_account_date
  ON activities(organization_id, account_id, occurred_at DESC);
CREATE INDEX idx_activities_org_creator_date
  ON activities(organization_id, created_by, occurred_at DESC);
-- Idempotency (spec §56): double-click / retry resolves to the same row.
CREATE UNIQUE INDEX uq_activities_client_request
  ON activities(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ============================================================
-- 4) activity_ai_suggestions — AI output awaiting human decision
--    (spec §22; accepted/ignored via one atomic batch in Step 6)
-- ============================================================

CREATE TABLE activity_ai_suggestions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  activity_id TEXT NOT NULL REFERENCES activities(id),
  payload_json TEXT NOT NULL,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','IGNORED')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_suggestions_org_activity
  ON activity_ai_suggestions(organization_id, activity_id);
