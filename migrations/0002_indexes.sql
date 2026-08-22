-- Initial indexes (refactor plan §23) — created up front, not after
-- performance becomes a problem.

CREATE INDEX idx_accounts_org_owner
ON accounts(organization_id, owner_id);

CREATE INDEX idx_moment_account_status
ON moment_events(account_id, status);

CREATE INDEX idx_moment_priority_date
ON moment_events(expected_event_date, status);

CREATE INDEX idx_moment_owner_status
ON moment_events(owner_id, status);

CREATE INDEX idx_signals_account_detected
ON moment_signals(account_id, detected_at);

CREATE INDEX idx_opportunity_owner_stage
ON opportunities(owner_id, stage);

CREATE INDEX idx_opportunity_account
ON opportunities(account_id);

CREATE INDEX idx_contacts_account
ON contacts(account_id);

CREATE INDEX idx_orders_account_date
ON orders_external(account_id, order_date);

CREATE INDEX idx_audit_entity
ON audit_logs(entity_type, entity_id);
