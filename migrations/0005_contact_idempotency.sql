-- Migration number: 0005	2026-08-23
-- Contact create idempotency (Step-4 review fix 2): same logical create
-- request retried (double-click, network retry) resolves to exactly one
-- contact row — same mechanism as activities/tasks.

ALTER TABLE contacts ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX uq_contacts_client_request
  ON contacts(organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
