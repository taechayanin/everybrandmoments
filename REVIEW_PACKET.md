# REVIEW PACKET

## Step
Step 1 — CRM Activity Layer: Migration 0004 + Domain + Zod Contracts + Seed + local migration tests

## Goal
วางฐานข้อมูลและ domain layer ของ CRM Activity Layer ตาม IMPLEMENTATION_PLAN.md (rev 4, approved): ตาราง `activities` + `activity_ai_suggestions`, rebuild `contacts`/`tasks` ให้ relationally safe, enum เดียวทุกชั้น, idempotency keys — **ยังไม่มี repository/use case/UI (Step 2–4)**

## Commit
`69b9e72`

## Files Changed
- `migrations/0004_crm_activity_layer.sql` (ใหม่) — 4 ส่วนตามแผน
- `lib/domain/activity.ts` (ใหม่) — branded ids (ACT/TSK/CT/SUG) + guards, enums ทั้งหมด (`ACTIVITY_TYPES` 16, `CALL_OUTCOMES` 7, `MEETING_TYPES` 6, `CONTACT_ROLES` 8, `TASK_STATUSES`/`TASK_PRIORITIES` 4/4, `INFLUENCE_LEVELS`, `CONTACT_STATUSES`, `SUGGESTION_STATUSES`), stable key helpers (`followUpTaskKey`, `suggestionTaskKey`), entity interfaces (Activity, CrmTask, ActivityAnalysis)
- `lib/contracts/crm.ts` (ใหม่) — strict zod: CreateNote/LogCall/LogMeeting/UpdateActivity/CreateTask/CompleteTask/CreateContact/UpdateContact/ActivityAnalysis/DecideSuggestion + typed metadata schemas; ทุก string/array มี max; วันที่ตรวจ real-calendar; `clientRequestId` บังคับในทุก create
- `scripts/generate-seed.ts` + `seed/seed.sql` — contacts INSERT เป็น schema ใหม่ (first contact = DECISION_MAKER), sample activities 6 แถวใน 3 accounts, CLEAR_ORDER เพิ่ม activity_ai_suggestions/activities
- `lib/infrastructure/cloudflare/d1/repositories.ts` — **1 จุด compatibility**: contact mapper อ่าน `job_title ?? role` (โค้ดเดิมอ่านคอลัมน์ `role` ที่ถูก rename — ไม่แตะจุดอื่น, Contact CRM model เต็มมาใน Step 2)
- `tests/crm-contracts.test.ts` (ใหม่) — 14 เทสต์

## Architecture Changes
ไม่มีการเปลี่ยน layer — เพิ่ม domain module + contracts module ตามแบบเดิม (`lib/domain/*`, contracts แยกที่ `lib/contracts/` ด้วย relative import เพื่อให้ jobs worker ใช้ร่วมได้ใน Step 6)

## Database / Migration
`0004_crm_activity_layer.sql` (applied **local เท่านั้น**):
1. **contacts rebuild** — `organization_id NOT NULL` derive จาก owning account ด้วย `LEFT JOIN` (orphan → NULL → NOT NULL violation → fail ดัง ไม่ทิ้งแถวเงียบ ๆ), legacy `role`→`job_title`, เพิ่ม department/line_id/buying_role/influence_level/status/notes/updated_at + CHECKs + `idx_contacts_org_account`
2. **tasks rebuild** — FK ครบ 7 (org/account/contact/moment_event/opportunity/assignee/created_by), `client_request_id` + `uq_tasks_client_request` partial unique, status normalize `CASE ... ELSE NULL` (unknown → fail ดัง), priority default NORMAL + CHECKs + `idx_tasks_org_assignee_due`
3. **activities** — ตาม spec §9 + `client_request_id` (+`uq_activities_client_request`), soft delete (`deleted_at/deleted_by`), CHECK activity_type 16 ค่า, indexes spec §40
4. **activity_ai_suggestions** — payload_json + confidence CHECK 0–1 + status CHECK + index
- ลำดับ: contacts → tasks → activities → suggestions (**ต่างจากลำดับเลขในแผนที่เขียน activities ก่อน** — เหตุผล: ทุก FK ต้องชี้ตารางเวอร์ชันสุดท้าย; พฤติกรรมรวมเท่ากัน)
- `PRAGMA defer_foreign_keys = on` กัน FK-check กลาง rebuild window

## Repository / Use Case Changes
ไม่มี (Step 2) — ยกเว้น compatibility mapper 1 จุดข้างบน

## API / Server Actions
ไม่มี (Step 3)

## UI / UX
ไม่มี (Step 4)

## Figma Comparison
N/A — Step นี้ไม่มี UI; Figma link ยังคงเป็น open item ก่อนเริ่ม Step 4

## Security
- Authentication: ไม่เปลี่ยน (write gate เดิม)
- Organization Scope: contacts/activities/tasks/suggestions มี `organization_id NOT NULL` + FK → query ทุกตัวใน Step 2 scope ได้ที่ DB จริง; backfill ไม่ hardcode tenant
- Permissions: ไม่เปลี่ยน
- Validation: zod strict ทุก contract + DB CHECK ซ้ำอีกชั้น (defense in depth)
- Write Gate: ไม่เปลี่ยน

## Performance
- Query Count: ไม่มี query path ใหม่ใน runtime
- Pagination: index `(org, account, occurred_at DESC)` รองรับ keyset ของ Step 2
- N+1: N/A
- Caching: ไม่เปลี่ยน
- Known Risks: ไม่มีใหม่

## Tests Added
`tests/crm-contracts.test.ts` — 14 เทสต์สองกลุ่ม:
- Contracts: note valid/invalid, strict unknown-field + wrong-prefix id, call outcome enum, meeting budget ordering + type enum, task/contact enums, ActivityAnalysis bounds (moment code จาก catalog union, confidence ≤1), stable key determinism
- **Migration drift**: parse `0004` แล้วเทียบ CHECK IN(...) ทุกตัวกับ domain arrays (activity_type, task status/priority, buying_role, influence, contact status, suggestion status), confidence bounds, unique index สองตัวมี `WHERE client_request_id IS NOT NULL`, backfill ใช้ LEFT JOIN + ไม่มี hardcode ORG ใน INSERT, task CASE เป็น `ELSE NULL` ไม่ใช่ `ELSE 'OPEN'`

## Test Results
55 / 55 passing (8 files)

## Typecheck
PASS

## Lint
PASS

## Build
PASS (next build สำเร็จ)

## Local Migration Verification (executed)
- Preflight ทั้ง 6 query = 0 orphan/unknown (contacts 21, tasks 0 rows ก่อน migrate)
- Apply local: ✅ 8 commands
- หลัง apply: contacts 21→21 แถว, `organization_id='ORG-001'` ครบ 21, `job_title` ครบ 21; ตาราง+index ใหม่ครบทั้ง 10 ชื่อ
- CHECK enforcement ยิงจริง: activity_type แปลก / task status lowercase / confidence 1.5 → **fail ทั้งสามเคส**
- Re-seed schema ใหม่: 856 statements สำเร็จ → activities 6, DECISION_MAKER 20, contacts 21

## Known Limitations
- Migration ยังไม่ apply remote — ต้องผ่าน review + รัน preflight บน remote ก่อน (Workflow Rule 6)
- Domain `Contact` (UI-facing) ยังเป็น shape เดิม (`name/role/phone`) — CRM Contact เต็มรูปแบบมากับ ContactRepository ใน Step 2
- `activities.metadata_json` ยังไม่มี consumer — typed schemas เตรียมไว้แล้ว

## Decisions / Trade-offs
- ลำดับ section ใน migration ต่างจากเลขข้อในแผน (FK integrity — อธิบายข้างบน)
- Contact mapper compatibility fallback `job_title ?? role` — จำเป็นเพื่อไม่ให้ Account 360 เดิมพังหลัง migration ทั้ง local/remote; ลบ fallback ได้เมื่อ remote apply แล้ว
- Seed ตั้ง first contact ของทุก account เป็น DECISION_MAKER — ให้ UI Step 4 มีข้อมูลโชว์; ข้อมูลจริงทีมแก้ได้ใน UI

## Things Reviewer Should Check Carefully
1. Migration ordering + `PRAGMA defer_foreign_keys` — เพียงพอสำหรับ D1 remote apply ไหม (local ผ่านแล้ว)
2. `LogMeetingSchema` ใช้ `.refine` ระดับ object หลัง `.strict()` — พฤติกรรม unknown-field ยัง strict (มีเทสต์ยืนยัน)
3. Drift test ผูกกับ ordering ของ `as const` arrays — ถ้า reorder enum โดยไม่แตะ migration เทสต์จะ fail (ตั้งใจให้เข้มแบบนี้)

## Next Proposed Step
Step 2 — Repositories (Activity/Task/Contact/Suggestion/InteractionWrite + opportunity lastActivity, mock + D1, repo tests) — รอ `REVIEW APPROVED — PROCEED`
