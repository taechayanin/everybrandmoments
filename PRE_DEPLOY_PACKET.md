# PRE_DEPLOY PACKET — Moment OS CRM Activity Layer

จัดทำ: 2026-08-23 · สถานะ: **เอกสารเตรียมการเท่านั้น — ยังไม่ deploy, ยังไม่ apply remote migrations**
ข้อมูล remote ทั้งหมดในเอกสารนี้มาจาก **read-only queries เท่านั้น** (ไม่มี write ใด ๆ ไปยัง remote)

---

## 1) ACCOUNT LIST SCALE LIMIT

สถาปัตยกรรมปัจจุบันของ `/accounts` (`getAccountList`): candidate set แบบ bounded — 1 account page (**cap 100**) + 4 bulk queries → แล้ว **filter/sort ใน application layer** → แสดงสูงสุด 50 แถว

| Scale | Verdict |
|---|---|
| **Internal pilot ≤100 accounts** | ✅ **acceptable** — candidate set ครอบคลุมทุก account, ผล filter ถูกต้องครบถ้วน (org ปัจจุบัน = 20 accounts) |
| **Production >100 accounts** | ❌ **ไม่ scale-safe** — account ที่อยู่นอก candidate 100 ตัวแรกจะหายจากผล filter (silent omission) — **ต้องย้าย filters/sort/pagination ลง SQL/read model ฝั่ง server ก่อน** |

เราไม่ claim ว่า path นี้ scale-safe: เกิน 100 accounts เมื่อไรถือเป็น blocker ของหน้านี้ทันที (UI contract คงเดิม — เปลี่ยนเฉพาะชั้น read model)

## 2) REVENUE JOURNEY SEMANTICS — AUDIT RESULT

ตรวจ `getRevenueJourney` (หลังแทน `listAll()` ด้วย `listFiltered(limit 100)`) และผู้บริโภคทุกจุด:

- ผู้ใช้เดียวคือ `/journey?mode=revenue` → `RevenueJourney` ใน `app/journey/journey-client.tsx` — **render การ์ดรายแถวเท่านั้น** (PriorityBadge, MomentChip, status, ช่วง wallet ต่อแถว)
- **ไม่มี** การ sum / count / KPI / pipeline total ใด ๆ คำนวณจาก rows ชุดนี้ (ตรวจแล้วทั้ง repo — ไม่มี consumer อื่น)

**Verdict: A — list/preview only → `limit 100` ถูกต้องเชิง semantics** (เป็น preview list ไม่ใช่ analytics) — ไม่มีการ undercount ที่ซ่อนอยู่

ข้อสังเกตเพิ่มเพื่อความโปร่งใส (นอก scope คำถามแต่เกี่ยวเนื่อง): KPI cards บน Command Center มาจาก SQL aggregate `stats()` ทั้งหมด **ยกเว้น** การ์ด "Proposal / Negotiation" ที่นับจาก `opportunities.list({limit:100})` — ถูกต้องที่ pilot scale (opportunities = 12) แต่ต้องเปลี่ยนเป็น aggregate query พร้อมกับงาน scale ในข้อ 1 — บันทึกเป็น TODO เดียวกัน

## 3) REMOTE MIGRATION SAFETY

**ยังไม่ apply** — สถานะและแผน:

### 3.1 สถานะ remote ปัจจุบัน (ตรวจจริง 2026-08-23, read-only)
- DB: `moment-os` (id `600b9e6e-…`, binding DB ของ worker `everybrandmoments`)
- **Migration status**: applied ถึง 0003 — pending 5 รายการ: `0004_crm_activity_layer`, `0005_contact_idempotency`, `0006_system_activities`, `0007_analysis_outbox`, `0008_analysis_retry_lifecycle`
- **Schema inventory**: 28 tables (รวม `d1_migrations`); `contacts`/`tasks` ยังเป็น **legacy schema** (contacts ไม่มี organization_id/บทบาท buying-committee/idempotency; tasks ไม่มี priority/client_request_id) — ตรงตามที่ 0004 ออกแบบให้ rebuild
- **Row counts**: accounts 20 · contacts 21 · tasks 0 · moment_events 51 · moment_signals 5 · opportunities 12 · appointments 4 · users 10 · organizations 1 · audit_logs 0

### 3.2 Preflights (รันจริงกับ remote แล้ว — ผ่านทุกข้อ)
- Orphan FK: contacts→accounts **0** · tasks→accounts **0** · tasks→users **0** · tasks→moment_events **0** · tasks→opportunities **0**
- Legacy status/value: `tasks` ว่าง (0 แถว) → ไม่มี status เก่าต้อง map เข้า CHECK ใหม่
- Contacts backfill JOIN (0004 ดึง organization_id ผ่าน accounts): accounts ที่ org หายหรือชี้ org ที่ไม่มีอยู่ = **0** → backfill ครบ 21/21

### 3.3 ขั้นตอนเมื่อได้ `DEPLOY APPROVED` (ตามลำดับ ห้ามสลับ)
1. **Backup/export**: `npx wrangler d1 export moment-os --remote --output=backups/moment-os-pre-0004-$(date +%Y%m%d-%H%M).sql` + จด **Time Travel bookmark**: `npx wrangler d1 time-travel info moment-os` (D1 restore ย้อนหลังได้ ~30 วัน)
2. **Re-run preflights** (ข้อ 3.2 ทุก query) — ต้องได้ 0 ทุกตัวอีกครั้ง ณ เวลานั้น
3. **Dry-run**: apply 0004–0008 กับ **local D1 ที่ import จาก export ข้อ 1** (`wrangler d1 execute moment-os --local --file=<export>` แล้ว `wrangler d1 migrations apply moment-os --local`) — ยืนยันสำเร็จ + row counts ตรง ก่อนแตะ remote
4. **Apply remote**: `npx wrangler d1 migrations apply moment-os --remote` (ครั้งเดียว ทั้ง 5 ไฟล์ตามลำดับ)
5. **Verify หลัง apply**:
   - Row counts before/after: contacts ต้อง = 21, tasks = 0, ตารางเดิมอื่นไม่เปลี่ยน; ตารางใหม่ (`activities`, `activity_suggestions`, `activity_analyses`) = 0
   - `PRAGMA foreign_key_check` = ว่าง; ตรวจ index สำคัญ: `uq_tasks_client_request`, `uq_contacts_client_request`, `idx_activities_analysis_outbox` (partial), `uq_activities_dedupe`
   - `wrangler d1 migrations list --remote` = ว่าง (applied ครบ)
6. **Rollback/recovery**: migration เป็น forward-only — ถ้าพัง: (a) หยุดทันที ไม่ deploy worker ใด, (b) restore ผ่าน **Time Travel** ไป bookmark ข้อ 1 (`wrangler d1 time-travel restore moment-os --bookmark=<bm>`) หรือ re-import จาก export file, (c) รายงานก่อนพยายามใหม่

## 4) REMOTE RE-SEED SAFETY

หลักฐานการจัดประเภท (read-only, 2026-08-23):
- ทุก account ตรง seed fixtures ในโค้ด (ACC-001 "ABC Clinic", ACC-002 "XYZ Retail", …)
- moment_signals ทั้ง 5 แถวเป็น `SIG-mock-000x`
- `moment_events` ทุกแถวมี created_at เดียวกัน = timestamp seed `2026-08-22T00:00:00Z` (distinct = 1)
- `tasks` = 0 แถว, `audit_logs` = 0 แถว → **ไม่มีข้อมูลที่ทีมสร้างจริงบน remote เลย**

**REMOTE DATA CLASSIFICATION: `DEMO ONLY`**
**DESTRUCTIVE RE-SEED SAFE: `YES`** — เงื่อนไข: ทำหลัง migrations สำเร็จ (ข้อ 3) และ **ต้อง re-run การตรวจ audit_logs/tasks/created_at ซ้ำทันทีก่อน re-seed** — ถ้าพบแถวที่ไม่ใช่ seed แม้แถวเดียว → หยุด และจัดประเภทใหม่ (ถ้ากลายเป็น UNKNOWN = **NO reseed**)

## 5) AI CONFIG

Production candidate (เป็น default ในโค้ดแล้ว — override ได้ทาง env เท่านั้น ไม่ hardcode ใน business logic):

```
AI_MODEL=gpt-5.6-luna
AI_REASONING_EFFORT=low
```

Real smoke benchmark (บันทึกจากรอบ FINAL PROVIDER GATE + MODEL CHANGE):
- Activity Analysis: **~3.3s** (input 901 / output 287 tokens, confidence 0.98, validated solutions ครบ)
- Moment Detection: **~1.8s** (input 755 / output 132 tokens)
- `reasoning_effort=none` เร็วใกล้กันแต่พลาด 1 solution + อ่าน phase ผิด → เลือก `low`

**Secret policy**: `OPENAI_API_KEY` เข้า production ได้ทางเดียวคือ **Cloudflare Worker secret** บน jobs worker (`npx wrangler secret put OPENAI_API_KEY --config workers/jobs/wrangler.jsonc` — user เป็นผู้รันและวางค่าเองแบบ interactive) — key ไม่อยู่ในไฟล์ที่ commit, ไม่อยู่ใน wrangler.jsonc vars, ไม่ถูก print/log ที่ใดในโค้ด (ตรวจ log hygiene แล้วในรอบ smoke: 0 การรั่ว) — local dev ใช้ `workers/jobs/.dev.vars` (gitignored) เท่านั้น

## 6) BLOCKED AI ANALYSES — OPERATOR RESET PROCEDURE

หลังตั้ง `OPENAI_API_KEY` แล้ว (และเฉพาะเมื่อมีงานที่ถูก BLOCK จากช่วงที่ key ยังไม่ถูกตั้ง):

1. **นับก่อน** (read-only):
   `SELECT analysis_status, COUNT(*) FROM activities WHERE analysis_status IN ('BLOCKED') GROUP BY analysis_status;`
   และดู `analysis_last_error` ประกอบ — ต้องเป็น config-class error (no key / 401 / 403) เท่านั้น
2. **Reset เฉพาะ BLOCKED** ผ่าน `resetAnalysis` (ตั้ง status→PENDING, attempt_count→0, ล้าง last_error/next_retry_at) หรือ SQL เทียบเท่า **scoped ที่ `analysis_status='BLOCKED'` + organization เท่านั้น**
3. Cron reconciler จะ enqueue กลับเข้า queue เองในรอบถัดไป (≤15 นาที) — ไม่ต้อง trigger มือ
4. **ห้าม** reset แถว `FAILED` แบบเหมา — FAILED คืองานที่ใช้ 5 attempts กับ error ชั่วคราวจนหมดแล้ว ต้อง triage รายกรณี (ดู last_error ก่อน) ไม่ใช่ผลของ key ที่หายไป

## 7) CLOUDFLARE ACCESS

**ผลตรวจจริง (2026-08-23, unauthenticated curl):**
- `https://everybrandmoments.hello-giftwise.workers.dev/` → **HTTP 200** (เข้าได้ ไม่มี Access)
- `https://moment-os.hello-giftwise.workers.dev/` (worker เก่า) → **HTTP 200** (เข้าได้เช่นกัน — ต้องลบหลัง cutover)

⚠️ **Access ยังไม่ทำงาน — NOT READY** (ความเสี่ยงถูกจำกัดเพราะข้อมูลเป็น DEMO ONLY ตามข้อ 4 แต่เป็นเงื่อนไขบังคับของ internal pilot)

ต้องทำก่อนทีมใช้จริง:
- เปิด Zero Trust → Access → Applications ครอบ worker `everybrandmoments` (self-hosted app บน workers.dev domain หรือ custom domain)
- **Allowed users/domain: อีเมล `@giftwiseasia.com`** (ทีม Giftwise — ยืนยันรายชื่อ/โดเมนสุดท้ายกับ product owner ตอน setup)
- Verification test: curl unauthenticated ต้องได้ **302 → `*.cloudflareaccess.com`** (ไม่ใช่ 200) — บันทึกผลใน deploy report
- ลบ worker เก่า `moment-os` + queue เก่า `moment-os-jobs` (ยังอยู่ทั้งคู่ — ตรวจแล้ว) หลัง cutover ผ่าน smoke
- `DEMO_USER` (USR-010) ยังเป็น actor ชั่วคราว → **PUBLIC PRODUCTION = NO-GO จนกว่า Sprint 7 Auth/RBAC จะแทนที่**

## 8) WORKER / SECRET DEPLOY ORDER (บทเรียน incident 1101)

หลักการ: **ห้ามทิ้ง worker ไว้ที่ secret-change intermediate version** — การ `wrangler secret put` เดี่ยว ๆ สร้าง version ใหม่ที่ไม่ผ่าน build pipeline เต็ม (ครั้งก่อนทำ assets pipeline พังบน app worker) → **secret ต้องถูกตั้งก่อน แล้วปิดท้ายด้วย full deploy เสมอ**

ลำดับที่ปลอดภัย (หลัง `DEPLOY APPROVED` และหลังข้อ 3–4 สำเร็จ):
1. Migrations + verify + re-seed (ข้อ 3, 4) — **ก่อน** deploy โค้ดที่พึ่ง schema ใหม่
2. User ตั้ง secret jobs worker: `npx wrangler secret put OPENAI_API_KEY --config workers/jobs/wrangler.jsonc` (วางค่า interactive — ไม่ผ่าน shell history/ไฟล์)
3. **Deploy jobs worker เป็นคำสั่งถัดไปทันที**: `npx wrangler deploy --config workers/jobs/wrangler.jsonc` → ได้ full version ที่มี secret + consumer ผูก queue `everybrandmoments-jobs` (ตอนนี้ queue มี producer แล้วแต่ยังไม่มี consumer — ตรวจแล้ว)
4. Deploy app worker ปิดท้าย: `npm run deploy` (OpenNext build + assets + worker ครบใน version เดียว) — **นี่คือคำสั่ง deploy สุดท้าย**
5. ห้ามมี `secret put`/config change ใด ๆ ตามหลัง deploy สุดท้าย — ถ้าจำเป็นต้องแก้ secret ภายหลัง: put แล้ว **ตามด้วย full deploy ของ worker นั้นทันทีทุกครั้ง**
6. Verify version หลัง deploy (`wrangler deployments list`) + reset BLOCKED (ข้อ 6) + smoke (ข้อ 9) + เปิด/ตรวจ Access (ข้อ 7) + ลบ worker/queue เก่า

## 9) SMOKE TEST PLAN (หลัง deploy)

**Pages** (ผ่าน Access ด้วย user ที่ได้รับอนุญาต — ทุกหน้า 200 + render ไม่มี error):
`/` · `/admin` · `/accounts` (+ ลอง `?filter=HOT`, `?filter=OVERDUE`) · `/accounts/ACC-001` · `/radar` · `/opportunities`

**CRM writes** (บน ACC-001, ตรวจ timeline/panel refresh + กดซ้ำต้อง idempotent):
create note → log call → log meeting → create follow-up task → complete task → create contact

**AI loop** (E2E บน remote):
log activity ที่มีสัญญาณชัด (เช่นข้อความ expansion) → รอ ≤15 นาที (queue/cron) → suggestion ปรากฏสถานะ PENDING + activity เป็น PROCESSED → **accept** suggestion หนึ่งรายการ (ต้องสร้าง moment event + audit, กดซ้ำไม่เกิดซ้ำ) → **ignore** อีกหนึ่งรายการ → ยิง signal ทดสอบเข้า `/api/signals` (ด้วย `SIGNAL_INGEST_SECRET`) → moment detection สร้าง suggestion ฝั่ง signal

**Queue reliability**:
- Normal delivery: log จาก consumer แสดง job สำเร็จ (tail jobs worker)
- Retry: ตรวจว่า transient error (ถ้ามี) เพิ่ม attempt แล้วงานจบใน attempt ถัดไป — ไม่บังคับให้เกิด แต่บันทึกถ้าพบ
- Reconciliation: สร้าง activity ตอน queue send ล้ม (หรือรอ cron รอบถัดไป) → cron เก็บตกงาน PENDING/stale ภายใน 15 นาที
- DLQ: ยืนยัน `everybrandmoments-jobs-dlq` ผูกเป็น DLQ และว่าง (ถ้ามี message = investigate ก่อนปิด smoke)

ผลทุกข้อบันทึกลง DEPLOY_REPORT พร้อม screenshot/log — ถ้าข้อใด fail: หยุด, รายงาน, ไม่ถือว่า deploy ผ่าน

## 10) FINAL VERDICT

```
INTERNAL PILOT:      GO (มีเงื่อนไข: ทุกขั้นในข้อ 3,4,8 สำเร็จ + Cloudflare Access เปิดและผ่าน verification ก่อนทีมใช้จริง)
PUBLIC PRODUCTION:   NO-GO (DEMO_USER ยังเป็น actor — ต้องรอ Sprint 7 Auth/RBAC; scale limit ข้อ 1 ต้องแก้เมื่อ >100 accounts)

REMOTE MIGRATION:    READY (preflights ผ่านจริงทุกข้อ, backup+dry-run+rollback plan พร้อม — รอ DEPLOY APPROVED เท่านั้น)
REMOTE RE-SEED:      SAFE (จัดประเภท DEMO ONLY จากหลักฐาน; ต้อง re-verify ซ้ำทันทีก่อนลงมือ)
AI:                  READY (model+effort เลือกจาก real benchmark, secret policy พร้อม — เหลือ user ตั้ง OPENAI_API_KEY ตามลำดับข้อ 8)
CLOUDFLARE ACCESS:   NOT READY (ตรวจจริง: unauthenticated ได้ 200 ทั้ง worker ใหม่และเก่า — ต้องเปิดก่อน pilot ใช้จริง)
AUTH/RBAC:           NOT READY (Sprint 7 — blocker เฉพาะ PUBLIC PRODUCTION ไม่ block internal pilot ที่มี Access)

BLOCKERS:
- Cloudflare Access ยังไม่เปิด (internal pilot blocker — ต้องเสร็จภายในลำดับ deploy ข้อ 8/ข้อ 7)
- OPENAI_API_KEY ยังไม่ถูกตั้งเป็น worker secret (user ต้องรันเองตามข้อ 8 ขั้น 2)
- Worker เก่า moment-os + queue เก่า moment-os-jobs ยังไม่ถูกลบ (ทำหลัง cutover ผ่าน smoke)
- PUBLIC PRODUCTION: Sprint 7 Auth/RBAC + SQL pushdown ของ account-list filters เมื่อ >100 accounts
```
