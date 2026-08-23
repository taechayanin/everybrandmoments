# REVIEW PACKET

## Step
Step 5 — Command Center My Work Today + Opportunity Activity Integration + System Moment Activities

## COMMITS
- `c3e1b57` feat(crm): my work today, opportunity activity context, system moment activities (Step 5)
- `7081f9f` fix(crm): step 5 review fixes — atomic cron system activity + zero-activity risk

## STEP-5 REVIEW FIXES (round 1)
1. **Rule-cron atomic + self-repairing** — moment + MOMENT_DETECTED เป็น `db.batch()` เดียว; activity ใช้ `INSERT OR IGNORE ... SELECT ... FROM moment_events WHERE dedupe_key = ?` โดย derive key ใน SQL (`'MOMENT-DETECTED:' || e.id`) → rerun ที่ข้าม moment insert ยัง**ซ่อม activity ที่หาย**ได้ และ OR IGNORE กันซ้ำ — **พิสูจน์บน D1 จริง**: จำลอง moment มีอยู่แต่ activity หาย → rerun → moments=1, activities=1 → rerun อีก → ยังคง 1/1 (invariant ตรงตามที่สั่ง)
2. **Zero-activity no-contact risk** — canonical rule ใน domain: `isOpportunityAtRisk(stage, lastActivityAt, createdAt, now)` — fallback `createdAt` เมื่อไม่เคยมี activity (COALESCE semantics), threshold `NO_CONTACT_RISK_DAYS = 7`, Won/Lost excluded; `Opportunity.createdAt` เพิ่มทั้ง domain/D1 mapper/mock; queue view โชว์ `daysSinceContact` + `atRisk` และ `atRiskCount` (StatCard "No-Contact ≥7 วัน") **ใช้ฟังก์ชันเดียวกับ badge ต่อแถว**; UI แสดง "ยังไม่มี activity · N วัน ⚠" — เทสต์ครบ 5 เคสของ reviewer (0 activity+2วัน / 0 activity+10วัน / activity เมื่อวาน / activity 8 วัน / closed) + boundary 7 วันพอดี + counter=rows consistency

## FILES CHANGED
- `migrations/0006_system_activities.sql` (ใหม่) — rebuild `activities` ให้ `created_by` nullable (system rows ไม่มี human actor; SQLite drop NOT NULL ต้อง rebuild) — indexes/CHECKs เดิมครบ, applied local
- `lib/domain/activity.ts` — `momentActivityKey(kind, eventId)` (DETECTED/VERIFIED/REJECTED) + `Activity.createdBy: UserId | null`
- `lib/repositories/index.ts` — `AccountStats.atRiskCount`, `MomentListFilter.expectedFrom/expectedTo`, `MomentRepository.workStats(today)`, `TaskRepository.nextOpenTaskByOpportunities(ids)`
- D1 + mock adapters — implement ทั้งหมดข้างบน (workStats = 1 aggregate query CASE sums; next-open-task = window query ROW_NUMBER ต่อ opportunity, chunked ≤50)
- `lib/application/moments/verify-moment.ts` — confirm/reject เขียน MOMENT_VERIFIED/MOMENT_REJECTED (actor = ผู้ตัดสิน)
- `lib/application/moments/get-command-center.ts` — rewrite เป็น bounded ทั้งหมด (ปิดหนี้ listAll สุดท้ายของ production paths) + `myWork` + `taskAccountNames`; รับ `userId`
- `lib/application/opportunities/get-opportunity-queue.ts` — เพิ่ม lastActivityAt / daysSinceLastActivity / nextFollowUp ผ่าน 2 bulk queries
- `workers/jobs/src/detection.ts` — MOMENT_DETECTED ใน batch เดิม (atomic กับ evidence attach) key ด้วย event id, created_by NULL
- `workers/jobs/src/rules.ts` — cron rule events เขียน MOMENT_DETECTED เฉพาะเมื่อ insert จริง (occurrence dedupe เดิม + key ต่อ event)
- `components/crm/my-work-today.tsx` (ใหม่) — 3 band columns + ลิงก์ account + complete checkbox + empty state
- `app/page.tsx` — My Work Today section บนสุดใต้ KPI; ส่ง DEMO_USER
- `app/opportunities/page.tsx` — คอลัมน์ Activity: badge คุยล่าสุด N วัน (แดงเมื่อ ≥7 วัน = no-contact risk ตาม spec §27) / "ยังไม่มี activity" + next follow-up
- `tests/crm-step5.test.ts` (ใหม่) — 11 เทสต์

## MY WORK TODAY
ตอบ "วันนี้ต้องทำอะไร" บน Command Center โดยไม่ต้องไล่เปิด Account: bands เกินกำหนด/วันนี้/ถัดไป (ของ user ปัจจุบัน = DEMO_USER จนกว่า Sprint 7), นัดหมายวันนี้ (section เดิม), HOT Moments counter (workStats.activeHot — active เท่านั้น), At-Risk accounts counter (accounts aggregate) — **ขอบวันคำนวณจาก `orgLocalDate` (Asia/Bangkok) ไม่ใช่วัน UTC** และใช้ dedicated read model (band queries + aggregates) ไม่โหลดทั้งตารางมากรองใน JS

## OPPORTUNITY ACTIVITY INTEGRATION
แถว opportunity โชว์: คุยล่าสุด N วันก่อน (คำนวณจาก `lastActivityByOpportunities` — GROUP BY MAX หนึ่ง query), next follow-up (`nextOpenTaskByOpportunities` — window query หนึ่ง query, OPEN/IN_PROGRESS เท่านั้น เรียง due เร็วสุด), badge เตือนแดงเมื่อ ≥7 วัน — **ไม่ duplicate ข้อมูล activity ลง opportunity record, ไม่มี per-opportunity loop**

## SYSTEM MOMENT ACTIVITIES
- **MOMENT_VERIFIED / MOMENT_REJECTED** — เขียนใน verify use case เมื่อ `changed === true` เท่านั้น; idempotent สองชั้น (guarded decision + `clientRequestId = MOMENT-<KIND>:<eventId>` ชน unique index); actor = ผู้ตัดสินจริง; reject เก็บเหตุผลใน body
- **MOMENT_DETECTED** — detection consumer เขียนใน `db.batch()` เดิม (atomic กับ signal attach) และ rule cron เขียนเมื่อ insert occurrence จริง; `created_by = NULL` (system); key ต่อ moment event → redelivery/replay/attach เพิ่ม evidence → ไม่เกิดแถวซ้ำ
- Org-scoped ทุกแถว, อ้าง `moment_event_id`, **immutable** จาก CRM edit/delete (editable-type guard เดิม + เทสต์), ไม่ backfill ของเก่า (ตามแผน)

## IDEMPOTENCY
ยืนยันด้วยเทสต์: confirm ซ้ำ → MOMENT_VERIFIED 1 แถว; reject ซ้ำ → 1 แถว; key determinism; **D1 จริง (local): INSERT MOMENT_DETECTED ซ้ำ key เดียว → 1 แถว, created_by NULL**; cron rerun ไม่เขียน (activity เขียนเฉพาะเมื่อ event insert สำเร็จ ซึ่ง dedupe ด้วย occurrence key เดิม)

## SECURITY / ORG SCOPING
ทุก query ใหม่ bind org; write gate/zod/immutability เดิมไม่แตะ; DEMO_USER ยังเป็น temporary actor (คอมเมนต์กำกับใน page); worker เขียนผ่าน SQL scoped org+account เหมือน pattern เดิม

## PERFORMANCE
- query count: Command Center **8 bounded queries** (workStats 1, accountStats 1, feed radar 1, next30 listFiltered 1, opportunities page 1, appointments 1, myWork 3-in-parallel → นับเป็น 3, accounts getByIds 1, users master 1 ≈ 10 รวม) — **ไม่มี listAll เหลือใน production paths แล้ว** (เหลือ get-revenue-journey หน้า /journey — นอก scope Step 5, บันทึกใน risks); opportunity queue +2 bulk queries (คงที่ไม่ขึ้นกับจำนวนแถว)
- measured latency: next dev render ทันตา; workerd measurement รอบก่อน /admin 0.8s→หน้า / ใช้ pattern query เบากว่าเดิม (แทน ~200 แถว scan ด้วย aggregate)

## TESTS
115/115 passing (12 files) — หลัง review fixes — Step 5 เพิ่ม 11: **Bangkok-vs-UTC boundary จริง** (17:30Z = วันที่ 23 ที่ไทย → task due 22 เป็น overdue ทั้งที่ UTC ยังวันที่ 22), today/upcoming boundary + DONE excluded, assignee isolation, workStats parity, next-30 window bound, opportunity last/days/next follow-up, next-task excludes DONE + earliest due, MOMENT_VERIFIED once on repeat, MOMENT_REJECTED once + reason, key determinism, system activity แก้/ลบไม่ได้

## TYPECHECK
PASS

## LINT
PASS

## BUILD
PASS

## DEVIATIONS
- `getCommandCenter()` เปลี่ยน signature รับ `userId` (จำเป็นสำหรับ My Work Today; caller เดียวคือหน้า /)
- ~~rule cron ไม่ batch~~ → แก้แล้วใน `7081f9f` เป็น batch atomic + self-repair
- workStats นับ HOT เฉพาะ active (ตรง semantic เดิมของหน้า) ต่างจาก `stats().hot` ที่นับทุกสถานะ (ใช้ที่ /analytics)

## KNOWN RISKS
- `get-revenue-journey` (หน้า /journey) ยังใช้ listAll — production path เดียวที่เหลือ, ปริมาณ bounded ที่ org เดียว; เสนอเก็บใน sprint analytics ถัดไป
- Migration 0004–0006 ยัง local เท่านั้น — remote apply รวมอยู่ใน pre-deploy gate (ต้องรัน preflight ก่อนตามแผน)
- My Work Today แสดงของ DEMO_USER — ทีมจะเห็น band เดียวกันจนกว่า Sprint 7 auth

## NEXT PROPOSED STEP
Step 6 — AI Activity Analysis (ANALYZE_ACTIVITY job + consumer + suggestions UI + acceptAtomic ตามแผน rev 4) — รอ `REVIEW APPROVED — PROCEED`
