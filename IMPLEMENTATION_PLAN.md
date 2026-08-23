# IMPLEMENTATION PLAN
## CRM Activity Layer Sprint — Moment OS as the Daily Workspace

Spec: `Moment_OS_CRM_Activity_Layer_Sprint.md` · Workflow: `Moment_OS_Claude_Code_Development_Workflow.md`
Status: **AWAITING PLAN REVIEW — no code written**

---

## Goal

ทีม Customer Solution ใช้ Moment OS ทำงานทั้งวันได้จากระบบเดียว: เปิด Account 360 → อ่านประวัติ → จด Note / Log Call / Log Meeting (<60 วิ) → ตั้ง Follow-up → AI สกัด Moment/Need/Budget/Timing แบบ async → เห็นงานวันนี้ใน Command Center

## Non-Goals

- Email/LINE OA/WhatsApp/Calendar sync (log มือเท่านั้น)
- Attachments infrastructure (ออกแบบ data model ให้รองรับ แต่ไม่ build)
- Marketing automation, custom objects, permission builder
- Full Sprint 7 auth — ใช้ write gate + Cloudflare Access + temporary internal actor ไปก่อน (spec §37)

## Existing Architecture (inspected)

- Layered: UI → `lib/application/*` → `lib/repositories` interfaces → `lib/infrastructure/{mock,cloudflare/d1}` (สลับด้วย `MOMENT_OS_DATA_SOURCE`)
- มีอยู่แล้วและจะ **reuse ไม่สร้างซ้ำ**:
  - `contacts` table (0001) — แต่**ไม่มี** organization_id, job_title, department, line, buying role, influence, status, notes, updated_at
  - `tasks` table (0001) — มี org/account/moment/opportunity + title/due_date/assignee/status แต่**ไม่มี** contact_id, description, priority, created_by, completed_at, updated_at
  - `audit_logs`, `attachments` tables; `moment_events` + verification; `opportunities`; queue producer `MOMENT_JOBS`; jobs worker + DLQ consumer; `writesEnabled()` gate; zod contracts ใน `lib/jobs/contracts.ts`; AI detection pattern (`ai-detection.ts`) พร้อม prompt-injection hardening
- Migrations 0001–0003 applied remote แล้ว → ทุกอย่างใหม่คือ **forward migration 0004**

## Current Problems

1. ไม่มีที่บันทึกบทสนทนากับลูกค้า → knowledge อยู่ในหัวคน/LINE/Excel
2. Contact ไม่มี buying role → ไม่รู้ Decision Maker
3. Task มีแต่ table ยังไม่มี UI/use case จริง
4. Command Center ไม่บอกว่า "วันนี้ต้องทำอะไร"
5. AI เห็นแต่ external signals ไม่เห็น conversation ที่ rich ที่สุด

## Proposed Architecture

Human activities เขียนลง table กลาง `activities` (Option A ของ spec §25 — system events สำคัญเขียน activity row อ้าง reference id, ไม่ duplicate business record) ผ่าน use case + repository ตาม layer เดิม. AI enrichment เป็น `ANALYZE_ACTIVITY` job บน queue เดิม — save ก่อน enqueue ทีหลัง, ล้มเหลวไม่กระทบข้อมูล. AI suggestions เก็บเป็น draft ให้คน Accept/Edit/Ignore (spec §22) — ไม่ auto-mutate.

## Files to Change (by step)

ดู Implementation Steps — แต่ละ step มีรายการไฟล์ของตัวเอง

## Data Model

### `activities` (ใหม่ — spec §9)
ตาม schema ใน spec + เพิ่มจากบทเรียนรอบก่อน:
- `client_request_id TEXT` + `UNIQUE(organization_id, client_request_id)` (partial, WHERE NOT NULL) — idempotency กัน double-click/retry (spec §56)
- `deleted_at TEXT`, `deleted_by TEXT` — soft delete (spec §31)
- `activity_type` เก็บเป็น TEXT ตรวจด้วย zod enum `ActivityType` (spec §10) — ไม่ free-form
- FK: account/contact/opportunity/moment_event ตาม spec; ทุก query scope `organization_id`

### `contacts` (ALTER — spec §15–16)
เพิ่ม: `organization_id` (backfill 'ORG-001' + NOT NULL ผ่าน table-rebuild ถ้าจำเป็น — D1/SQLite ADD COLUMN NOT NULL ต้องมี default), `job_title`, `department`, `line_id`, `buying_role` (zod enum ContactRole), `influence_level`, `status`, `notes`, `updated_at`

### `tasks` (ALTER — spec §17)
เพิ่ม: `contact_id`, `description`, `priority`, `created_by`, `completed_at`, `updated_at`. คง `status` ค่าเดิม (`open` → map เป็น OPEN/IN_PROGRESS/DONE/CANCELLED ใน domain layer เพื่อไม่ rewrite data)

### AI suggestions (ใหม่)
`activity_ai_suggestions`: id, organization_id, activity_id, payload_json (validated ActivityAnalysis), confidence, status (pending/accepted/ignored), created_at, decided_at, decided_by — รองรับ AI KPI (spec §50)

## Migration Plan

`migrations/0004_crm_activity_layer.sql` — forward only:
1. CREATE `activities` + indexes (spec §40): `(org, account, occurred_at DESC)`, `(org, created_by, occurred_at DESC)` + partial unique `client_request_id`
2. ALTER `contacts` เพิ่มคอลัมน์ (มี DEFAULT), CREATE INDEX `(organization_id, account_id)`
3. ALTER `tasks` เพิ่มคอลัมน์, CREATE INDEX `(organization_id, assignee_id, due_date)`
4. CREATE `activity_ai_suggestions` + index `(organization_id, activity_id)`
5. Seed generator: เพิ่ม activities ตัวอย่าง + contacts fields + CLEAR_ORDER ปรับ (activities, activity_ai_suggestions ก่อน contacts/accounts)

## Repository Changes

ใหม่ใน `lib/repositories/index.ts` + adapters ทั้ง mock และ D1:
- `ActivityRepository`: create (atomic กับ optional follow-up task ผ่าน D1 batch), getById, listByAccount (keyset pagination บน `occurred_at DESC, id DESC`), listRecentByAccounts (batch, chunked IN()), update, softDelete
- `ContactRepository`: listByAccount, getById, getByIds, create, update
- `TaskRepository`: create, update/complete, listByAssignee({overdue|today|upcoming}), listByAccount, listByOpportunity
- `SuggestionRepository`: create, listPendingByAccount, decide(accept/ignore)
- `OpportunityRepository`: เพิ่ม lastActivity read model (`days_since_last_activity` — spec §27) ผ่าน aggregate query ไม่ N+1

## Application Use Cases

`lib/application/activities/`: create-note, log-call, log-meeting, get-account-timeline, update-activity, delete-activity
`lib/application/contacts/`: create-contact, update-contact
`lib/application/tasks/`: create-follow-up, complete-task, get-my-work-today
`lib/application/ai/`: analyze-activity (queue consumer side), decide-suggestion

## UI / UX Changes

- **Account 360** (`app/(app)/accounts/[accountId]`): header ตาม spec §6, Quick Actions bar (ไม่ซ่อนหลัง click), layout timeline 60–65% / intelligence 35–40%, mobile: intelligence collapsible
- **Activity Composer**: drawer เดียว 3 โหมด (Note/Call/Meeting) — field ตาม spec §12–14, ปุ่ม Save / Save + Create Follow-up, target <60s
- **Contacts panel**: add/edit + buying role badges (Decision Maker/Champion/Procurement)
- **Command Center**: เพิ่ม "My Work Today" (Overdue/Due Today/Upcoming/HOT/Meetings/Proposal follow-up) — แก้ `get-command-center.ts` เป็น bounded aggregates (ปิดหนี้ listAll ที่เหลือ)
- **Opportunity page**: Related Activities + Last/Next Activity
- **AI Suggestions card**: หลัง save → "AI found N insights" → Accept/Review/Ignore
- Timeline filters (All/Notes/Calls/…) + loading/error states

## API / Server Actions

Server actions (ทุกตัว: writesEnabled gate → zod strict parse → use case → revalidate):
createNoteAction, logCallAction, logMeetingAction, createTaskAction, completeTaskAction, createContactAction, updateContactAction, updateActivityAction, deleteActivityAction, decideSuggestionAction
ทุก write ส่ง `client_request_id` จาก client เพื่อ idempotency

## Queue / Cron / AI Impact

- Job ใหม่ `ANALYZE_ACTIVITY {organizationId, accountId, activityId}` ใน `lib/jobs/contracts.ts` (discriminated union เดิม)
- Consumer ใน jobs worker: โหลด activity → Claude (โมเดล `claude-opus-5`, structured output json_schema, `<activity>` untrusted-content hardening แบบเดียวกับ `<signal>`) → zod + catalog validation → เขียน `activity_ai_suggestions` เท่านั้น (ไม่แตะ moment โดยตรง — คนกด Accept ถึงจะสร้าง/ผูก Moment ผ่าน use case เดิม)
- ไม่มี key → skip เงียบ (activity ไม่เสียหาย); AI error → retry → DLQ (pattern เดิม)
- Accept moment suggestion → reuse detection dedup semantics (evidence-hash + active-moment attach)

## Security

- ทุก query scope `organization_id = ?`; cross-org FK ตรวจใน use case (contact ต้องอยู่ account เดียวกัน ฯลฯ)
- Write gate `MOMENT_OS_WRITES` เดิม + `DEMO_USER` เป็น temporary internal actor จนกว่า Sprint 7
- Activity body = untrusted content ต่อ AI (spec §21) — ไม่ follow instructions ในเนื้อความ
- Soft delete เท่านั้นสำหรับ activity ที่มี audit ผูก; audit เฉพาะ high-impact changes (spec §57)
- Public deploy ยังต้องอยู่หลัง Cloudflare Access (pending จาก pre-deploy checklist)

## Performance

- Timeline: 1 keyset-paginated query (LIMIT 20/หน้า) — ไม่มี per-activity relation queries
- Account 360 รวม: activity page + contacts (1) + tasks (1) + active moments (มีอยู่) + opportunities (1) → target ≤8 bounded queries
- My Work Today: aggregate queries by assignee + due bands — ไม่ loop
- D1 bind limits: chunked IN() ≤50 ตาม helper เดิม
- Save Note path: 1 batch write + enqueue — ไม่รอ AI

## Tests

- Unit: zod contracts (note/call/meeting/task/contact/ActivityAnalysis), ActivityType/ContactRole enums, keyset cursor encode/decode
- Repository (mock): CRUD + pagination + org scoping + idempotent create (ซ้ำ client_request_id ไม่ duplicate)
- Security: cross-org access denied, cross-account contact link rejected, write gate
- Reliability: AI fail ไม่กระทบ activity, double submit เดียว
- Performance: query-count assertions ต่อ view (นับผ่าน mock spy)

## Risks

- ALTER `contacts` เพิ่ม organization_id NOT NULL บน SQLite ต้องใช้ default + backfill — ถ้า rebuild table ต้องระวัง FK; จะเขียนแบบ ADD COLUMN DEFAULT 'ORG-001' (ปลอดภัยสุด, single-org ปัจจุบัน)
- Timeline โตเร็ว → keyset pagination ต้องถูกตั้งแต่แรก (ไม่ใช้ OFFSET)
- AI suggestions ที่คน ignore ซ้ำ ๆ = noise → เก็บ KPI ตั้งแต่แรก (spec §50)
- Task status mapping (lowercase เดิม vs spec uppercase) — ตัดสินใจ map ใน domain layer; ถ้า reviewer อยาก migrate ค่าจริง แจ้งได้

## Implementation Steps

1. **Step 1 — Migration 0004 + Domain + Contracts**: `migrations/0004_crm_activity_layer.sql`, `lib/domain/activity.ts` (ActivityType, ContactRole, TaskStatus, TaskPriority, branded ActivityId/TaskId/SuggestionId), zod contracts (CreateNote/LogCall/LogMeeting/CreateTask/CreateContact/ActivityAnalysis), seed generator update, apply local, tests contracts
2. **Step 2 — Repositories**: interfaces + mock + D1 adapters (Activity/Contact/Task/Suggestion + opportunity lastActivity), repo tests
3. **Step 3 — Use Cases + Server Actions**: activities/contacts/tasks use cases, actions with gate+zod+idempotency, atomic activity+task batch, tests
4. **Step 4 — Account 360 UI**: header/quick actions/timeline/composer/contacts panel/filters, loading+error states
5. **Step 5 — Command Center "My Work Today" + Opportunity integration**: bounded aggregates (แก้ listAll ที่เหลือใน get-command-center), last/next activity, no-contact risk
6. **Step 6 — AI Activity Analysis**: ANALYZE_ACTIVITY job + consumer + suggestions UI + decide actions + KPI counters
7. **Step 7 — Account list CRM columns/filters + management analytics (P2)**

แต่ละ step: 1 logical commit → tests/typecheck/lint → REVIEW_PACKET.md → STOP รอ `REVIEW APPROVED — PROCEED`

## Open Questions

1. Task status: map ใน domain (open↔OPEN) หรือ migrate ค่าใน DB เป็น uppercase? (แผนเสนอ: map ใน domain — ไม่แตะ data)
2. `activities` เก็บ MOMENT_DETECTED/VERIFIED system events ตั้งแต่ Step ไหน? (แผนเสนอ: Step 5 — เขียนจาก use case confirm/reject + detection consumer; ไม่ backfill ของเก่า)
3. Timeline default page size 20 พอไหม สำหรับ target <1.5s?
4. AI suggestions: Accept moment → สร้าง moment ใหม่ผ่าน dedup pipeline เดิม (queue) หรือเขียนตรงจาก use case? (แผนเสนอ: ผ่าน use case ตรง + reuse occurrence key — synchronous เพราะคนกดยืนยันแล้ว)
5. `EBM Expand` ฯลฯ ใน suggestions ควรจำกัดเฉพาะ 20 Master Moments ที่ active — ใช้ catalog validation แบบ solutionIds เดิม ใช่ไหม

---

**STOP — awaiting `PLAN APPROVED — IMPLEMENT STEP 1 ONLY`**
