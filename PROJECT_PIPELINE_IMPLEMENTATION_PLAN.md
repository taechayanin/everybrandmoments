# PROJECT_PIPELINE_IMPLEMENTATION_PLAN
## Project Pipeline CRM + Thai Business Context + Solution Playbook

จัดทำ: 2026-08-23 · สถานะ: **PLAN GATE — ยังไม่เขียนโค้ดใด ๆ**
ขอบเขตนี้ไม่แตะ PRE_DEPLOY gate เดิม: ไม่ deploy, ไม่ apply remote migrations, migrations ใหม่ทั้งหมด **local only** จนกว่าจะมี gate ของมันเอง

---

## 0) INSPECTION FINDINGS (สรุปสิ่งที่มีอยู่จริง — ตรวจโค้ดแล้ว)

| ส่วน | สถานะปัจจุบัน | ผลต่อแผน |
|---|---|---|
| `Opportunity` entity (`lib/domain/opportunity.ts`) | `momentEventId` **NOT NULL** (Moment context บังคับโดย schema อยู่แล้ว), accountId, name, expectedRevenue, expectedGP, closeDate, stage, ownerId, nextAction (string), slaHours?, channel?, createdAt | **Reuse — ไม่สร้าง domain `projects` ใหม่** (สอดคล้อง handoff §13) |
| Stage enum | `Discovery → Solution Design → Proposal → Negotiation → Won / Lost` (display strings ตรง ๆ ใน DB) | ต้อง evolve เป็น stage codes + เพิ่ม NEW_BRIEF, QUALIFIED, DRAFT |
| `OpportunityRepository` | getById / list (bounded) / listAll (mock-test only) / **create เท่านั้น — ไม่มี update ใด ๆ** | ต้องเพิ่ม update/stage-transition + idempotency |
| `opportunities` table (0001) | ไม่มี client_request_id, ไม่มี updated_by/audit, ไม่มี stage history, ไม่มี next_action_date, ไม่มี project_type, ไม่มี lost_reason | Migration rebuild (แบบเดียวกับ contacts/tasks ใน 0004) |
| `opportunity_solutions` join | ตารางมีตั้งแต่ 0001 แต่ `createOpportunity` **ไม่เขียนลง join** (solutionIds ถูก validate แล้วทิ้ง) | บั๊กเชิงข้อมูลที่ต้องปิดใน sprint นี้ |
| Activities / Tasks | มี `opportunityId` nullable อยู่แล้วทั้งคู่ + timeline/composer/tasks-panel เป็น component พร้อม reuse | **ไม่สร้าง activity engine ที่สอง** (handoff §25) |
| `accounts.industry` | **free text** (`TEXT`); `solutions.industries` ก็ free text array | ต้องมี Industry Master + backfill mapping |
| Master moments | 20 moments ใน `lib/domain/master-moments.ts` + ตาราง D1; code รูปแบบ `"EBM Start"` (มี space); มี description ไทย, discoveryQuestions ไทย, nextMoments แล้ว | เพิ่ม **ชื่อไทยทางการ** (`thaiName`) — **ไม่เปลี่ยน code เดิม** (stable, มี FK/data ผูกอยู่); code `EBM_START` ในเอกสาร map 1:1 กับ `"EBM Start"` |
| Solutions | 28 solutions ผูก moment + industries + packages + cross-sell relations + nextMoment | เป็นวัตถุดิบของ Playbook — Playbook เป็นชั้น mapping ใหม่ ไม่แก้ solution เดิม |
| ERP | `orders_external` / `deliveries_external` มี `erp_project_id`, revenue, status, last_synced_at | แท็บ ERP = read-only reference — ไม่สร้าง fulfillment workflow |
| Workspace flow | `createOpportunity` ถูกเรียกจาก workspace (สร้างจาก qualified moment แล้ว updateStatus moment) | Wizard ใหม่ต้องอยู่ร่วมกับ flow นี้ ไม่ทำลาย |

---

## 1) ARCHITECTURE DECISION — Opportunity → Project (evolution, not duplication)

- **Entity เดิม `Opportunity` = "Project"** — เปลี่ยนเฉพาะภาษา UI (`06 · Project Pipeline`, คำว่า "Project" ทุกจุดที่ทีมเห็น) — โค้ด/ตาราง/ids ยังเป็น opportunity ทั้งหมด ไม่มี table `projects`
- เหตุผล: `momentEventId NOT NULL` + join solutions + ERP refs + activity/task linkage มีครบแล้ว การสร้าง entity ใหม่คือ duplicate pipeline ที่ handoff ห้าม
- Layered architecture เดิมคงไว้ทุกชั้น: UI → Use Cases → Repository Interfaces → Adapters (mock/D1) → D1

### Stage model ใหม่ (stored codes — UI แสดงไทย)

```
DRAFT        (นอก pipeline — context ไม่ครบ, ไม่นับใน KPI/board)
NEW_BRIEF → DISCOVERY → QUALIFIED → SOLUTION_DESIGN → PROPOSAL → NEGOTIATION → WON
LOST         (terminal — ออกได้จากทุก active stage, ต้องมี lost_reason)
```

- Transition map บังคับใน domain (pure function แบบ `analysis-lifecycle.ts`): เดินหน้าทีละ stage หรือข้ามไปหน้าได้, ถอยหลังได้ 1 ขั้น (บันทึกเหตุผล), เข้า `LOST` ได้จากทุก active stage, `WON`/`LOST` เป็น terminal (แก้ไขได้เฉพาะ operator + audit)
- **DRAFT gate (handoff §17)**: เข้า `NEW_BRIEF` ได้ต่อเมื่อครบ — Account, Industry, Business Moment, Project Type, Owner, Estimated Revenue, Next Action, **Next Action Date** — ไม่ครบ = อยู่ DRAFT เท่านั้น ตรวจซ้ำทั้ง zod และ CHECK-level (application invariant)
- **Data migration ของ stage เดิม**: `Discovery→DISCOVERY`, `Solution Design→SOLUTION_DESIGN`, `Proposal→PROPOSAL`, `Negotiation→NEGOTIATION`, `Won→WON`, `Lost→LOST` (แถวเดิมถือว่าผ่าน brief แล้ว — ไม่มีแถวใดตกไป DRAFT; ช่องที่บังคับใหม่ backfill: project_type = `UNSPECIFIED` (ค่า master พิเศษ), next_action_date = NULL → จะโดน risk rule ทันทีซึ่งถูกต้องเชิงธุรกิจ)
- Sales vs Fulfillment (handoff §15): pipeline จบที่ WON — สถานะ Production/QC/Delivery มาจากแท็บ ERP (read-only) เท่านั้น ไม่ปนใน stage enum

### Critical rule — Every Project Must Have Context (handoff §16)

`WHO = industry (จาก master) · WHY NOW = momentEventId (มีอยู่แล้ว NOT NULL) · WHAT = project_type (ใหม่, master)` — สาม field นี้บังคับก่อนเข้า active pipeline และเป็นแกนของ analytics ข้อ 8

---

## 2) DATA MODEL — Migrations (local only, forward-only, rebuild pattern เดิมจาก 0004)

### Migration 0009 — Thai masters
- `industries` (master): id, group_code, group_name_th (14 กลุ่มตาม handoff §20), parent_id (sub-industry เช่น สุขภาพและความงาม → คลินิก/คลินิกทันตกรรม/…), active flag — ควบคุมด้วย master data ไม่ใช่ free text
- `project_types` (master): id, name_th (เช่น เปิดสาขาใหม่, รีแบรนด์, Welcome Kit ประจำปี, Seasonal Campaign), active flag + ค่า `UNSPECIFIED` สำหรับ backfill
- `master_moments` เพิ่มคอลัมน์ `thai_name` (20 ชื่อตาม handoff §19 — map ตาม code เดิม เช่น `"EBM Expand"` → ขยายธุรกิจ) — code เดิมไม่แตะ
- `accounts` เพิ่ม `industry_id` (FK, nullable ชั่วคราว) — **backfill mapping** จาก free text เดิม (20 accounts, mapping ตายตัวใน migration; ค่าที่ map ไม่ได้ → NULL + รายงานใน packet ของ step) — คอลัมน์ `industry` เดิมคงไว้เป็น display legacy จนกว่า UI ทุกจุดย้ายมาใช้ master แล้วค่อย drop ใน migration อนาคต
- Seed: industry master + sub-industries + project types เริ่มต้น + thai_name ทั้ง 20

### Migration 0010 — opportunities rebuild ("Project" fields)
เพิ่ม: `industry_id` (FK — snapshot ตอนสร้าง, prefill จาก account), `project_type_id` (FK NOT NULL, backfill `UNSPECIFIED`), `brief` TEXT, `expected_delivery_date` TEXT, `next_action_date` TEXT, `lost_reason` TEXT, `stage` เป็น codes + CHECK ครบ 9 ค่า, `client_request_id` + partial unique `(organization_id, client_request_id)`, `created_by`, `updated_at`
- Preflight ใน step: stage values เดิมทั้งหมดต้องอยู่ใน map 6 ค่า (ตรวจก่อน rebuild), orphan FK = 0
- `project_stage_history` (ใหม่): id, organization_id, opportunity_id FK, from_stage, to_stage, reason TEXT, changed_by, changed_at, client_request_id + unique — **ทุกการเปลี่ยน stage เขียน history ใน `db.batch()` เดียวกับ update** (atomic แบบ acceptAtomic)
- `project_contacts` (ใหม่ — handoff §24 Step 3): organization_id, opportunity_id FK, contact_id FK, role CHECK (`DECISION_MAKER`,`CHAMPION`,`PROCUREMENT`,`MAIN_CONTACT`), unique (opportunity_id, role, contact_id) — reuse ตาราง contacts เดิม ไม่สร้างคนซ้ำ

### Migration 0011 — Solution Playbook
- `solution_playbooks`: id, organization_id, industry_group_id (nullable = ทุกอุตสาหกรรม), sub_industry_id (nullable), moment_code FK, project_type_id (nullable = ทุก type), name_th, active
- `playbook_items`: playbook_id FK, kind CHECK (`SOLUTION`,`DISCOVERY_QUESTION`,`NEXT_BEST_ACTION`,`RISK_SIGNAL`,`CROSS_SELL`), solution_id FK nullable (kind=SOLUTION/CROSS_SELL), text_th nullable (kind อื่น), group_label (Brand & Place / Employee / Customer / Marketing), sort_order
- wallet: min/max บน playbook (potential wallet ของสูตร อุตสาหกรรม×โมเมนต์×ประเภท)
- **Resolution ลำดับ fallback**: exact (sub-industry+moment+type) → (group+moment+type) → (moment+type) → (moment เท่านั้น = พฤติกรรม solution-by-moment เดิม) — ไม่มี playbook = แสดง solutions ของ moment ตามเดิม ระบบไม่มีทางว่างเปล่า
- Seed playbook ตัวอย่างจริง ≥3 ชุด (เริ่ม: คลินิก × ขยายธุรกิจ × เปิดสาขาใหม่ ตาม handoff §22)

---

## 3) DOMAIN & USE CASES

| Use case | สาระสำคัญ |
|---|---|
| `createProject` (wizard) | zod `.strict()` 4 ขั้น (Context / Commercial / People / Next Action) รวม validate ครั้งเดียวที่ submit; idempotent ด้วย client_request_id; เขียน opportunity + opportunity_solutions (**ปิดบั๊ก join ที่หายไป**) + project_contacts + stage_history แรก (→ DRAFT หรือ NEW_BRIEF ตามความครบ) ใน batch เดียว; prefill industry จาก account, prefill moment จาก Radar/AI suggestion เมื่อเข้าจากทางนั้น |
| `updateProjectStage` | ตรวจ transition map + DRAFT gate + **WON/LOST ต้องมี reason/close data**; atomic: update + stage_history + audit ใน `db.batch()`; idempotent (client_request_id บน history) |
| `updateProjectCommercial` / `setNextAction` | แก้ brief/มูลค่า/วันที่/next action + date; ทุก write ผ่าน writesEnabled() gate + audit |
| `getProjectBoard` | read model: 1 bounded page ต่อ stage (cap ต่อคอลัมน์ เช่น 25 + "ดูทั้งหมดใน List") + bulk hydration แบบ `getAccountList` — ไม่มี per-card query |
| `getProjectList` | ต่อยอด `getOpportunityQueue` เดิม + filters (stage, industry, moment, type, owner, at-risk) — pattern เดียวกับ account list |
| `getProjectDetail` | project + account + moment + contacts(roles) + solutions + playbook resolve + ERP refs — bounded + batched |
| `resolvePlaybook` | pure resolution ตาม fallback ข้อ 2 — มี unit tests ครบทุกชั้น fallback |
| Risk rule (handoff §26) | pure function: active stage && (ไม่มี next_action/next_action_date || เลย date || ไม่มี activity >7 วัน (COALESCE createdAt — ใช้ `daysSinceOpportunityContact` เดิม) || ค้าง stage เกิน SLA) → `PROJECT AT RISK`; โผล่ที่ board card, list, Command Center chips |

**AI/enrichment ไม่อยู่ใน sprint นี้** นอกจาก prefill จาก suggestion ที่มีอยู่ — ไม่มี AI mutation ใหม่ (human-confirmed เดิมคงไว้)

## 4) UX (Thai-first — handoff §18: UI ไทย, codes นิ่ง)

- **`06 · Project Pipeline`**: toggle `Board | List` — Board = Kanban คอลัมน์ตาม active stages (DRAFT แยกเป็นแถบพับได้, WON/LOST เป็นคอลัมน์สรุปตัวเลข ไม่ list การ์ดยาว), การ์ด: account, ชื่อ project, มูลค่า, moment chip ไทย, industry ไทย, owner, next action + date, ⚠ at-risk; **stage change ผ่านเมนูบนการ์ด/ใน detail (server action + validation) — ไม่ทำ drag-drop ใน sprint นี้** (ลด surface ของ optimistic-update bugs; เป็น enhancement ภายหลัง)
- **Create Project wizard** 4 ขั้นตาม handoff §24; แสดง playbook ทันทีที่ context ครบ (คำถาม discovery + solutions แนะนำ + wallet) — ให้ discovery เกิดตอนสร้าง ไม่ใช่หลังสร้าง
- **Project Detail** tabs: Overview / Activities (reuse `ActivityTimeline`+composer เดิม ผูก opportunityId) / Contacts (roles) / Solutions+Playbook / Tasks (reuse tasks-panel) / Commercial (history จาก stage_history) / ERP (read-only จาก orders_external ตาม erp_project_id/account)
- Label ไทยเป็น map ที่ UI layer เท่านั้น (แบบ `FILTER_LABEL` ใน account list) — DB/API เป็น codes ทั้งหมด

## 5) ANALYTICS (บทเรียนจาก §9 ของ handoff — KPI ต้องเป็น SQL aggregate)

- `ProjectRepository.pipelineStats()`: aggregate SQL เดียว — count+sum(expected_revenue)+avg(gp) GROUP BY stage / by moment / by industry / by project_type (org-scoped) — **ห้ามนับจาก bounded list** (ปิด TODO การ์ด "Proposal / Negotiation" บน Command Center ที่บันทึกไว้ใน PRE_DEPLOY packet ไปพร้อมกัน)
- Win rate, sales cycle, days-in-stage, stage conversion, lost reasons: คำนวณจาก `project_stage_history` ด้วย aggregate query (window ตาม partition opportunity) — bounded ทุกตัว
- หน้า analytics ช่วงแรก = ตาราง Pipeline by Moment / by Industry / by Project Type + win rate — intelligence ระยะยาว (handoff §27) ต่อยอดจากข้อมูลชุดเดียวกันภายหลัง

## 6) PERFORMANCE / SECURITY / MIGRATION SAFETY

- ทุก read model bounded + chunked ≤50 + batched hydration; ไม่มี listAll ใน production path ใหม่แม้แต่จุดเดียว; board cap ต่อคอลัมน์
- ทุก write: org scope + zod `.strict()` + `writesEnabled()` + client_request_id idempotency + audit record + DEMO_USER เป็น actor จนกว่า Sprint 7 (จุด integrate auth ชัดเจนใน use case layer)
- Migrations: forward-only, rebuild pattern เดิม, **local เท่านั้น** — remote ต้องผ่าน preflight + gate แบบ PRE_DEPLOY packet ปัจจุบัน; ทุก step รัน tests/typecheck/lint/build ก่อน commit
- ไม่แตะ/ไม่ลดทอน tests เดิม (154 รายการ)

## 7) STEP BREAKDOWN (หนึ่ง step ต่อหนึ่ง approval — workflow เดิม)

| Step | ขอบเขต | Deliverable หลัก |
|---|---|---|
| **1** | Migration 0009 + Thai masters + domain (industries, project types, thai moment names) + accounts backfill + seed + tests | masters พร้อมใช้, mapping ไทยครบ 20 moments |
| **2** | Migration 0010 + stage machine + stage_history + project_contacts + repositories (mock/D1 parity) + tests | schema Project สมบูรณ์, transition บังคับได้, ยังไม่มี UI |
| **3** | Use cases + server actions: createProject / updateStage / commercial / next action / risk rule + ปิดบั๊ก opportunity_solutions + tests | write paths ครบ, atomic + idempotent พิสูจน์ด้วยเทสต์ |
| **4** | Pipeline Board + List View (แทนหน้า Opportunity Queue เดิม, ชื่อใหม่ `06 · Project Pipeline`) + filters + risk badges | ทีมเห็น pipeline ใช้งานได้จริง |
| **5** | Create Project wizard (4 ขั้น + prefill) + Project Detail tabs (reuse timeline/tasks/contacts) + ERP tab read-only | ครบ loop สร้าง→ทำงาน→ปิด |
| **6** | Migration 0011 Playbook + resolver + seed ≥3 playbooks + surfacing ใน wizard/detail + tests | อุตสาหกรรม×โมเมนต์×ประเภท → playbook ทำงานจริง |
| **7** | Analytics read models (pipelineStats + stage-history aggregates) + Command Center risk chips + แก้การ์ด Proposal/Negotiation เป็น aggregate | KPI ทุกตัวเป็น SQL aggregate |

แต่ละ step: implement → tests/typecheck/lint/build → REVIEW_PACKET.md → 1 commit → push → **STOP** รอ `REVIEW APPROVED — PROCEED STEP N+1 ONLY`

## 8) NON-GOALS (handoff §29 — ต้องมี Plan Gate แยกเท่านั้น)

New Lead entity · Bulk lead management · Global dashboard architecture ใหม่ · Visit Plan · ERP replacement / production workflow · Generic custom-object system · Drag-drop board (enhancement ภายหลัง) · AI mutation ใหม่ · Auth/RBAC (Sprint 7)

## 9) OPEN QUESTIONS สำหรับ reviewer (ตอบพร้อม approval ได้)

1. **DRAFT ใน stage enum เดียว** (แผนนี้) หรือแยก flag `is_draft`? — เสนอ enum เดียว: state machine ชัด, query ง่าย, DRAFT ไม่นับใน KPI โดย filter ที่ aggregate
2. ค่าตั้งต้น `project_types` — ขอรายการจากทีม หรือให้เริ่มจากชุดเสนอ (เปิดสาขาใหม่ / รีแบรนด์ / Onboarding-Welcome Kit / Seasonal-Festival Campaign / Launch Event / Corporate Gifting / Uniform Program / Loyalty-Repeat Program) แล้วทีมแก้ใน master ได้
3. หน้า Opportunity Queue เดิม: **แทนที่เลยใน Step 4** (แผนนี้) หรือคงคู่กันชั่วคราว?

---

**STOP — รอ:** `PLAN APPROVED — IMPLEMENT STEP 1 ONLY`
