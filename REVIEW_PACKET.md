# REVIEW PACKET

## Step
Step 3 — CRM Activity Layer: Application Use Cases + Server Actions

## Goal
Business rules ทั้งหมดของ CRM interaction อยู่ที่ application layer ตาม IMPLEMENTATION_PLAN.md (rev 4) + reviewer requirements 9 ข้อ — **ยังไม่มี UI (Step 4), ไม่มี AI (Step 6), ไม่ deploy**

## Commits
- `1dfc537` feat(crm): interaction use cases and server actions (Step 3)
- `1af3661` fix(crm): step 3 review round-1 fixes (P1 x4)


## P1 Fixes (review round 1)
1. **Priority default → application boundary**: `DEFAULT_TASK_PRIORITY` ใน domain; `CreateCrmTaskInput.priority` เป็น required — adapters (mock+D1) persist ค่า canonical ตรง ๆ ไม่ตัดสินใจเอง
2. **FOLLOW_UP ต้องมีทั้ง nextAction และ nextActionAt**: validate ที่ `validateNextState` + `buildFollowUpTask` (dueDate จึง guaranteed) — เทสต์ครอบทั้ง nextState และปุ่ม Save+Follow-up
3. **Org timezone**: `lib/services/org-time.ts` (`ORG_TIMEZONE=Asia/Bangkok`, `orgLocalDate(instant, tz?)` — tz พร้อมย้ายไป org record ใน Sprint 7); getMyWorkToday ใช้วัน local; เทสต์ boundary 16:59Z/17:00Z/20:30Z ที่วัน Bangkok ≠ วัน UTC
4. **Audit update/delete atomic**: D1 ยิง batch เดียว [mutation, audit INSERT..SELECT WHERE EXISTS] — `ACTIVITY_UPDATED` มี before/after ของ field ที่แก้, `ACTIVITY_DELETED` guard ด้วย timestamp เท่ากัน → retry ไม่ mutate และไม่ audit ซ้ำ; actor/entity/timestamp ครบ; mock mirror + เทสต์ (update 1 audit, delete ซ้ำ audit เดียว); system activities ยัง immutable

## Design Reference Received
ทีมส่ง `พี่เอกปรับฟีเจอร์ให้เหลือ 19 md.pdf` (Pipedrive-style, 72MB — ไม่ commit ลง repo) — สรุปเข้า Figma section ของ IMPLEMENTATION_PLAN.md แล้ว พร้อม **Open Question ใหม่เรื่อง scope alignment** (design มี Leads/dashboard/deal stages 8 ขั้น เกิน sprint ที่อนุมัติ) — เสนอทางเลือก (a) Step 4 = Account 360 ตามแผน + visual language จาก design / (b) revise แผน — รอ reviewer ตัดสิน

## Files Changed
- `lib/application/activities/shared.ts` (ใหม่) — `CrmError`, `assertInteractionOwnership` (cross-entity same-account), `validateNextState`, `buildFollowUpTask`
- `lib/application/activities/create-note.ts` / `log-call.ts` / `log-meeting.ts` (ใหม่) — 3 interaction use cases ผ่าน `InteractionWriteRepository`
- `lib/application/activities/get-account-timeline.ts` (ใหม่) — keyset page + batch contact hydration
- `lib/application/activities/update-activity.ts` (ใหม่) — update + soft delete (system rows immutable)
- `lib/application/contacts/create-contact.ts` (ใหม่) — create + update contact
- `lib/application/tasks/create-follow-up.ts` (ใหม่) — create follow-up (derive account จาก refs) + completeTask
- `lib/application/tasks/get-my-work-today.ts` (ใหม่) — 3 band queries
- `app/accounts/[id]/actions.ts` (ใหม่) — 9 server actions: gate → zod strict → use case → revalidate
- `lib/domain/activity.ts` — เพิ่ม `INTERACTION_NEXT_STATES` (6 ค่า)
- `lib/contracts/crm.ts` — เพิ่ม `createFollowUp` + `nextState` ใน note/call/meeting; task priority optional ที่ contract (default ตัดสินที่ application layer — P1 fix 1)
- `tests/crm-usecases.test.ts` (ใหม่) — 13 เทสต์

## USE CASES IMPLEMENTED
createNote, logCall, logMeeting, getAccountTimeline, updateActivity, deleteActivity (soft), createContact, updateContact, createFollowUp, completeTask, getMyWorkToday — ครบตามแผน Step 3 ไม่มีเกิน

## BUSINESS RULES
- **Layering (req 1):** UI/action → use case → repo interface → adapter; actions ไม่แตะ repository ตรง, repositories ยังเป็น persistence ล้วน
- **Cross-entity ownership (req 2):** contact / decisionMakerContact / opportunity / momentEvent ทุกตัวต้อง (a) resolve ได้ใน org (repos org-scoped → ต่าง org = null) และ (b) `entity.accountId === interaction.accountId`; follow-up task ที่ไม่ระบุ account จะ derive จาก ref แล้วบังคับกฎเดียวกัน
- **Next state (req 5):** `INTERACTION_NEXT_STATES = FOLLOW_UP | WAITING_CUSTOMER | PROPOSAL | NURTURE | CLOSED | NO_ACTION` — optional field บน note/call/meeting เก็บใน `metadata_json`; กฎเดียว: FOLLOW_UP (หรือปุ่ม Save+Follow-up) ต้องมีทั้ง nextAction และ nextActionAt (P1 fix 2) — ไม่ overbuild workflow engine
- **System rows immutable:** update/delete ได้เฉพาะ NOTE/CALL/MEETING/EMAIL/LINE/VISIT
- **AI (req 4):** ไม่มี AI call ใน path ไหนเลย — enrichment เป็น async job ของ Step 6

## SECURITY / ORG SCOPING
- Server actions ทุกตัว: `writesEnabled()` gate → zod `.strict()` parse (unknown field ปฏิเสธ) → actor = `DEMO_USER` inject ฝั่ง server (client ส่ง createdBy เองไม่ได้)
- Org isolation: entity ของ org อื่นมองไม่เห็นผ่าน repo (ทุก query bind org) → ที่ application layer เท่ากับ "ไม่พบ" → reject; มีเทสต์
- Error ต่อ user: `CrmError` message เท่านั้น; error ภายใน log ฝั่ง server + คืนข้อความ generic

## IDEMPOTENCY (req 3)
Interaction ทั้งก้อน idempotent บน `clientRequestId`: retry เดิมให้ Activity=1, Task=1 (key `ACTIVITY:<id>:FOLLOWUP`), Audit=1 (deterministic id) — พิสูจน์ด้วยเทสต์ application-level (สร้างซ้ำ → id เดิมทั้ง activity และ task, timeline มี 1 แถว); completeTask idempotent (`changed=false` รอบสอง)

## QUERY / PERFORMANCE IMPACT (req 8)
- createNote/logCall/logMeeting: ownership checks ≤4 bounded getById + 1 `db.batch()` write — ไม่มี loop
- getAccountTimeline: 1 keyset query + 1 chunked `getByIds` ต่อหน้า (ไม่ per-activity)
- getMyWorkToday: 3 bounded queries (LIMIT 20/band) ขนานกัน
- ไม่มี N+1 ใหม่; ไม่แตะ query เดิมของหน้าอื่น

## TESTS
82/82 passing (10 files) — หลัง P1 fixes — Step 3 เพิ่ม 13: note/call/meeting success, follow-up creation (title/dueDate/assignee), **idempotent repeat = 1 activity + 1 task**, FOLLOW_UP ไร้ nextAction → reject, cross-account contact reject, cross-account opportunity reject, org isolation (account + ref), timeline pagination 23 แถว 2 หน้าผ่าน use case พร้อม contact hydration, task account derivation จาก opportunity, my-work-today boundary (เทียบกับ clock เดียวกับ use case), complete missing task

## TYPECHECK
PASS

## LINT
PASS

## BUILD
PASS

## DEVIATIONS FROM PLAN
- Server actions รวมเป็นไฟล์เดียว `app/accounts/[id]/actions.ts` (แผนเขียนเป็นรายชื่อ action ไม่ได้กำหนดไฟล์) — Step 4 UI mount จากหน้านี้
- `updateActivity`/`deleteActivity` ใช้ `UpdateActivityCommand` ภายใน (activityId แยกจาก patch) — สอดคล้อง contract `UpdateActivitySchema`

## KNOWN RISKS
- `DEMO_USER` ยังเป็น actor ทุก write จนกว่า Sprint 7 auth — mitigated ด้วย Cloudflare Access (ยังต้องเปิดใน dashboard) + `MOMENT_OS_WRITES` gate
- Contact create ไม่มี DB-level idempotency (ไม่มีคอลัมน์ตามแผน) — double-submit กันที่ form ใน Step 4
- Server actions ยังไม่ถูกเรียกจาก UI (Step 4) — build ตรวจแล้วว่า compile ผ่านใน app tree จริง

## NEXT PROPOSED STEP
Step 4 — Account 360 UI — design PDF ได้รับแล้ว; รอ reviewer ตัดสิน **scope alignment (a)/(b)** ใน Open Questions ของแผน แล้วรอ `REVIEW APPROVED — PROCEED STEP 4 ONLY`
