# IMPLEMENTATION PLAN
## CRM Activity Layer Sprint — Moment OS as the Daily Workspace

Spec: [`docs/Moment_OS_CRM_Activity_Layer_Sprint.md`](docs/Moment_OS_CRM_Activity_Layer_Sprint.md)
Workflow: [`docs/Moment_OS_Claude_Code_Development_Workflow.md`](docs/Moment_OS_Claude_Code_Development_Workflow.md)
Status: **AWAITING PLAN REVIEW (rev 3 — addresses PLAN REVIEW round 2) — no CRM code written**

Rev 2 changes: docs paths fixed (§refs above), Figma section added, Account 360 path corrected to `app/accounts/[id]`, Activity+Task transaction boundary redesigned as `InteractionWriteRepository`, contacts migration now a deterministic table rebuild with `role`→`job_title` normalization, task statuses migrated to one canonical uppercase set, AI suggestion acceptance idempotency defined, reviewer decisions on all Open Questions incorporated.

Rev 3 changes (review round 2): contacts organization_id derived from owning account via JOIN (no hardcoded ORG-001, fail-loud on orphans), tasks table rebuilt with full FK set + fail-loud status normalization (no silent OPEN fallback), DB CHECK constraints added for all new CRM enums/ranges, Step-6 AI acceptance clarified as ONE atomic write abstraction (guard + moment + task + audit in a single batch, never a separately-committed guard).

Rev 4 changes (review round 3): tasks get `client_request_id` + partial unique index with stable key scheme (`ACTIVITY:<id>:FOLLOWUP`, `SUG:<id>`), acceptAtomic dependent writes made conditional via `INSERT ... SELECT ... WHERE EXISTS (suggestion ACCEPTED)` with idempotent audit (IGNORED never writes), explicit pre-remote orphan-FK checks for every legacy tasks reference column.

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
- Routes ปัจจุบัน: `app/accounts/[id]` (Account 360), `app/admin` (Command Center), `app/radar/[eventId]`, `app/opportunities`, `app/workspace` — **ไม่มี route group `(app)`**
- มีอยู่แล้วและจะ **reuse ไม่สร้างซ้ำ**:
  - `contacts` table (0001) — ไม่มี organization_id; มี `role` free-text (ใช้เป็น job title ในข้อมูลจริง เช่น "Marketing Manager")
  - `tasks` table (0001) — มี org/account/moment/opportunity + title/due_date/assignee_id/status (`'open'` lowercase) แต่ไม่มี contact_id, description, priority, created_by, completed_at, updated_at
  - `audit_logs`, `attachments`; `moment_events` + verification (guarded UPDATE + audit batch pattern); `opportunities`; queue `MOMENT_JOBS` + jobs worker + DLQ consumer; `writesEnabled()` gate + `DEMO_USER`; zod contracts `lib/jobs/contracts.ts`; AI pattern `ai-detection.ts` พร้อม prompt-injection hardening; occurrence dedupe `lib/jobs/occurrence.ts`
- Migrations 0001–0003 applied remote แล้ว → ทุกอย่างใหม่คือ **forward migration 0004**

## Current Problems

1. ไม่มีที่บันทึกบทสนทนากับลูกค้า → knowledge อยู่ในหัวคน/LINE/Excel
2. Contact ไม่มี buying role / org scope → ไม่รู้ Decision Maker, query ข้าม org ป้องกันไม่ได้ที่ DB layer
3. Task มีแต่ table ยังไม่มี UI/use case จริง
4. Command Center ไม่บอกว่า "วันนี้ต้องทำอะไร"
5. AI เห็นแต่ external signals ไม่เห็น conversation ที่ rich ที่สุด

## Proposed Architecture

Human activities เขียนลง table กลาง `activities` (spec §25 Option A — system events สำคัญเขียน activity row อ้าง reference id, ไม่ duplicate business record) ผ่าน use case + repository ตาม layer เดิม. AI enrichment เป็น `ANALYZE_ACTIVITY` job บน queue เดิม — save ก่อน enqueue ทีหลัง, AI ล้มไม่กระทบข้อมูล. AI suggestions เก็บเป็น draft ให้คน Accept/Edit/Ignore (spec §22) — ไม่ auto-mutate.

### Transaction boundary (rev 2 — review item 4)

`ActivityRepository` **ไม่** สร้าง Task. การเขียนที่ต้อง atomic ข้าม table ("Save Call + Create Follow-up", "Activity + Audit") เป็นหน้าที่ของ write abstraction แยก:

```ts
// lib/repositories — CRM interaction unit-of-work
export interface InteractionWriteRepository {
  /**
   * Atomically persist one logged interaction:
   * activity + optional follow-up task + optional audit row.
   * D1: single db.batch(); mock: synchronous in-memory apply.
   * Idempotent on (organization_id, client_request_id) ทั้งสอง table:
   *   activity.client_request_id = <formRequestId>
   *   task.client_request_id     = "ACTIVITY:<formRequestId>:FOLLOWUP"
   * retry/double-click จึง no-op ทั้งคู่พร้อมกันเสมอ (rev 4).
   */
  logInteraction(input: {
    activity: CreateActivityInput;
    followUpTask?: CreateTaskInput;
    audit?: CreateAuditInput;
  }): Promise<{ activity: Activity; task?: Task; deduped: boolean }>;
}
```

- `ActivityRepository` / `TaskRepository` / `ContactRepository` = CRUD + queries ของ entity ตัวเอง ล้วน ๆ
- `InteractionWriteRepository` (D1 adapter) ประกอบ statement จาก entity แต่ละตัวแล้วยิง `db.batch()` เดียว — atomicity อยู่ที่ infrastructure boundary, business rule อยู่ที่ use case
- Use case (`log-call.ts` ฯลฯ) validate + ตัดสินใจว่าจะส่ง followUpTask/audit เข้า batch ไหม

## Figma Review / Figma → Implementation Mapping (rev 2 — review item 2)

**สถานะ: ยังไม่มี Figma file ใน repo หรือใน brief ใด ๆ ที่ผ่านมา** — สอง sprint docs ไม่มีลิงก์ Figma; แหล่ง layout เดียวที่มีคือ ASCII wireframe ใน spec §7 + rules §6.
→ **Action ก่อน Step 4 (UI): ทีมต้องส่ง Figma URL + page/node id** แล้วผมจะเติมตารางนี้ให้ครบก่อนเริ่ม UI step. จนกว่าจะได้ลิงก์ ให้ถือ spec §6–7 เป็น layout authority.

| Area | Figma ref | Current implementation | Target | Mobile behavior | Intentional deviation |
|---|---|---|---|---|---|
| Account 360 header | _pending Figma link_ | `app/accounts/[id]/page.tsx` — name/tier/industry/owner/LTV/GP/score, ไม่มี Current-Moment strip | spec §6: + Current Moment, Moment Score, Next Moment, Customer Health, Potential Wallet | stack แนวตั้ง, sticky quick actions | — |
| Quick actions bar | _pending_ | ไม่มี | `+ Note / Log Call / Meeting / Task / Contact / Opportunity / Moment` — 1 click เปิด composer | horizontal scroll chips ใต้ header | "Add Moment" ชี้ไป flow เดิมของ radar ไม่สร้างใหม่ |
| Activity Timeline | _pending_ | ไม่มี (มี moment history บางส่วน) | ซ้าย 60–65%, filter chips + search, keyset "load more" | เต็มความกว้าง อยู่หลัง Quick Actions + Current Moment | ERP events แสดงเป็น reference card (ไม่ sync จริงใน sprint นี้) |
| Intelligence sidebar | _pending_ | กระจายอยู่ในหน้าเดิม (whitespace, solutions) | ขวา 35–40%: Current/Next Moment, Whitespace, Recommended Solutions, Health, Open Opps, Upcoming Tasks | collapsible accordion ท้ายหน้า | — |
| Activity Composer | _pending_ | ไม่มี | drawer 3 โหมด Note/Call/Meeting ตาม field spec §12–14 | full-screen sheet | ปุ่ม 2 อัน: Save / Save + Follow-up ตาม spec |
| Contacts panel | _pending_ | list ชื่อ+เบอร์ read-only | add/edit + buying role badges (Decision Maker/Champion/Procurement) | card list | — |
| My Work Today | _pending_ | `app/admin` ยังเป็น moment dashboard | เพิ่ม block Overdue/Due Today/Upcoming/HOT/Meetings/Proposal follow-up ไว้บนสุด | block เรียงเดี่ยว | — |

## Files to Change (by step)

ดู Implementation Steps — แต่ละ step มีรายการไฟล์ของตัวเอง; UI ทั้งหมดอยู่ใต้ path ปัจจุบัน (`app/accounts/[id]`, `app/admin`, `app/opportunities`) — **ไม่มีการย้าย/เพิ่ม route group**

## Data Model

### `activities` (ใหม่ — spec §9)
ตาม schema ใน spec + จากบทเรียนรอบก่อน:
- `client_request_id TEXT` + partial unique `(organization_id, client_request_id) WHERE client_request_id IS NOT NULL` — idempotency กัน double-click/retry (spec §56)
- `deleted_at TEXT`, `deleted_by TEXT` — soft delete (spec §31)
- `activity_type TEXT` ตรวจด้วย zod enum `ActivityType` (spec §10) — ไม่ free-form
- FK: organization/account/contact/opportunity/moment_event; ทุก query scope `organization_id`

### `contacts` — deterministic rebuild (rev 2 item 5 + rev 3 item 1)
Rebuild ทั้ง table ตอนนี้ (ก่อนมี CRM data จริง) แทน ADD COLUMN ทีละอัน:
1. `CREATE TABLE contacts_new` — schema สะอาด: `id, organization_id TEXT NOT NULL REFERENCES organizations(id), account_id TEXT NOT NULL REFERENCES accounts(id), name NOT NULL, job_title, department, email, phone, line_id, buying_role, influence_level, is_primary INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ACTIVE', notes, created_at NOT NULL, updated_at NOT NULL` + CHECK constraints (ดู DB Constraints)
2. Copy + normalize — **tenant-safe: derive org จาก account เจ้าของ ไม่ hardcode**:
   ```sql
   INSERT INTO contacts_new (id, organization_id, account_id, name, job_title, email, phone, is_primary, status, created_at, updated_at)
   SELECT c.id, a.organization_id, c.account_id, c.name,
          c.role,               -- legacy role = job title
          c.email, c.phone, c.is_primary, 'ACTIVE', c.created_at, c.created_at
   FROM contacts c
   LEFT JOIN accounts a ON a.id = c.account_id;
   ```
   ใช้ **LEFT JOIN โดยตั้งใจ**: contact กำพร้า (ไม่มี account) จะได้ `organization_id = NULL` → ชน `NOT NULL` → **migration fail ดัง ๆ** แทนที่ INNER JOIN จะเงียบ ๆ ทิ้งแถว; `buying_role`/`department`/`line_id`/`notes` เริ่ม NULL (legacy `role` ไม่เคยเก็บ buying role — ไม่เดา DECISION_MAKER)
3. `DROP TABLE contacts; ALTER TABLE contacts_new RENAME TO contacts;`
4. `CREATE INDEX idx_contacts_org_account ON contacts(organization_id, account_id);`
5. รันใน migration เดียว; seed generator อัปเดตให้ยิง schema ใหม่ + ตัวอย่าง buying_role; pre-migration check ใน local test: `SELECT COUNT(*) FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id WHERE a.id IS NULL` ต้องเป็น 0 ก่อน apply remote

### `tasks` — rebuild with full FK set (rev 3 item 2; แทนแผน ALTER เดิม)
Legacy `tasks` มี relationship id ครบแต่มี FK แค่ organization_id → rebuild เป็น `tasks_new` ให้ relationally safe ตั้งแต่ก่อนมี CRM data จริง:
1. `CREATE TABLE tasks_new`:
   ```sql
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
     client_request_id TEXT,   -- idempotency (rev 4): stable key per logical create
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE UNIQUE INDEX uq_tasks_client_request
     ON tasks_new(organization_id, client_request_id)
     WHERE client_request_id IS NOT NULL;
   ```
   **Stable key scheme** (ใช้ตรงกันทุกชั้น):
   - Follow-up จาก interaction: `ACTIVITY:<activityClientRequestId>:FOLLOWUP`
   - Follow-up จาก AI suggestion: `SUG:<suggestionId>`
   - Task สร้างมือจาก UI: `client_request_id` จาก form (crypto.randomUUID ตอน mount)
   - Legacy rows ที่ copy มา: NULL (ไม่ต้องมี key)
2. Copy + normalize status แบบ **fail-loud — ไม่ map ค่าที่ไม่รู้จักเป็น OPEN เงียบ ๆ**:
   ```sql
   INSERT INTO tasks_new (id, organization_id, account_id, moment_event_id, opportunity_id,
                          title, due_date, assignee_id, priority, status, created_at, updated_at)
   SELECT id, organization_id, account_id, moment_event_id, opportunity_id,
          title, due_date, assignee_id, 'NORMAL',
          CASE lower(status)
            WHEN 'open' THEN 'OPEN'
            WHEN 'in_progress' THEN 'IN_PROGRESS'
            WHEN 'done' THEN 'DONE'
            WHEN 'cancelled' THEN 'CANCELLED'
            ELSE NULL              -- unknown legacy status → NULL → NOT NULL+CHECK ทำให้ migration FAIL
          END,
          created_at, created_at
   FROM tasks;
   ```
3. `DROP TABLE tasks; ALTER TABLE tasks_new RENAME TO tasks;`
4. `CREATE INDEX idx_tasks_org_assignee_due ON tasks(organization_id, assignee_id, due_date);`
5. Pre-migration detection (local test + before remote apply): `SELECT DISTINCT status FROM tasks WHERE lower(status) NOT IN ('open','in_progress','done','cancelled')` ต้องคืน 0 แถว — ถ้าพบ ให้รายงาน reviewer ตัดสิน mapping ก่อน ไม่แก้เอง
- ลำดับใน 0004: rebuild contacts **ก่อน** rebuild tasks (tasks_new FK อ้าง contacts ตัวใหม่)
- DB/domain/zod/UI ใช้ `OPEN | IN_PROGRESS | DONE | CANCELLED` ชุดเดียวกันหมด — ไม่มี mapping layer

### `activity_ai_suggestions` (ใหม่)
`id, organization_id NOT NULL REFERENCES organizations(id), activity_id NOT NULL REFERENCES activities(id), payload_json (validated ActivityAnalysis), confidence REAL, status TEXT NOT NULL DEFAULT 'PENDING', created_at, decided_at, decided_by REFERENCES users(id)` + CHECK constraints (ดูข้างล่าง) + index `(organization_id, activity_id)` — รองรับ AI KPI (spec §50)

### DB CHECK Constraints (rev 3 — review item 3)
Zod ยังเป็น application boundary เหมือนเดิม แต่ DB ต้อง enforce เองด้วย — migration 0004 ใส่ CHECK ตั้งแต่ CREATE TABLE:
- `activities.activity_type` — `CHECK (activity_type IN ('NOTE','CALL','MEETING','EMAIL','LINE','VISIT','TASK','TASK_COMPLETED','MOMENT_DETECTED','MOMENT_VERIFIED','MOMENT_REJECTED','OPPORTUNITY_CREATED','OPPORTUNITY_STAGE_CHANGED','OPPORTUNITY_WON','OPPORTUNITY_LOST','SYSTEM'))` (spec §10 ครบชุด)
- `tasks.status` — `CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED'))`
- `tasks.priority` — `CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'))`
- `contacts.status` — `CHECK (status IN ('ACTIVE','INACTIVE'))`
- `contacts.buying_role` — `CHECK (buying_role IS NULL OR buying_role IN ('DECISION_MAKER','INFLUENCER','CHAMPION','PROCUREMENT','USER','FINANCE','GATEKEEPER','OTHER'))` (spec §16)
- `contacts.influence_level` — `CHECK (influence_level IS NULL OR influence_level IN ('HIGH','MEDIUM','LOW'))`
- `activity_ai_suggestions.status` — `CHECK (status IN ('PENDING','ACCEPTED','IGNORED'))`
- `activity_ai_suggestions.confidence` — `CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))`
zod enum ทุกตัว derive จาก const array เดียวใน `lib/domain/activity.ts` แล้ว generator ของ migration อ้างชุดเดียวกัน (เขียนมือแต่มี test เทียบว่า CHECK list == domain enum เพื่อกัน drift)

## Migration Plan

`migrations/0004_crm_activity_layer.sql` — forward only, ลำดับใน file เดียว:
1. CREATE `activities` (พร้อม CHECK activity_type) + indexes (spec §40): `(organization_id, account_id, occurred_at DESC)`, `(organization_id, created_by, occurred_at DESC)`, partial unique client_request_id
2. Contacts rebuild (LEFT JOIN org derivation, fail-loud — ตามขั้นตอน 5 ข้อข้างบน)
3. Tasks rebuild (full FK set + fail-loud status normalization — ตามขั้นตอนข้างบน; ต้องอยู่หลัง contacts rebuild เพราะ FK อ้าง contacts ใหม่)
4. CREATE `activity_ai_suggestions` (พร้อม CHECK status/confidence) + index
5. Seed generator: activities ตัวอย่าง, contacts schema ใหม่ (มี buying_role ตัวอย่าง), tasks status uppercase, CLEAR_ORDER เพิ่ม activity_ai_suggestions → activities ก่อน contacts/accounts

Pre-remote-apply checks — ทุกข้อต้องคืน **0 แถว**; ถ้าพบ orphan/unknown: **STOP & REPORT** ไม่เดา ไม่ลบ ไม่ remap เอง:
- orphan contacts→accounts: `SELECT c.id FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id WHERE a.id IS NULL`
- unknown task status: `SELECT id, status FROM tasks WHERE lower(status) NOT IN ('open','in_progress','done','cancelled')`
- orphan task FKs (rev 4 — legacy tasks ไม่เคยมี FK พวกนี้ ต้องตรวจก่อน rebuild):
  - `SELECT t.id FROM tasks t LEFT JOIN accounts a ON a.id=t.account_id WHERE t.account_id IS NOT NULL AND a.id IS NULL`
  - `SELECT t.id FROM tasks t LEFT JOIN moment_events m ON m.id=t.moment_event_id WHERE t.moment_event_id IS NOT NULL AND m.id IS NULL`
  - `SELECT t.id FROM tasks t LEFT JOIN opportunities o ON o.id=t.opportunity_id WHERE t.opportunity_id IS NOT NULL AND o.id IS NULL`
  - `SELECT t.id FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.assignee_id IS NOT NULL AND u.id IS NULL`
(ใน migration เอง กลไก LEFT JOIN→NOT NULL, CASE ELSE NULL→CHECK และ FK enforcement ตอน INSERT ทำให้ apply ล้มเหลวดัง ๆ อยู่ดีถ้าข้อมูลหลุด check — pre-check มีไว้ให้รู้ก่อนและรายงาน reviewer แทนที่จะไปตายกลาง migration)

Migration ต้องผ่าน review ก่อน apply remote (Workflow Rule 6) — จะ apply local เพื่อทดสอบเท่านั้นใน Step 1

## Repository Changes

ใหม่ใน `lib/repositories/index.ts` + adapters ทั้ง mock และ D1:
- `ActivityRepository`: create (single row), getById, listByAccount (keyset บน `occurred_at DESC, id DESC`, page 20), listRecentByAccounts (chunked IN() ≤50), update, softDelete — **ไม่แตะ tasks**
- `TaskRepository`: create, update, complete, listByAssignee({overdue|today|upcoming}), listByAccount, listByOpportunity
- `ContactRepository`: listByAccount, getById, getByIds, create, update
- `SuggestionRepository`: create, getById, listPendingByAccount (reads + create เท่านั้น)
- `SuggestionDecisionWriteRepository`: `acceptAtomic` / `ignoreAtomic` — unit-of-work ของการตัดสินใจทั้งก้อน (ดู AI suggestion acceptance; Step 6)
- `InteractionWriteRepository`: `logInteraction` unit-of-work (ดู Proposed Architecture)
- `OpportunityRepository`: เพิ่ม `lastActivityByOpportunity` aggregate read model (`days_since_last_activity` — spec §27) — one grouped query, ไม่ N+1

## Application Use Cases

`lib/application/activities/`: create-note, log-call, log-meeting, get-account-timeline, update-activity, delete-activity
`lib/application/contacts/`: create-contact, update-contact
`lib/application/tasks/`: create-follow-up, complete-task, get-my-work-today
`lib/application/ai/`: analyze-activity (consumer side), accept-suggestion, ignore-suggestion

### AI suggestion acceptance — ONE atomic transaction (rev 2 item 8 + rev 3 item 4)

`accept-suggestion` use case (synchronous, ไม่ผ่าน queue — reviewer decision). **การ accept ทั้งหมดเป็น write abstraction เดียว** — ไม่มี guarded UPDATE ที่ commit แยกก่อน dependent writes:

```ts
// lib/repositories — atomic decision unit-of-work (Step 6)
export interface SuggestionDecisionWriteRepository {
  /**
   * ONE db.batch() (atomic in D1). Dependent writes are CONDITIONAL on the
   * suggestion actually being ACCEPTED — never unconditional after the guard:
   *   [ UPDATE activity_ai_suggestions SET status='ACCEPTED', decided_at=?, decided_by=?
   *       WHERE organization_id=? AND id=? AND status='PENDING',
   *     INSERT OR IGNORE INTO moment_events (...)
   *       SELECT ... WHERE EXISTS (SELECT 1 FROM activity_ai_suggestions
   *                                WHERE organization_id=? AND id=? AND status='ACCEPTED'),
   *     INSERT OR IGNORE INTO tasks (...)
   *       SELECT ... WHERE EXISTS (…status='ACCEPTED'…),
   *     INSERT OR IGNORE INTO audit_logs (id = 'AUD:SUG:'||?, ...)
   *       SELECT ... WHERE EXISTS (…status='ACCEPTED'…) ]
   * All-or-nothing: batch fail => rollback ทั้งก้อน, suggestion ยัง PENDING.
   */
  acceptAtomic(input: AcceptSuggestionInput): Promise<AcceptOutcome>;
  ignoreAtomic(id: SuggestionId, userId: UserId): Promise<{ changed: boolean }>;
}
```

Required behavior (rev 4 — review round 3 item 2):

| สถานะตอนเรียก accept | ผล |
|---|---|
| PENDING | UPDATE → ACCEPTED; `WHERE EXISTS(status='ACCEPTED')` เป็นจริง → สร้าง Moment/Task/Audit (idempotent ทุกแถว) |
| ACCEPTED (retry/double-click) | UPDATE เปลี่ยน 0 แถว; EXISTS ยังจริง แต่ทุก INSERT เป็น `OR IGNORE` + stable key → **ไม่ duplicate**; คืนผลเดิม |
| IGNORED | UPDATE เปลี่ยน 0 แถว; `EXISTS(status='ACCEPTED')` เป็น**เท็จ** → SELECT คืน 0 แถว → **ไม่มี Moment/Task/Audit เกิดขึ้นเลย** |

Flow ของ use case:
1. อ่าน suggestion + validate momentCode กับ active Master Moment catalog ผ่าน repository (**ไม่ hardcode list** — reviewer decision) และ validate solutionIds กับ catalog
2. เรียก `acceptAtomic` — batch เดียว, dependent writes ทุกตัวเป็น `INSERT ... SELECT ... WHERE EXISTS (suggestion ACCEPTED)` — statement condition อยู่ใน SQL เอง ไม่พึ่ง control flow ฝั่ง JS
3. อ่านผลหลัง batch (meta.changes ของ guard + SELECT ผลลัพธ์) → รายงาน created / already-accepted / ignored ให้ UI
4. Idempotency ระดับแถว: `moment_events.dedupe_key = SUGGESTION:{org}:{acc}:{code}:{suggestionId}` (unique index เดิม), `tasks.client_request_id = SUG:{suggestionId}` (uq_tasks_client_request), `audit_logs.id = 'AUD:SUG:{suggestionId}'` (PK — deterministic id ทำให้ audit idempotent ด้วย `INSERT OR IGNORE`)

**Plan clarification เท่านั้น — ยังไม่ implement Step 6**

## UI / UX Changes

- **Account 360** (`app/accounts/[id]` — path ปัจจุบัน, ไม่ย้าย): header ตาม spec §6, Quick Actions bar ไม่ซ่อนหลัง click, layout timeline 60–65% / intelligence 35–40%, mobile: intelligence collapsible (ดูตาราง Figma mapping)
- **Activity Composer**: drawer เดียว 3 โหมด (Note/Call/Meeting) — field ตาม spec §12–14, ปุ่ม Save / Save + Create Follow-up, target <60s
- **Contacts panel**: add/edit + buying role badges
- **Command Center** (`app/admin`): เพิ่ม "My Work Today" (Overdue/Due Today/Upcoming/HOT/Meetings/Proposal follow-up) — แก้ `get-command-center.ts` เป็น bounded aggregates (ปิดหนี้ listAll ที่เหลือ)
- **Opportunity page**: Related Activities + Last/Next Activity + no-contact risk
- **AI Suggestions card**: หลัง save → "AI found N insights" → Accept/Review/Ignore
- Timeline filters (All/Notes/Calls/…) + loading/error states ทุกหน้าใหม่

## API / Server Actions

Server actions (ทุกตัว: writesEnabled gate → zod strict parse → use case → revalidate):
createNoteAction, logCallAction, logMeetingAction, createTaskAction, completeTaskAction, createContactAction, updateContactAction, updateActivityAction, deleteActivityAction, acceptSuggestionAction, ignoreSuggestionAction
ทุก write ส่ง `client_request_id` (crypto.randomUUID สร้างตอน mount form) เพื่อ idempotency

## Queue / Cron / AI Impact

- Job ใหม่ `ANALYZE_ACTIVITY {organizationId, accountId, activityId}` ใน `lib/jobs/contracts.ts` (discriminated union เดิม)
- Consumer ใน jobs worker: โหลด activity → Claude (`claude-opus-5`, structured output json_schema, `<activity>` untrusted-content hardening แบบเดียวกับ `<signal>`) → zod + catalog validation → เขียน `activity_ai_suggestions` เท่านั้น — คนกด Accept ถึงจะเกิด moment/task ผ่าน use case
- ไม่มี ANTHROPIC_API_KEY → skip เงียบ (activity ไม่เสียหาย); AI transient error → retry → DLQ (pattern เดิม, DLQ consumer mark ได้เฉพาะ signals — จะเพิ่ม case ANALYZE_ACTIVITY ให้ mark suggestion pipeline อย่างเหมาะสมใน Step 6)

## Security

- ทุก query scope `organization_id = ?`; cross-org FK ตรวจใน use case (contact ต้องอยู่ account เดียวกัน, moment/opportunity ต้องอยู่ org เดียวกัน)
- Write gate `MOMENT_OS_WRITES` เดิม + `DEMO_USER` เป็น temporary internal actor จนกว่า Sprint 7 (spec §37)
- Activity body = untrusted content ต่อ AI (spec §21)
- Soft delete เท่านั้น; audit เฉพาะ high-impact changes (spec §57): contact changed, activity edited/deleted, suggestion accepted
- Public deploy อยู่หลัง Cloudflare Access (กำลังตั้งใน infra track)

## Performance

- Timeline: 1 keyset-paginated query (LIMIT 20, cursor = `occurred_at|id` — reviewer decision)
- Account 360 รวม: timeline (1) + contacts (1) + tasks (1) + active moments (1) + opportunities (1) + master cache → target ≤8 bounded queries
- My Work Today: aggregate queries by assignee + due bands — ไม่ loop
- D1 bind limits: chunked IN() ≤50 ตาม helper เดิม
- Save path: 1 `db.batch()` + enqueue — ไม่รอ AI

## Tests

- Unit: zod contracts, ActivityType/ContactRole/TaskStatus enums (uppercase canonical), keyset cursor encode/decode
- Repository (mock): CRUD + pagination + org scoping + `logInteraction` atomicity/idempotency (ซ้ำ client_request_id → deduped)
- Security: cross-org denied, cross-account contact link rejected, write gate
- Reliability: AI fail ไม่กระทบ activity; accept-suggestion double-call → ครั้งที่สอง no-op
- Performance: query-count assertions ต่อ view (mock spy)
- Migration: local apply + สคริปต์ตรวจ contacts rebuild (row count เท่าเดิม, role→job_title, org backfill) + tasks status uppercase หมด

## Risks

- Contacts rebuild: FK อ้าง contacts จาก table อื่น (moment_event_stakeholders?) — จะตรวจ `PRAGMA foreign_key_list` ทุก table ก่อนเขียน migration; ถ้ามีต้อง rebuild ลูกด้วยหรือใช้ `PRAGMA defer_foreign_keys`
- Timeline โตเร็ว → keyset ตั้งแต่แรก (ไม่ใช้ OFFSET)
- AI suggestions ที่คน ignore ซ้ำ ๆ = noise → เก็บ KPI ตั้งแต่แรก (spec §50)
- Figma ยังไม่มีลิงก์ → Step 4 บล็อกจนกว่าได้รับ (แจ้งใน Figma section)

## Implementation Steps

1. **Step 1 — Migration 0004 + Domain + Contracts**: migration (activities, contacts rebuild, tasks canonical status, suggestions), `lib/domain/activity.ts` + `lib/domain/task.ts` (branded ids, enums), zod contracts, seed generator, apply local, contract tests
2. **Step 2 — Repositories**: interfaces + mock + D1 (Activity/Task/Contact/Suggestion/InteractionWrite + opportunity lastActivity), repo tests
3. **Step 3 — Use Cases + Server Actions**: activities/contacts/tasks/ai-decide use cases + actions (gate+zod+idempotency), tests
4. **Step 4 — Account 360 UI**: header/quick actions/timeline/composer/contacts panel/filters (ต้องมี Figma link ก่อนเริ่ม)
5. **Step 5 — Command Center "My Work Today" + Opportunity integration + system moment activities**: bounded aggregates แก้ listAll ที่เหลือ, last/next activity, no-contact risk, MOMENT_DETECTED/VERIFIED activity rows จาก use case + consumer (ไม่ backfill — reviewer decision)
6. **Step 6 — AI Activity Analysis**: ANALYZE_ACTIVITY job + consumer + suggestions UI + accept/ignore actions + KPI counters
7. **Step 7 — Account list CRM columns/filters + management analytics (P2)**

แต่ละ step: 1 logical commit → tests/typecheck/lint → REVIEW_PACKET.md → STOP รอ `REVIEW APPROVED — PROCEED`

## Resolved Questions (reviewer decisions, rev 2)

1. Task status → migrate DB เป็น canonical uppercase ชุดเดียว ✅ (อยู่ใน Migration Plan)
2. System Moment activities → Step 5, ไม่ backfill ✅
3. Timeline page size → 20, keyset pagination ✅
4. AI suggestion Accept → synchronous use case, reuse Moment domain/dedup rules, ไม่มี UI→D1 ตรง ✅ (อยู่ใน acceptance idempotency)
5. Moment codes → validate กับ active Master Moment catalog ผ่าน repository ✅

## Open Questions

1. Figma URL/page/node — รอทีมส่งลิงก์ (บล็อกเฉพาะ Step 4)

---

**STOP — awaiting `PLAN APPROVED — IMPLEMENT STEP 1 ONLY`**
