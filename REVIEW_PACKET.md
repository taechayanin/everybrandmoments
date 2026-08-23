# REVIEW PACKET

## Step
Pre-sprint cleanup — close remaining known issues before CRM Activity Layer sprint

## Goal
เคลียร์ non-blockers ที่ค้างจากรอบ review ก่อนหน้า เพื่อให้ CRM sprint เริ่มจากฐานที่สะอาด:
1. Remote re-seed ล้มเหลวจาก FK constraint (audit_logs อ้าง organizations แต่ไม่ถูกล้างก่อน)
2. Signals ที่ job ตกลง DLQ ค้างสถานะ `queued` ตลอดกาล
3. Analytics / Customer Success ยังใช้ `moments.listAll()` + `accounts.search({limit:1000})` full scans

## Commits
- `98bf02f` fix(seed): clear audit/task/attachment tables before re-seed
- `794f85a` fix(jobs): consume DLQ and mark dead-lettered signals failed
- `0e656ec` perf(dashboards): store-side aggregates replace listAll scans

## Files Changed
- scripts/generate-seed.ts, seed/seed.sql — CLEAR_ORDER เพิ่ม audit_logs, tasks, attachments, automation_rules, account_external_ids, deliveries_external (ลบก่อน parents)
- workers/jobs/src/index.ts — DLQ consumer: parse job → UPDATE moment_signals เป็น `failed` (scoped org+account, guard `!= 'processed'`) → ack เสมอ
- workers/jobs/wrangler.jsonc — เพิ่ม consumer สำหรับ `everybrandmoments-jobs-dlq` (max_retries 0)
- lib/repositories/index.ts — เพิ่ม `AccountStats`, `AccountRepository.stats/listByHealth`, `MomentStats`, `MomentListFilter`, `MomentRepository.stats/listFiltered`; ติด doc ว่า `listAll()` = mock/tests only
- lib/infrastructure/cloudflare/d1/repositories.ts — implement ทั้ง 4 เมธอดด้วย SQL aggregate (`SUM(CASE WHEN …)`) และ filtered SELECT + LIMIT
- lib/infrastructure/mock/repositories.ts — mirror ทั้ง 4 เมธอดแบบ in-memory
- lib/application/analytics/get-analytics-view.ts — 2 aggregate queries แทน full scan
- lib/application/customer-success/get-success-view.ts — 6 bounded queries + 1 batch `getByIds` แทน full scan
- tests/aggregates.test.ts — ใหม่ 4 เทสต์

## Architecture Changes
ไม่มีการเปลี่ยน layer boundaries — เพิ่มเมธอดใน repository interface แล้ว implement ทั้ง 2 adapters (mock + D1) ตามแบบเดิม

## Database / Migration
ไม่มี migration ใหม่ (query ใหม่ใช้ index เดิม: `idx_moment_org_account_status`, org scans)

## Repository / Use Case Changes
ตามรายการไฟล์ข้างบน — `listAll()` ยังอยู่เพื่อ mock/tests แต่ production dashboards ไม่เรียกแล้ว (ยกเว้น get-command-center และ get-revenue-journey — ดู Known Limitations)

## API / Server Actions
ไม่มีการเปลี่ยน

## UI / UX
ไม่มีการเปลี่ยน (ข้อมูลบนหน้า /analytics และ /customer-success เท่าเดิม แค่วิธี query เปลี่ยน)

## Figma Comparison
N/A — ไม่มีการเปลี่ยน UI

## Security
- Authentication: ไม่เปลี่ยน (write gate เดิม)
- Organization Scope: query ใหม่ทุกตัว scope `organization_id = ?`; DLQ UPDATE scope org + account + guard processed
- Permissions: ไม่เปลี่ยน
- Validation: DLQ ใช้ JobSchema.safeParse ก่อนแตะ DB
- Write Gate: ไม่เปลี่ยน

## Performance
- Query Count: /analytics 2 queries (เดิม ~2 full scans + hydration ~8); /customer-success 8 bounded queries (เดิม full scan ทุก moment + ทุก account)
- Pagination: listFiltered มี LIMIT ทุก call (8 หรือ 20)
- N+1: ไม่มี — account hydration ใช้ getByIds ชุดเดียว
- Caching: master-data cache เดิมไม่เปลี่ยน
- Known Risks: `SUM(CASE WHEN)` เป็น table scan ใน D1 แต่ bounded ที่จำนวน rows ของ org เดียว — โอเคที่ pilot scale; ถ้าโตค่อยเพิ่ม counter table

## Tests Added
- tests/aggregates.test.ts — account stats = full-scan parity, listByHealth filter+bound, moment stats parity, listFiltered filter/order/limit

## Test Results
41 / 41 passing

## Typecheck
PASS

## Lint
PASS

## Build
ไม่ได้รัน full OpenNext build ในรอบนี้ (deploy ถูก gate อยู่แล้ว — จะรันเป็นส่วนหนึ่งของ deploy sequence)

## Known Limitations
- `get-command-center.ts` และ `get-revenue-journey` ยังใช้ `listAll()` — จงใจเก็บไว้เพราะ CRM sprint §44 จะ redesign Command Center เป็น "My Work Today" อยู่แล้ว (จะแก้ใน sprint นั้นด้วย aggregate ชุดใหม่ ไม่แก้ซ้ำสองรอบ)
- Signals ที่ mark `failed` ยังไม่มี UI แสดง — โผล่ใน DB เท่านั้น
- DLQ consumer ยังไม่ persist dead-letter payload ลง table (log อย่างเดียว)

## Decisions / Trade-offs
- เลือก Option "consumer บน DLQ ใน worker เดียวกัน" แทน worker แยก — โค้ดน้อยกว่า, ไม่มี latency requirement
- `listFiltered` ออกแบบเป็น filter object แทนเมธอดเฉพาะกิจหลายตัว — CRM sprint ใช้ต่อได้ (เช่น section ของ dashboard ใหม่)

## Things Reviewer Should Check Carefully
1. DLQ UPDATE guard: `processing_status != 'processed'` เพียงพอไหม (ไม่มี guard เวอร์ชัน/timestamp)
2. `stats()` ของ accounts นับ active จาก `customer_since IS NOT NULL AND != ''` — semantics ตรงกับของเดิม (`a.customerSince` truthy) ไหม
3. wrangler.jsonc: DLQ consumer `max_retries: 0` — ถ้า UPDATE ล้มเหลว message หายเลย (ack เสมอ) — ยอมรับได้ไหมสำหรับ observability-only path

## Next Proposed Step
CRM Activity Layer — Step 1 (Migration 0004 + Activity domain + Zod contracts) ตาม IMPLEMENTATION_PLAN.md — รอ `PLAN APPROVED — IMPLEMENT STEP 1 ONLY`
