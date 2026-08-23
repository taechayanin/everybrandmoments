# REVIEW PACKET

## Step
Project Pipeline Step 2 — Project Schema Evolution

## COMMIT
1 logical commit: `feat(project): status×stage schema, stage history, project contacts, idempotent create (Pipeline Step 2)`

## PROJECT SCHEMA (migration 0010 — LOCAL only)
`opportunities` rebuild (pattern 0004): **status** (5 ค่า) + **sales_stage** (6 ค่า, nullable) + context บน project เอง — `industry_id` / `sub_industry_id` (optional) / `project_type_id` (**master FK เท่านั้น — ไม่มี canonical free text**) / `moment_event_id` (NOT NULL เดิม) + commercial: `brief`, `expected_delivery_date`, `next_action_date`, `lost_reason`, `cancel_reason` + hardening: `client_request_id` (partial unique ต่อ org), `created_by`, `updated_at` + indexes (owner+status, account, org+status+stage)

## STATUS × STAGE INVARIANTS (บังคับระดับ D1 — ไม่พึ่ง TS/Zod อย่างเดียว)
CHECKs ใน schema จริง (พิสูจน์ด้วย negative smoke ทุกข้อ):
- `(status='ACTIVE') = (sales_stage IS NOT NULL)` — DRAFT/WON/LOST/CANCELLED บังคับ stage NULL, ACTIVE บังคับ non-null ✅ (ทดสอบยิง INSERT ผิดจริง → `CHECK constraint failed`)
- `status<>'LOST' OR lost_reason IS NOT NULL` ✅ · `status<>'CANCELLED' OR cancel_reason IS NOT NULL`
- ACTIVE ขั้นต่ำระดับ DB: `industry_id + project_type_id + owner_id + next_action NOT NULL` ✅
- FK ทุกตัว (industry/sub/type/account/moment/owner) — invalid FK ถูกปฏิเสธจริง ✅
- ส่วนของ gate ที่ DB แยกไม่ได้ (selectable type + next_action_date — legacy ACTIVE ถือ PT-UNSPECIFIED/date NULL ได้โดยชอบ) บังคับที่ domain `activationGateErrors()` + repo create ทั้ง mock/D1 → **สร้างใหม่แบบ ACTIVE ด้วย PT-UNSPECIFIED = reject** (เทสต์)

## COMMERCIAL CONTEXT
Intelligence key ครบบน project: `industry_id + moment_event_id + project_type_id`; DRAFT ไม่สมบูรณ์ได้ (นโยบาย "Draft may be incomplete"); sub_industry optional ทั้ง gate และ schema; workspace flow เดิม (`createOpportunity`) ปรับเป็นสร้าง **DRAFT** + snapshot industry จาก account — ยังไม่มี real project type จึงห้ามเข้า funnel จนกว่า Step-3 wizard activate

## LEGACY MIGRATION (historical truth — ไม่ fabricate)
Mapping เอกสารในหัว 0010 + `legacyStageToStatusStage()` (source เดียว, drift-tested):
`Discovery→(ACTIVE,DISCOVERY)` · `Solution Design→(ACTIVE,SOLUTION_DESIGN)` · `Proposal→(ACTIVE,PROPOSAL)` · `Negotiation→(ACTIVE,NEGOTIATION)` · `Won→(WON,NULL)` · `Lost→(LOST,NULL)` — **ไม่มี synthetic closing stage**; `industry_id` จาก account ณ เวลา migrate; `project_type_id='PT-UNSPECIFIED'` (sentinel legacy เท่านั้น); Lost เดิม → `lost_reason = "legacy: ไม่ได้บันทึกเหตุผล (ข้อมูลเก่า)"`; moment_event_id คงเดิม — **ผลจริง local D1**: 12 แถว → ACTIVE 11 (D5/SD2/P2/N2), WON 1, legacy_pt 12/12, industry 12/12, lost ไร้เหตุผล 0

## STAGE HISTORY
`project_stage_history` (from/to_status + from/to_stage + reason + changed_by + changed_at + client_request_id unique) — `create()` เขียน entry แรก (creation) ใน **`db.batch()` เดียว** กับ opportunity+solutions+audit → รากฐาน atomic update+history+audit ของ Step 3; ไม่ fabricate history ให้แถว migrate (analytics เริ่มนับไปข้างหน้า); `listStageHistory()` mock/D1 parity

## PROJECT CONTACTS
`project_contacts` — 4 roles CHECK (`DECISION_MAKER/CHAMPION/PROCUREMENT/MAIN_CONTACT`), `UNIQUE (opportunity_id, contact_id, role)` (duplicate → `{added:false}` ไม่ throw; พิสูจน์ระดับ D1 ด้วย UNIQUE smoke ✅); same-org บังคับใน INSERT…SELECT WHERE EXISTS (contact ต่าง org → throw, เทสต์); same-account enforcement จองไว้ที่ use case Step 3 ตามคำสั่ง

## SOLUTION RELATIONS (ปิดบั๊กเดิม)
`CreateOpportunityInput.solutionIds` → persist ลง `opportunity_solutions` ใน batch เดียวกับ create (INSERT OR IGNORE = retry-safe); `listSolutionIds()` อ่านกลับ; workspace flow ส่ง solutionIds ที่เคย validate-แล้วทิ้ง เข้า join จริงแล้ว — ไม่แตะ design ของ Solution system

## IDEMPOTENCY
`client_request_id` partial unique ต่อ org + create ใช้ INSERT OR IGNORE + survivor read-back: request เดิมซ้ำ → `{created:false}` คืนแถวเดิม, history ไม่เบิ้ล (id deterministic `PSH:<req>`), solutions/audit ไม่เบิ้ล (OR IGNORE + deterministic ids) — เทสต์ mock + UNIQUE smoke จริงบน D1 ✅

## D1 SMOKE (local จริงทั้งหมด)
- Legacy mapping: status×stage distribution ถูกต้อง 12/12 ✅
- Negative: ACTIVE+NULL stage ✗ / DRAFT+stage ✗ / LOST ไร้ reason ✗ / ACTIVE ไร้ industry ✗ / FK ปลอม ✗ — ทุกตัว fail ด้วย CHECK/FK ตรงข้อความคาด ✅
- Unique: client_request_id ซ้ำ ✗, project_contacts ซ้ำ ✗ ✅ (ลบ smoke rows แล้ว)
- Seed regenerate + apply + rerun: schema ใหม่ครบ ไม่ duplicate ✅

## TESTS
**180/180 passing** (+4 real-API smoke ข้าม) — Step 2 เพิ่ม 15 ครอบทุกข้อที่สั่ง: pairing ทั้ง 5 status (domain+repo), activation gate ทุก field + PT-UNSPECIFIED reject + sub optional, invalid FK reject, stage history entry แรก, duplicate contact + cross-org guard, legacy conversion ทุก stage + unknown throw, fixtures ตรง 0010 mapping, solution persistence, idempotency (row+history ไม่เบิ้ล), drift 0010 (CASE mapping + CHECKs + unique + tables ครบ) — เทสต์เดิม 165 ตัว **ปรับตาม field ใหม่โดยคง semantics เดิมทุกข้อ ไม่มีการลบ/อ่อนแรง**

## TYPECHECK
PASS

## LINT
PASS (0 errors, 0 warnings)

## BUILD
PASS

## DEVIATIONS
- **Workspace create → DRAFT**: flow เดิมสร้าง stage "Discovery" ตรง ๆ; หลัง 0010 การสร้างใหม่แบบ ACTIVE ต้องผ่าน gate เต็ม (ซึ่ง flow เดิมไม่มี project type/next-action date) จึง map เป็น DRAFT + snapshot industry — ตรง invariant, Step-3 wizard เป็นผู้ activate; queue/360 แสดงแถว DRAFT ด้วย Thai badge ("ฉบับร่าง") แล้ว
- UI ปรับเท่าที่จำเป็นให้ compile/แสดงถูก (StageBadge → status×stage Thai labels, pipeline strip → 6 sales stages): ไม่ใช่ Board/List ใหม่ — นั่นคือ Step 4

## KNOWN RISKS
- KPI "open" เดิมทุกจุดเปลี่ยนเป็น `status='ACTIVE'` (DRAFT ไม่นับ pipeline) — ตรงแผน แต่ตัวเลขบนหน้าจอจะต่างจากก่อน (DRAFT แยกออก)
- Won/Lost legacy ไม่มี closing stage (ตัดสินใจ #2) — conversion analytics เริ่มจาก history ไปข้างหน้า
- 0010 ยังไม่ apply remote (คิว PRE_DEPLOY: 0004–0010 + preflights ที่หัวไฟล์)

## NEXT PROPOSED STEP
Step 3 — Project Use Cases (createProject wizard backend / activateProject / updateStage / closeProject+cancelProject / next-action enforcement / risk rule)
