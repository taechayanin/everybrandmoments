# REVIEW PACKET

## Step
Step 2 — CRM Activity Layer: Repositories (interfaces + mock + D1 adapters + tests)

## Goal
วาง data-access layer ของ CRM ตาม IMPLEMENTATION_PLAN.md (rev 4, approved): Activity/Task/Contact/Suggestion repositories + `InteractionWriteRepository` unit-of-work — **ยังไม่มี use case / server action / UI (Step 3–4)**

## Commit
`8a460ec`

## Files Changed
- `lib/repositories/index.ts` — interfaces ใหม่ 5 ชุด + input types + `Repositories` เพิ่ม `activities/tasks/contacts/suggestions/interactions`
- `lib/infrastructure/cloudflare/d1/repositories.ts` — D1 adapters ทั้ง 5 + row mappers + shared insert-statement helpers
- `lib/infrastructure/mock/repositories.ts` — mock adapters ทั้ง 5 (mirror semantics เดียวกัน; contacts seed จาก embedded account data ตรงกับ id ใน seed.sql)
- `lib/domain/activity.ts` — เพิ่ม `CrmContact`, `ActivitySuggestion` entities
- `lib/types.ts` — barrel export `domain/activity`
- `tests/crm-repositories.test.ts` (ใหม่) — 11 เทสต์

## Architecture Changes
ตาม layer เดิม — จุดที่ต้องรีวิว: **`InteractionWriteRepository`** (plan rev 2 item 4) แยก unit-of-work ออกจาก entity repository:
- `ActivityRepository`/`TaskRepository` = CRUD ของ entity ตัวเองล้วน ๆ ไม่แตะข้าม table
- `D1InteractionWriteRepository.logInteraction()` ประกอบ statement จาก helper ที่ใช้ร่วมกับ repo ปกติ → ยิง **`db.batch()` เดียว**: activity INSERT OR IGNORE + follow-up task INSERT OR IGNORE (key `ACTIVITY:<requestId>:FOLLOWUP`) + audit INSERT OR IGNORE (deterministic id `AUD-ACT-<requestId>`) → read-back survivor ด้วย unique key → `deduped` flag
- โยน error ถ้าไม่มี `clientRequestId` (unit ทั้งหมด key จากมัน)

## Database / Migration
ไม่มี migration ใหม่ — ใช้ 0004 จาก Step 1 (ยังไม่ apply remote)

## Repository / Use Case Changes
- `ActivityRepository`: getById, **listByAccount (keyset `occurred_at DESC, id DESC`, default 20, filter by types, ไม่เห็น soft-deleted)**, listRecentByAccounts (ROW_NUMBER OVER PARTITION — 1 query/chunk ≤50), create (idempotent), update, softDelete (guarded `deleted_at IS NULL`), lastActivityByOpportunities (GROUP BY MAX — spec §27)
- `TaskRepository`: create (idempotent), complete (guarded `status IN (OPEN,IN_PROGRESS)` → idempotent), listByAssignee (overdue/today/upcoming — `today` มาจาก clock ของ caller), listByAccount, listByOpportunity
- `ContactRepository`: getById/getByIds (chunked)/listByAccount (primary-first)/create/update
- `SuggestionRepository`: getById/create/listPendingByAccount (JOIN activities เพื่อ scope account — table ไม่มี account_id ตรง)
- ทุก query scope `organization_id = ?`

## API / Server Actions
ไม่มี (Step 3)

## UI / UX
ไม่มี (Step 4)

## Figma Comparison
N/A — ไม่มี UI ใน step นี้; Figma link ยังเป็น open item ก่อน Step 4

## Security
- Organization Scope: ทุก SELECT/UPDATE/INSERT ใน adapters ใหม่ bind `ORG`; suggestions JOIN ตรวจ `a.organization_id = s.organization_id`
- Validation: repositories รับ typed inputs — zod strict อยู่ที่ boundary (Step 3 server actions)
- Write Gate: ยังไม่แตะ (Step 3)
- Soft delete guard กัน double-delete; complete guard กันข้าม state

## Performance
- Timeline: 1 keyset query (LIMIT n+1, ไม่มี OFFSET) — ตรงเป้า spec §24/§53
- listRecentByAccounts: window function 1 query ต่อ chunk ≤50 — ไม่ loop ต่อ account
- lastActivityByOpportunities: GROUP BY 1 query ต่อ chunk
- ไม่มี N+1 ใหม่; ไม่มี unbounded query ใหม่

## Tests Added
`tests/crm-repositories.test.ts` — 11 เทสต์: activity create idempotency, keyset 25 แถว 2 หน้า (ไม่ overlap, DESC order ตรวจทุกคู่), type filter + soft delete, lastActivity max ต่อ opportunity, **logInteraction unit idempotency (activity+task คู่กัน, replay → deduped + id เดิมทั้งคู่)**, missing clientRequestId → throw, task complete idempotent, due bands แยกถูก, contacts seed primary-first + DECISION_MAKER, contact create/update round-trip, suggestions PENDING scope ต่อ account

## Test Results
66 / 66 passing (9 files)

## Typecheck
PASS

## Lint
PASS

## Build
PASS

## D1 Verification (local, executed)
- ROW_NUMBER OVER (PARTITION BY) รันได้จริงบน D1 local — คืน rn=1 ต่อ account ถูกต้อง
- Unique index `uq_activities_client_request` dedupe จริง: INSERT 2 แถว key เดียว → survivor 1 แถว
- (production incident ก่อนหน้า resolve แล้ว: root cause = Secret-Change version; redeploy แล้ว ทุก route 200)

## Known Limitations
- Mock `listRecentByAccounts` loop ต่อ account ใน memory (semantics เท่ากัน; D1 ใช้ window function)
- Contact create ไม่มี client_request_id dedupe (table ไม่มีคอลัมน์ — ตามแผน; double-submit contact เป็น edge ที่ Step 3 ป้องกันที่ form)
- `InteractionWriteRepository` ยังไม่ถูกเรียกจากที่ไหน (Step 3)

## Decisions / Trade-offs
- `lastActivityByOpportunities` วางบน `ActivityRepository` (data อยู่ table activities) แทน `OpportunityRepository` ตามตัวอักษรของแผน — พฤติกรรม/จำนวน query เท่ากัน แจ้งเป็น deviation ให้ตัดสิน
- Audit id ใช้ `AUD-ACT-<requestId>` (idempotent ผ่าน PK) — สอดคล้อง pattern `AUD:SUG:` ที่วางไว้สำหรับ Step 6

## Things Reviewer Should Check Carefully
1. `logInteraction`: batch มี guard เฉพาะ unique keys (ไม่มี WHERE EXISTS ข้าม statement) — เพียงพอสำหรับเคสนี้เพราะทุก statement เป็น INSERT OR IGNORE ที่ key จาก requestId เดียวกัน (ไม่มีเงื่อนไขสถานะแบบ suggestion accept)
2. Keyset cursor เป็น plain `occurredAt|id` (ไม่ encode) — client จะเห็นค่า; ยอมรับได้ไหมหรืออยากให้ base64
3. `listByAssignee` ตัด task ที่ `due_date IS NULL` ออกทุก band — ตีความจาก spec §18; ถูกต้องตามที่ตั้งใจไหม

## Next Proposed Step
Step 3 — Use Cases + Server Actions (create-note/log-call/log-meeting/create-follow-up/contacts/get-account-timeline/get-my-work-today + write gate + zod + idempotency wiring) — รอ `REVIEW APPROVED — PROCEED`
