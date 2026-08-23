# REVIEW PACKET

## Step
Project Pipeline Step 3 — Project Application Use Cases (+ fix rev 2: context relations + ACTIVE update invariant)

## FIX REV 2 (STEP 3 REVIEW — 2 P1)
**P1-1 Context relationship validation** — canonical ตัวเดียว `validateProjectContextRelations()` (`lib/application/projects/validate-project-context.ts`): moment ต้องอยู่ org เดียว (org-scoped lookup) **และ** account เดียวกับ project; sub_industry ต้องเป็นลูกของ industry ที่เลือก; project_type ต้อง exists+active+**selectable** (sentinel ไม่ผ่านเป็นค่าใหม่เสมอ); owner ต้องเป็น user จริงใน org — ใช้ร่วมโดย create / activate / update ไม่มี re-implement
**P1-2 ACTIVE invariant หลัง update** — `updateProject` ตรวจ **final state** เมื่อ patch แตะ context (industry/sub/type): relations ต้อง valid เสมอ (DRAFT ด้วย) และถ้า ACTIVE ต้องผ่าน canonical gate เต็ม (reuse `activationGateErrors`) — ตัวอย่าง reviewer ทั้งสอง (ตั้ง sentinel บน ACTIVE / เปลี่ยน industry จน sub หลุด) reject จริงแล้ว; legacy ACTIVE ยังอ่าน/เปลี่ยน stage/แก้ commercial fields ได้ — การแตะ context บน legacy = ต้อง enrich ให้ครบในคราวเดียว
**Fingerprint ครบ material inputs** — เพิ่ม expectedGP, closeDate, expectedDeliveryDate, subIndustryId, brief, nextAction, nextActionDate และ **solutionIds แบบ sorted set** (สลับลำดับ = ไม่ conflict, เปลี่ยนชุด = IDEMPOTENCY_CONFLICT)
Fix commit: `fix(project): canonical context relations + ACTIVE update invariant + full fingerprint (Step 3 rev 2)` — เทสต์เพิ่ม 11 (36 รวมในไฟล์ Step 3) → **216/216 passing**, typecheck/lint/build PASS

## COMMIT
1 logical commit: `feat(project): lifecycle use cases — create/activate/stage/close/cancel/next-action/risk (Pipeline Step 3)`

## USE CASES (`lib/application/projects/`)
- `createProject` — DRAFT เสมอ (stage NULL, **ไม่ auto-activate**); ตรวจ account/moment ownership + solutions มีจริง; industry prefill จาก account แล้ว **snapshot ลง project**; atomic+idempotent ผ่าน repo batch ของ Step 2
- `activateProject` — DRAFT→ACTIVE ที่ `NEW_BRIEF`; เติม context ที่ขาดได้ในคำสั่งเดียว (fields ลงพร้อม transition ใน batch เดียว)
- `updateProject` — แก้ commercial fields; ค่าใหม่ของ project type ต้องเป็น selectable master เท่านั้น (sentinel reject); closed = immutable
- `updateProjectStage` — ACTIVE เท่านั้น; กติกากลาง: เดินหน้าไกลแค่ไหนก็ได้, **ถอยได้ 1 ขั้นและต้องมีเหตุผล**; ไม่มี synthetic Won/Lost stage
- `closeProjectWon` / `closeProjectLost` (lost_reason บังคับที่ zod + schema CHECK) / `cancelProject` (cancel_reason + actor บังคับ; จาก DRAFT|ACTIVE)
- `updateProjectNextAction` — สอง field ไปด้วยกันเสมอ (invariant §11)
- `addProjectContact` — ownership ครบสองชั้น (ดู CONTACT OWNERSHIP)
- `evaluateProjectRisk` — โหลด CRM context (last activity + stage history) → pure rules

Zod `.strict()` ทุก boundary ใน `lib/validation/project.ts`; `writesEnabled()` gate อยู่ที่ server-action layer ตาม pattern เดิม (actions มากับ UI Step 4)

## ACTIVATION GATE (canonical — จุดเดียว)
`activationGateErrors()` ใน `lib/domain/opportunity.ts` เป็น**แหล่งกติกาเดียว**: account, industry_id, moment, **selectable project_type (PT-UNSPECIFIED ไม่ผ่านเสมอ)**, owner, revenue, next_action, next_action_date; sub_industry optional — use case และ repo create เรียกฟังก์ชันเดียวกัน (defense in depth, ไม่มีการ re-implement); UI Step 4 จะเรียกผ่าน use case เท่านั้น

## LEGACY COMPATIBILITY
Legacy ACTIVE + PT-UNSPECIFIED: **อ่านได้ + เปลี่ยน stage ได้ปกติ** (เทสต์ยืนยันกับ fixture จริง) — gate ทำงานเฉพาะจุด activate/แก้ type; `hasIncompleteContext()` ให้ UI ชู "เติมข้อมูล" ภายหลัง (และโผล่ใน risk flags เป็น `INCOMPLETE_CONTEXT`)

## IDEMPOTENCY
- Exact retry: `{created:false}` + แถวเดิม + history/solutions/audit ไม่เบิ้ล (เทสต์นับจริง)
- **Same key + payload ต่างสาระ → `IdempotencyConflictError` (IDEMPOTENCY_CONFLICT)** — เทียบ `projectCreateFingerprint()` (account, moment, name, status, revenue, industry, type, owner) ระหว่าง request กับแถวจริง — ไม่มีการคืนแถวเดิมแบบเงียบ ๆ
- Transition idempotency: history id = `PSH:<clientRequestId>` + unique index → retry รายงาน applied โดยไม่เขียนซ้ำ

## CONTACT OWNERSHIP
ก่อน link: (1) org ตรง — repo บังคับใน INSERT…SELECT WHERE EXISTS (Step 2), (2) **contact.accountId ต้องเท่ากับ project.accountId — cross-account ใน org เดียวกันก็ reject** (use case Step 3, มีเทสต์ทั้ง same-account ✓ / cross-account ✗ / unknown-org ✗ / duplicate → added:false)

## STAGE TRANSITIONS
`canTransitionStatus` (DRAFT→ACTIVE|CANCELLED; ACTIVE→WON|LOST|CANCELLED; terminal นิ่ง) + `canChangeSalesStage` (forward ทุกระยะ, backward 1 ขั้น, ห้าม self-move) — DRAFT ขยับ stage ไม่ได้ (เทสต์turn); ทุกการขยับเขียน history พร้อมกัน

## WON / LOST / CANCELLED
ทุกตัว: stage → NULL (CHECK คู่ระดับ DB บังคับซ้ำ), reason ตามชนิด (LOST/CANCELLED บังคับ, zod min length), terminal แก้ไขไม่ได้ (`updateProject` บน closed → immutable error), close metadata (reason + changed_by + changed_at) ลง history+audit

## PROJECT RISK
`projectRiskFlags()` pure — ACTIVE เท่านั้น: `NO_NEXT_ACTION` (ไม่มี action/date), `OVERDUE_NEXT_ACTION` (date < today org-local), `NO_RECENT_ACTIVITY` (≥7 วัน COALESCE createdAt — กติกาเดิม), `STUCK_IN_STAGE` (≥14 วันจาก history ล่าสุด), `INCOMPLETE_CONTEXT` (legacy enrichment) — **rules เท่านั้น ไม่มี automation** ตามคำสั่ง; DRAFT/closed = ไม่มี risk

## ATOMIC WRITES
`applyTransition` (repo primitive ใหม่, mock/D1 parity): **conditional UPDATE (guard from-state) + history + audit ใน `db.batch()` เดียว** — history/audit materialize เฉพาะเมื่อ UPDATE เกิดจริง (INSERT…SELECT conditional + OR IGNORE + deterministic ids `PSH:<req>` / `AUD:PSH:<req>`); applied ⇔ history ของ request มีอยู่ → retry-safe; concurrent state change → `{applied:false}` → use case แจ้ง error ชัด ไม่เขียนครึ่งเดียว

## พบและแก้ระหว่างทาง (mock/D1 parity bug)
mock `updateFields` เดิมใช้ `Object.assign` ซึ่ง copy ค่า `undefined` → ล้าง field ได้ ขัดกับ D1 (undefined = no-change) — แก้ให้ skip undefined เหมือน D1 แล้ว และเขียนเทสต์เคส missing-industry ใหม่ให้ตรงไปตรงมา (สร้าง draft ไร้ industry ผ่าน repo ตรง = จำลอง unmapped account)

## TESTS
**216/216 passing** (+4 real-API smoke ข้าม) — Step 3 เพิ่ม 36 (รวม fix rev 2) ครอบทุกข้อในรายการ reviewer: create DRAFT / activate complete / missing industry / missing moment (domain — schema ทำให้ impossible โดยชอบ) / missing type / PT-UNSPECIFIED / missing next action date / cross-account contact / idempotent exact retry / conflict payload / stage atomic history (forward+backward+reason) / WON clears stage / LOST clears+requires reason / CANCELLED clears+requires reason (จาก DRAFT และ ACTIVE) / legacy ACTIVE operable+surfaced / risk rules ครบ 5 flag + DRAFT/closed ว่าง / org isolation / updateProject (sentinel reject + closed immutable) / next-action invariant

## TYPECHECK
PASS

## LINT
PASS (0 errors, 0 warnings)

## BUILD
PASS

## DEVIATIONS
ไม่มี — ไม่มี UI, ไม่มี server actions (มากับ Step 4 ตาม pattern gate ที่ action layer), ไม่มี automation ใน risk

## KNOWN RISKS
- `updateFields` ไม่เขียน stage history (ถูกต้อง — ไม่ใช่ state change) แต่ audit ลงทุกครั้งฝั่ง D1; mock ไม่เก็บ audit store (พฤติกรรมเดิมของ mock ทุก write)
- Backward-stage เหตุผลถูกบังคับที่ use case (DB บังคับไม่ได้เพราะแยกทิศไม่ออก) — ช่องทางเขียนอื่นไม่มี (repo primitive ไม่ถูก export ไปที่ UI)
- Migrations 0004–0010 ยังไม่ apply remote (คิว PRE_DEPLOY เดิม)

## NEXT PROPOSED STEP
Step 4 — Project Pipeline UI (Board | List + server actions + rename "06 · Project Pipeline")
