-- Pre-deploy hardening (code review 2026-08-23):
-- database-level idempotency for moment creation and signal ingestion.

-- Occurrence-scoped dedupe for detected moments (review §4–5).
-- Examples:
--   SIGNAL:ORG-001:ACC-001:EBM Expand
--   RULE-RETURN-180:ORG-001:ACC-001:2025-09-12
--   RULE-ANNIVERSARY:ORG-001:ACC-001:2026
ALTER TABLE moment_events ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX uq_moment_dedupe
ON moment_events (organization_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;

-- Signal ingestion idempotency + processing lifecycle (review §6).
-- processing_status: pending → queued → processed | failed
ALTER TABLE moment_signals ADD COLUMN ingest_key TEXT;
ALTER TABLE moment_signals ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX uq_signal_ingest
ON moment_signals (organization_id, ingest_key)
WHERE ingest_key IS NOT NULL;

CREATE INDEX idx_signal_processing
ON moment_signals (organization_id, processing_status, detected_at);

-- Tenant-first indexes for the hot radar path (review 🟢 §6–7).
CREATE INDEX idx_moment_org_account_status
ON moment_events (organization_id, account_id, status);
