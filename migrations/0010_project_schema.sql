-- 0010: Project schema evolution (Project Pipeline Step 2, plan §2).
-- Forward-only rebuild (same pattern as 0004). The Opportunity entity IS the
-- Project — two axes: status (DRAFT/ACTIVE/WON/LOST/CANCELLED) × sales_stage
-- (6 funnel stages, ACTIVE only). tests/project-schema-step2.test.ts pins the
-- CHECKs and the legacy mapping to lib/domain/opportunity.ts (drift test).
--
-- Legacy mapping (historical truth preserved — no fabricated context):
--   stage 'Discovery'       -> status ACTIVE,  sales_stage DISCOVERY
--   stage 'Solution Design' -> status ACTIVE,  sales_stage SOLUTION_DESIGN
--   stage 'Proposal'        -> status ACTIVE,  sales_stage PROPOSAL
--   stage 'Negotiation'     -> status ACTIVE,  sales_stage NEGOTIATION
--   stage 'Won'             -> status WON,     sales_stage NULL (no synthetic closing stage)
--   stage 'Lost'            -> status LOST,    sales_stage NULL, lost_reason = legacy sentinel text
--   industry_id             -> from the account's 0009 backfill at migration time
--   project_type_id         -> 'PT-UNSPECIFIED' (legacy sentinel; never selectable for new projects)
--   moment_event_id         -> unchanged

-- Preflight expectation (verified before running, re-verified at the remote
-- gate): every legacy stage value is one of the six above; accounts of
-- ACTIVE-mapping rows have industry_id set; owner_id/next_action non-null.

CREATE TABLE opportunities_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  moment_event_id TEXT NOT NULL REFERENCES moment_events(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),

  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'WON', 'LOST', 'CANCELLED')),
  sales_stage TEXT CHECK (sales_stage IN ('NEW_BRIEF', 'DISCOVERY', 'QUALIFIED', 'SOLUTION_DESIGN', 'PROPOSAL', 'NEGOTIATION')),

  industry_id TEXT REFERENCES industries(id),
  sub_industry_id TEXT REFERENCES industries(id),
  project_type_id TEXT REFERENCES project_types(id),
  brief TEXT,

  expected_revenue REAL NOT NULL,
  expected_gp REAL NOT NULL,
  close_date TEXT,
  expected_delivery_date TEXT,

  owner_id TEXT REFERENCES users(id),
  next_action TEXT,
  next_action_date TEXT,
  lost_reason TEXT,
  cancel_reason TEXT,

  client_request_id TEXT,
  sla_hours INTEGER,
  channel TEXT,

  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Paired invariant: a stage exists exactly when the project is ACTIVE.
  CHECK ((status = 'ACTIVE') = (sales_stage IS NOT NULL)),
  -- Closed statuses must carry their reason.
  CHECK (status <> 'LOST' OR lost_reason IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
  -- ACTIVE minimum context (DB-enforceable subset; the full activation gate —
  -- selectable project type + next_action_date — is domain-enforced because
  -- legacy ACTIVE rows legitimately carry PT-UNSPECIFIED / NULL date).
  CHECK (status <> 'ACTIVE' OR (industry_id IS NOT NULL AND project_type_id IS NOT NULL AND owner_id IS NOT NULL AND next_action IS NOT NULL))
);

INSERT INTO opportunities_new (
  id, organization_id, moment_event_id, account_id, name,
  status, sales_stage,
  industry_id, sub_industry_id, project_type_id, brief,
  expected_revenue, expected_gp, close_date, expected_delivery_date,
  owner_id, next_action, next_action_date, lost_reason, cancel_reason,
  client_request_id, sla_hours, channel, created_by, created_at, updated_at
)
SELECT
  o.id, o.organization_id, o.moment_event_id, o.account_id, o.name,
  CASE o.stage
    WHEN 'Won' THEN 'WON'
    WHEN 'Lost' THEN 'LOST'
    ELSE 'ACTIVE'
  END,
  CASE o.stage
    WHEN 'Discovery' THEN 'DISCOVERY'
    WHEN 'Solution Design' THEN 'SOLUTION_DESIGN'
    WHEN 'Proposal' THEN 'PROPOSAL'
    WHEN 'Negotiation' THEN 'NEGOTIATION'
    ELSE NULL
  END,
  (SELECT a.industry_id FROM accounts a WHERE a.id = o.account_id),
  NULL,
  'PT-UNSPECIFIED',
  NULL,
  o.expected_revenue, o.expected_gp, o.close_date, NULL,
  o.owner_id, o.next_action, NULL,
  CASE o.stage WHEN 'Lost' THEN 'legacy: ไม่ได้บันทึกเหตุผล (ข้อมูลเก่า)' ELSE NULL END,
  NULL,
  NULL, o.sla_hours, o.channel, NULL, o.created_at, o.updated_at
FROM opportunities o;

DROP TABLE opportunities;
ALTER TABLE opportunities_new RENAME TO opportunities;

CREATE INDEX idx_opportunities_owner_status ON opportunities(owner_id, status);
CREATE INDEX idx_opportunities_account ON opportunities(account_id);
CREATE INDEX idx_opportunities_org_status_stage ON opportunities(organization_id, status, sales_stage);
-- Create-Project idempotency (retry / double-submit protection).
CREATE UNIQUE INDEX uq_opportunities_client_request
  ON opportunities(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 2) Stage/status history — the substrate for Step-3 atomic
--    update + history + audit and for conversion analytics going forward.
--    No rows are fabricated for migrated data (history starts now).
CREATE TABLE project_stage_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  from_status TEXT CHECK (from_status IN ('DRAFT', 'ACTIVE', 'WON', 'LOST', 'CANCELLED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('DRAFT', 'ACTIVE', 'WON', 'LOST', 'CANCELLED')),
  from_stage TEXT CHECK (from_stage IN ('NEW_BRIEF', 'DISCOVERY', 'QUALIFIED', 'SOLUTION_DESIGN', 'PROPOSAL', 'NEGOTIATION')),
  to_stage TEXT CHECK (to_stage IN ('NEW_BRIEF', 'DISCOVERY', 'QUALIFIED', 'SOLUTION_DESIGN', 'PROPOSAL', 'NEGOTIATION')),
  reason TEXT,
  changed_by TEXT REFERENCES users(id),
  changed_at TEXT NOT NULL,
  client_request_id TEXT
);
CREATE INDEX idx_psh_opportunity ON project_stage_history(opportunity_id, changed_at);
CREATE UNIQUE INDEX uq_psh_client_request
  ON project_stage_history(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 3) Project ↔ Contact buying-committee roles. Same-organization membership
--    is enforced by the repository write (INSERT … SELECT WHERE EXISTS);
--    same-account ownership enforcement is reserved for the Step-3 use case.
CREATE TABLE project_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  role TEXT NOT NULL CHECK (role IN ('DECISION_MAKER', 'CHAMPION', 'PROCUREMENT', 'MAIN_CONTACT')),
  created_at TEXT NOT NULL,
  UNIQUE (opportunity_id, contact_id, role)
);
CREATE INDEX idx_project_contacts_opportunity ON project_contacts(opportunity_id);
