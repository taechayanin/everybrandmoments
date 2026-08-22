-- Moment OS — Phase 2 initial schema (normalized, refactor plan §14–22)
-- Every business table carries organization_id for tenancy from day 1 (§15, §37).

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  nickname TEXT,
  role TEXT NOT NULL,
  center TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  employee_size INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  branch_count INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL,
  owner_id TEXT,
  customer_since TEXT,
  lifetime_value REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  health TEXT NOT NULL,
  account_score INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,

  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE master_moments (
  code TEXT PRIMARY KEY,
  no INTEGER NOT NULL UNIQUE,
  phase TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE moment_discovery_questions (
  id TEXT PRIMARY KEY,
  moment_code TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  question TEXT NOT NULL,

  FOREIGN KEY (moment_code) REFERENCES master_moments(code)
);

CREATE TABLE master_moment_next (
  moment_code TEXT NOT NULL,
  next_moment_code TEXT NOT NULL,

  PRIMARY KEY (moment_code, next_moment_code),
  FOREIGN KEY (moment_code) REFERENCES master_moments(code),
  FOREIGN KEY (next_moment_code) REFERENCES master_moments(code)
);

CREATE TABLE moment_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  moment_code TEXT NOT NULL,
  sub_moment TEXT NOT NULL,

  trigger_source TEXT NOT NULL,
  trigger_detail TEXT,

  detected_at TEXT NOT NULL,
  expected_event_date TEXT,

  score_business_fit INTEGER NOT NULL DEFAULT 0,
  score_intent INTEGER NOT NULL DEFAULT 0,
  score_timing INTEGER NOT NULL DEFAULT 0,
  score_wallet INTEGER NOT NULL DEFAULT 0,
  score_relationship INTEGER NOT NULL DEFAULT 0,

  potential_wallet_min REAL NOT NULL DEFAULT 0,
  potential_wallet_max REAL NOT NULL DEFAULT 0,

  recommended_action TEXT,
  owner_id TEXT,
  status TEXT NOT NULL,
  next_expected_moment TEXT,

  channel TEXT,

  detection_confidence REAL,
  detected_by TEXT,
  verified_by TEXT,
  verified_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (moment_code) REFERENCES master_moments(code),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE moment_event_stakeholders (
  moment_event_id TEXT NOT NULL,
  stakeholder TEXT NOT NULL,

  PRIMARY KEY (moment_event_id, stakeholder),
  FOREIGN KEY (moment_event_id) REFERENCES moment_events(id)
);

-- AI / signal evidence (§20): the team must always be able to answer
-- "ทำไมระบบคิดว่าลูกค้ากำลังเปิดสาขา?"
CREATE TABLE moment_signals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  moment_event_id TEXT,

  source_type TEXT NOT NULL,
  source_ref TEXT,
  source_url TEXT,
  raw_text TEXT,

  confidence REAL,
  detected_at TEXT NOT NULL,

  model_name TEXT,
  model_version TEXT,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (moment_event_id) REFERENCES moment_events(id)
);

CREATE TABLE solutions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  moment_code TEXT NOT NULL,
  starting_price REAL NOT NULL DEFAULT 0,
  average_wallet REAL NOT NULL DEFAULT 0,
  gross_margin_target REAL NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  production_required INTEGER NOT NULL DEFAULT 0,
  recommended_offline INTEGER NOT NULL DEFAULT 0,
  next_moment TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (moment_code) REFERENCES master_moments(code)
);

CREATE TABLE solution_stakeholders (
  solution_id TEXT NOT NULL,
  stakeholder TEXT NOT NULL,

  PRIMARY KEY (solution_id, stakeholder),
  FOREIGN KEY (solution_id) REFERENCES solutions(id)
);

CREATE TABLE solution_industries (
  solution_id TEXT NOT NULL,
  industry TEXT NOT NULL,

  PRIMARY KEY (solution_id, industry),
  FOREIGN KEY (solution_id) REFERENCES solutions(id)
);

CREATE TABLE solution_packages (
  id TEXT PRIMARY KEY,
  solution_id TEXT NOT NULL,
  name TEXT NOT NULL,
  starting_price REAL NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL,

  FOREIGN KEY (solution_id) REFERENCES solutions(id)
);

CREATE TABLE moment_event_solutions (
  moment_event_id TEXT NOT NULL,
  solution_id TEXT NOT NULL,

  PRIMARY KEY (moment_event_id, solution_id),
  FOREIGN KEY (moment_event_id) REFERENCES moment_events(id),
  FOREIGN KEY (solution_id) REFERENCES solutions(id)
);

-- ID-based relations only (§21) — relation types: CROSS_SELL / UPSELL /
-- BUNDLE / NEXT / ALTERNATIVE.
CREATE TABLE solution_relations (
  source_solution_id TEXT NOT NULL,
  target_solution_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,

  PRIMARY KEY (source_solution_id, target_solution_id, relation_type),
  FOREIGN KEY (source_solution_id) REFERENCES solutions(id),
  FOREIGN KEY (target_solution_id) REFERENCES solutions(id)
);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  moment_event_id TEXT NOT NULL,
  account_id TEXT NOT NULL,

  name TEXT NOT NULL,

  expected_revenue REAL NOT NULL,
  expected_gp REAL NOT NULL,

  close_date TEXT,
  stage TEXT NOT NULL,

  owner_id TEXT,
  next_action TEXT,
  sla_hours INTEGER,
  channel TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (moment_event_id) REFERENCES moment_events(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE opportunity_solutions (
  opportunity_id TEXT NOT NULL,
  solution_id TEXT NOT NULL,

  PRIMARY KEY (opportunity_id, solution_id),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
  FOREIGN KEY (solution_id) REFERENCES solutions(id)
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  moment_event_id TEXT,
  center TEXT NOT NULL,
  datetime TEXT NOT NULL,
  consultant_id TEXT,
  need TEXT,
  expected_wallet REAL NOT NULL DEFAULT 0,
  samples_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (moment_event_id) REFERENCES moment_events(id),
  FOREIGN KEY (consultant_id) REFERENCES users(id)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT,
  moment_event_id TEXT,
  opportunity_id TEXT,
  title TEXT NOT NULL,
  due_date TEXT,
  assignee_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- File metadata; binary content lives in R2 under the stored key (§2.3).
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT,
  moment_event_id TEXT,
  opportunity_id TEXT,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- External identity mapping (§44) — never assume CRM ID = ERP ID = Moment OS ID.
CREATE TABLE account_external_ids (
  account_id TEXT NOT NULL,
  system TEXT NOT NULL,
  external_id TEXT NOT NULL,

  PRIMARY KEY (account_id, system),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- ERP stays the source of transaction truth; we store references (§43).
CREATE TABLE orders_external (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  erp_customer_code TEXT,
  erp_project_id TEXT,
  erp_order_id TEXT,
  item TEXT,
  moment_code TEXT,
  order_date TEXT,
  revenue REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  status TEXT,
  last_synced_at TEXT,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE deliveries_external (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  order_external_id TEXT NOT NULL,
  delivery_date TEXT,
  status TEXT,
  last_synced_at TEXT,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (order_external_id) REFERENCES orders_external(id)
);

-- Transitional snapshot of the whitespace map. Target state (§32) derives
-- whitespace from orders_external + solution categories; this table keeps the
-- UI working until that derivation ships, and must not become primary truth.
CREATE TABLE account_whitespace (
  account_id TEXT NOT NULL,
  category TEXT NOT NULL,
  bought INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (account_id, category),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  moment_code TEXT NOT NULL,
  priority TEXT,
  action TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (moment_code) REFERENCES master_moments(code)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
