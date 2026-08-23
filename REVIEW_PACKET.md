# REVIEW PACKET

## Step
Step 7 — Operational Account List (CRM columns + filters) + read-model debt closure

## COMMIT
`03b0029` (+ ก่อนหน้าในรอบเดียวกัน: `1ece4c7` model default `gpt-5.6-luna` + reasoning effort ตามคำสั่ง product owner — real benchmark ผ่านแล้ว)

## ACCOUNT LIST
`/accounts` เปลี่ยนจาก informational cards → **operational table** ตอบ "ใครต้องถูกดูแลตอนนี้": Company (+Prospect flag), Owner, Current Moment (chip), Priority (score badge), **Last Activity** ("N วันก่อน" แดงเมื่อ ≥7 / "ยังไม่เคยบันทึก"), **Next Follow-up** (แดง=เกินกำหนด เหลือง=วันนี้), **Pipeline** (มูลค่ารวม + จำนวน open opp), Health — เรียง moment score ก่อน (HOT บนสุด) แล้ว account score — ตรวจบน browser จริง: filter HOT → 6 จาก 20 accounts ครบทุกคอลัมน์

## FILTERS
Chips เป็นลิงก์ `?filter=…` (server-rendered, state อยู่ใน URL, validate ด้วย `isAccountListFilter` ก่อนใช้): ทั้งหมด / ของฉัน (owner = current user) / 🔥 HOT / ไม่มี Follow-up / ไม่ติดต่อ 7·14·30 วัน (**account ที่ไม่เคยมี activity นับเป็น no-contact เสมอ** — worst case) / ⚠ At Risk (health) / มี Opportunity / นัดวันนี้ / เกินกำหนด — วันคำนวณ **org-local Asia/Bangkok** ทุกตัว; ไม่มี business concept ใหม่ (ทุก filter derive จากข้อมูลที่มีอยู่)

## ANALYTICS / READ MODELS
- `ActivityRepository.lastActivityByAccounts` (GROUP BY MAX, chunked ≤50) + `TaskRepository.nextOpenTaskByAccounts` (ROW_NUMBER window, OPEN/IN_PROGRESS เท่านั้น) — mock+D1 parity
- `getAccountList` read model: **1 account page (cap 100) + 4 bulk queries** → enrich → filter/sort ใน application layer → cap 50 rows; เมื่อ org โต >100 ค่อย push filter ลง SQL โดย UI contract ไม่เปลี่ยน (บันทึกใน risks)
- **ปิดหนี้ listAll production ตัวสุดท้าย**: `getRevenueJourney` (/journey) → `listFiltered` 8 สถานะที่หน้าใช้จริง limit 100 + `getByIds` hydration — **ทั้งระบบไม่มี listAll ใน production path แล้ว**

## PERFORMANCE
- query count: `/accounts` = 1 (accounts) + 1 (active moments bulk) + 1 (last activity GROUP BY) + 1 (next task window) + 1 (opportunities page) + hydration ภายใน account search ≈ **8 bounded queries** ไม่ขึ้นกับจำนวนแถวที่แสดง; ไม่มี N+1, ไม่มี per-account loop
- measured latency: next dev render ทันที (20 accounts); pattern query เดียวกับหน้าที่วัดบน workerd แล้ว (<0.3s)

## SECURITY / ORG SCOPE
ทุก query ใหม่ bind org (bulk lookups ด้วย id แปลก → ว่าง — มีเทสต์); ไม่มี write path ใหม่ (gate/zod/idempotency/immutability ไม่แตะ); `?filter` ผ่าน validator; DEMO_USER = current user ชั่วคราวสำหรับ "ของฉัน" (จนกว่า Sprint 7)

## TESTS
150/150 passing (+4 real-API smoke ข้ามเมื่อไม่มี key) — Step 7 เพิ่ม 11: last activity + days-since (รวมไม่มี activity → null), next follow-up + NO_FOLLOWUP, no-contact 7/30 รวม never-contacted, AT_RISK ตรง health, HOT เฉพาะ ≥85, MY scope, DUE_TODAY/OVERDUE org-local, OPEN_OPP + sort ordering ทุกคู่, bounded ≤50/≤100 + org isolation (foreign ids ว่าง), filter validation กัน input แปลก, revenue journey bounded + statuses ถูก + ชื่อ hydrate จริง

## TYPECHECK
PASS

## LINT
PASS (0 errors, 0 warnings — เพิ่ม ignore `workers/**/.wrangler/**` กัน dev-bundle ชั่วคราวหลุดเข้า scope)

## BUILD
PASS

## KNOWN RISKS
- Candidate cap 100 + filter ใน application layer — ถูกต้องที่ pilot scale (20 accounts); เกิน 100 ต้องทำ SQL pushdown (UI contract เดิม) — งานอนาคต
- Owner column แสดง user id ดิบ (ไม่ hydrate ชื่อ เพื่อไม่เพิ่ม query — ชื่อเต็มอยู่ในหน้า 360); ปรับได้ถ้าต้องการ

## PRE-DEPLOY ITEMS (รอ `REVIEW APPROVED — PREPARE PRE_DEPLOY PACKET`)
- **AI model**: ✅ real benchmark เสร็จแล้ว — `gpt-5.6-luna` + `reasoning_effort=low`: activity 3.3s (901/287 tokens), detection 1.8s (755/132 tokens), แม่นเท่า/ดีกว่า `gpt-5-mini` (ซึ่ง alias resolve เป็น 2025-08-07 ตามข้อสังเกต reviewer); effort `none` ด้อยกว่าเล็กน้อยจึงเลือก `low` — defaults ในโค้ดแล้ว: `AI_MODEL=gpt-5.6-luna`, `AI_REASONING_EFFORT=low` (override ได้ทาง env)
- **Remote migrations 0004–0008** + preflight checks (orphan contacts/tasks FKs, unknown statuses) ตามแผน
- **Secrets**: `OPENAI_API_KEY` (jobs worker) — **ตั้ง secret ก่อน แล้ว deploy เป็นคำสั่งสุดท้าย** (บทเรียน Secret-Change incident); `SIGNAL_INGEST_SECRET` ตั้งแล้ว
- **Cloudflare Access** ครอบ worker ก่อนทีมใช้จริง (ยังไม่เปิดใน dashboard) + ลบ worker เก่า `moment-os` และ queue เก่า `moment-os-jobs`
- Re-seed remote (schema contacts/tasks ใหม่); reset BLOCKED analyses หลังตั้ง key (`resetAnalysis`); Sprint 7 auth+RBAC ยังเป็นเงื่อนไข public production

## NEXT
รอ `REVIEW APPROVED — PREPARE PRE_DEPLOY PACKET`
