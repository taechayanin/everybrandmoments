# REVIEW PACKET

## Step
Step 4 — CRM Activity Layer: Account 360 UI (Option A scope)

## Goal
Account 360 เป็น daily workspace ของ Customer Solution: เปิดหน้าเดียว → เข้าใจ context → บันทึก interaction → สร้าง next action → ทำงานต่อ โดยไม่ออกจาก Moment OS — ตาม IMPLEMENTATION_PLAN.md + คำตัดสิน Option A (design PDF = visual language เท่านั้น)

## COMMITS
- `98934e9` feat(crm): Account 360 CRM UI (Step 4)
- `dfbb454` fix(crm): step 4 review fixes — UTC normalization + contact idempotency

## STEP-4 REVIEW FIXES (round 1)
1. **occurredAt UTC normalization** — `lib/services/org-time.ts` เพิ่ม `orgLocalToUtcIso` (naive wall time ตีความเป็น Asia/Bangkok ผ่าน Intl offset computation — ไม่พึ่ง implicit parsing; ค่าที่มี zone ผ่านตรง) และ `utcToOrgLocalInput` (edit round-trip); use cases ทั้ง create/log/update normalize ก่อน persist; follow-up due DATE = วัน org-local ของ instant UTC; แสดงผลกลับด้วย Asia/Bangkok เดิม — เทสต์: local→UTC (13:15→06:15Z), boundary ข้ามวัน (00:30→17:30Z วันก่อน), UTC→display, round-trip 3 ค่า lossless, passthrough Z/+07:00, use-case persist จริง
2. **Contact create idempotency** — migration `0005_contact_idempotency.sql` (ADD COLUMN client_request_id + partial unique index, applied local + smoke-tested: 2 INSERT key เดียว → 1 แถว); D1/mock create เป็น INSERT OR IGNORE + survivor read-back คืน `{contact, created}`; action คืน deduped; UI ทุก drawer ออก clientRequestId ใหม่หลัง submit สำเร็จ (สร้างสองรายการติดกันไม่ dedupe ผิด แต่ retry ของ submit เดิมยัง dedupe) + ปุ่ม disabled ระหว่าง pending — เทสต์ repo-level และ action-level (submit ซ้ำ → contact เดียว)

## FILES CHANGED
- `app/accounts/[id]/page.tsx` — restructure: header (health badge, HOT priority, wallet) + Quick Actions bar + layout ซ้าย 2/3 (Activity Timeline นำ, Active Moments, Moment Timeline, Purchases) / ขวา 1/3 (Contacts, Tasks, Open Opportunities, Whitespace, Journey); timeline component remount ด้วย key เมื่อ head เปลี่ยน (bug ที่เจอจาก manual check — useState ไม่ sync props หลัง router.refresh)
- `components/crm/drawer.tsx` (ใหม่) — drawer primitive + Field + input styles
- `components/crm/composer.tsx` (ใหม่) — composer 3 โหมด Note/Call/Meeting: contact/moment/opportunity selects, call outcome+duration, meeting type/location/budget, Next State + Save+Follow-up (บังคับ nextAction+nextActionAt), idempotency key ต่อการเปิด drawer, pending/error states
- `components/crm/timeline.tsx` (ใหม่) — filter chips 7 กลุ่ม, keyset load-more, loading skeleton / empty / error+retry states, item cards (icon/outcome badge/nextState badge/contact attribution/next action), soft delete พร้อม confirm
- `components/crm/contacts-panel.tsx` (ใหม่) — buying role badges (Decision Maker เด่นสุด), primary star, influence, add/edit drawer; รับ event จาก Quick Actions
- `components/crm/tasks-panel.tsx` (ใหม่) — bands เกินกำหนด/วันนี้/ถัดไป/ยังไม่นัดวัน + priority markers + complete checkbox
- `components/crm/quick-actions.tsx` (ใหม่) — action bar + task drawer; 💰 Opportunity/⚡ Moment ลิงก์ไป flow เดิมที่มีอยู่ (ไม่สร้าง architecture ใหม่)
- `lib/application/accounts/get-account-360.ts` — เพิ่ม bounded CRM reads + task bands (org-local วัน) + serializable contact refs
- `app/accounts/[id]/actions.ts` — เพิ่ม `loadTimelineAction` (read path, zod + no write gate)
- `lib/contracts/crm.ts` — เพิ่ม `LoadTimelineSchema`
- `tests/crm-actions.test.ts` (ใหม่) — 12 เทสต์

## SCREENS IMPLEMENTED
Account 360 (desktop + mobile), Activity Composer (Note/Call/Meeting), Follow-up Task drawer, Contact add/edit drawer, Activity Timeline (filters/paging/states), Contacts panel, Tasks panel, Open Opportunities + Moment context เดิม — ครบ 7 ข้อของ scope; ไม่มี Leads/Dashboard/8-stage/Visit Plan

## FIGMA / DESIGN MAPPING
จาก design PDF (Pipedrive-style) ใช้เป็น visual language: ความหนาแน่นข้อมูลแบบกะทัดรัด, badge สถานะชัด (outcome เขียว, next-state คราม, buying role ไล่ลำดับความสำคัญ, priority สี), ตาราง/card hierarchy, quick-actions แบบ CRM แถวเดียวไม่ซ่อน, typography ลำดับชั้นเดิมของระบบ (slate/indigo) — ไม่ยก business architecture ใด ๆ มาจาก design

## UX DEVIATIONS
- Mobile: Intelligence rail อยู่ท้ายหน้า (ตาม column order) แทน collapsible accordion — spec §7 mobile แนะ collapsible; เลือกวิธีง่ายกว่าใน MVP, timeline ยังมาก่อน
- "Add Moment" quick action ลิงก์ไป /radar (flow ตรวจ moment เดิม) — สร้าง moment มือยังไม่มีใน architecture ที่อนุมัติ
- Timeline filter "Tasks" กรอง activity type TASK/TASK_COMPLETED (ยังไม่มี system activity เขียนจริงจนกว่า Step 5 — ผลลัพธ์ว่างชั่วคราว)

## SERVER ACTIONS USED
createNoteAction, logCallAction, logMeetingAction, createTaskAction, completeTaskAction, createContactAction, updateContactAction, deleteActivityAction, loadTimelineAction (ใหม่ — read) — UI ไม่แตะ repository/D1 ตรงเลย; business rules อยู่ application layer เดิมทั้งหมด

## PERFORMANCE
- Account 360 query count: **~11 bounded queries** — account(1) + account hydration batch(3) + activeMoments(1) + momentTimeline(1) + owner(1) + crm timeline(1) + timeline contacts(1 chunked) + contacts(1) + tasks(1 LIMIT 50) + opportunities list(1 LIMIT 100); ไม่มี N+1, ไม่มี listAll()
- Timeline query count: 1 keyset query + 1 contact batch ต่อหน้า (20 items)
- Measured load time: workerd local (production build ผ่าน `wrangler dev`) `/accounts/ACC-001` **~0.25s cold / ~0.02s warm** — เป้า <1.5s ผ่านมาก

## SECURITY
- write gate: ทุก write ผ่าน `writesEnabled()` เดิม (มีเทสต์ disabled → ปฏิเสธพร้อมข้อความ); `loadTimelineAction` เป็น read จึงไม่ gate แต่ validate zod
- organization scope: ไม่เปลี่ยน — ทุก read/write ผ่าน use case → repo org-scoped; idempotency/immutable system activities คงเดิม; DEMO_USER ยังเป็น temporary actor (ไม่ใช่ production auth)

## TESTS
102/102 passing (11 files) — หลัง review fixes — Step 4 เพิ่ม 12 action-integration: Add Note / Log Call / Log Meeting สำเร็จ, FOLLOW_UP ไร้ nextActionAt → error อ่านรู้เรื่อง, strict zod ปฏิเสธ field แปลก + invalid form, business error (cross-account contact) โผล่เป็นข้อความ, write gate disabled บล็อกทุก write, Create Contact, Complete Task idempotent (deduped ครั้งสอง), timeline keyset 22 แถว 2 หน้า + contact hydration, type filter, malformed request → reject

## TYPECHECK
PASS

## LINT
PASS

## BUILD
PASS

## MANUAL UX CHECK (executed บน next dev + in-app Browser)
- Desktop 1440px: layout 2/3-1/3 ตามเป้า ✓ / Mobile แคบ: header stack, quick actions wrap, drawer เต็มจอ ✓
- Composer: เปิด → กรอก → Save+Follow-up → drawer ปิด → **timeline โชว์ note ใหม่ทันที + follow-up โผล่ใน band "ถัดไป"** ✓ (ทดสอบ 2 รอบ)
- FOLLOW_UP บังคับกรอกครบ (required fields โผล่เมื่อเลือก) ✓; complete task → หายจาก band ✓; 👤 Contact จาก Quick Actions เปิด drawer ข้าม component ✓; empty states (timeline/tasks/contacts) ✓; ข้อความไทยยาว wrap ถูกต้อง ✓
- Bug ที่เจอและแก้ระหว่าง check: timeline ไม่ refresh หลัง save (client state ไม่ sync props) → แก้ด้วย key remount (อยู่ใน commit)
- หมายเหตุ: mock in-memory store reset เมื่อ dev-server HMR — dev artifact เท่านั้น (D1 durable); ยืนยันด้วยการทดสอบซ้ำหลัง module เสถียร
- Screenshots: ถ่ายระหว่าง check ผ่าน Browser pane (อยู่ใน session log; ไม่ commit binary ลง repo)

## REMAINING P2 (ตามที่ reviewer บันทึก)
- Account 360 query count ~11 เทียบเป้า ~8 — latency ที่วัดได้ยังต่ำมาก (0.25s cold) จึงยอมรับ
- Timeline filter/paging state reset หลัง mutation (key remount)

## KNOWN RISKS
- Timeline อัปเดตด้วย key-remount → filter/loaded-pages reset หลังบันทึกใหม่ (ยอมรับได้ใน MVP; ปรับเป็น state sync ได้ถ้า reviewer ต้องการ)
- System activities (MOMENT_*, OPPORTUNITY_*) ยังไม่มีตัวเขียนจนกว่า Step 5 — filter chips เตรียมรองรับแล้ว
- Migration 0004 ยัง local เท่านั้น — remote apply อยู่ใน pre-deploy gate

## NEXT PROPOSED STEP
Step 5 — Command Center "My Work Today" + Opportunity activity integration + system moment activities (ปิดหนี้ listAll ใน get-command-center) — รอ `REVIEW APPROVED — PROCEED`
