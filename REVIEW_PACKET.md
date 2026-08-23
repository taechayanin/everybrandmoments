# REVIEW PACKET

## Step
Project Pipeline Step 4 — Project Pipeline UI (Board | List | Create Wizard | Activation)

## COMMIT
1 logical commit: `feat(pipeline): 06 · Project Pipeline UI — board/list/wizard/activation (Step 4)`

## PIPELINE BOARD
`/opportunities` (nav rename: **06 · Project Pipeline**) — Kanban 6 คอลัมน์ตาม sales stages (Thai headers: บรีฟใหม่ → ต่อรอง) แสดง**เฉพาะ ACTIVE**; **DRAFT เป็นแถบแยกนอก funnel** (collapsible, เขียนกำกับ "ยังไม่เข้า pipeline"); WON/LOST/CANCELLED เป็นการ์ดสรุปตัวเลข (1W/0L/0C) ไม่มีคอลัมน์; การ์ด compact ครบ: ชื่อ, account (ลิงก์ 360), Thai moment chip, Thai industry (sub ก่อน group), Thai project type, revenue+GP, owner, close date, last activity, next action+date, ⚠ risk (tooltip รวมทุก flag); **ไม่มี drag-drop** (ตามแผน) — เปลี่ยน stage ผ่านเมนู "ย้าย Stage ▾" → server action → `updateProjectStage` use case เท่านั้น; ถอยหลังเมนูบังคับกรอกเหตุผล inline

## LIST VIEW
toggle `?view=list` — dataset/semantics เดียวกับ board (read model เดียว): Risk / Project+Account / Industry / Moment / ประเภท / Revenue / GP / Close / Owner / Stage (Thai badge) / Activity+Next Action / actions — คอลัมน์เดิมของ Opportunity Queue ครบ ไม่มีตัด

## CREATE PROJECT WIZARD
4 ขั้นตาม handoff §24: **Context** (ลูกค้า → โหลด context ครั้งเดียว: moments ของลูกค้ารายนั้น (Thai label), 14 กลุ่มอุตสาหกรรม + sub, 8 ประเภทโปรเจกต์ — **PT-UNSPECIFIED ไม่อยู่ในรายการเลย** เพราะใช้ `listSelectable()`), **Commercial** (ชื่อ/brief/มูลค่า/GP/ปิด/ส่งมอบ), **คน/Solutions** (solutions ตาม moment ที่เลือก + 4 บทบาท buying committee จาก contacts ของ account — ของเดิมทั้งหมด ไม่มี Playbook), **Next Action** — บันทึก = **DRAFT เสมอ** พร้อมข้อความบอกชัดว่า Activate ทีหลัง
**Idempotent UX**: หนึ่ง `clientRequestId` ต่อหนึ่ง logical submit — retry ใช้ id เดิม, สำเร็จแล้ว regenerate; `IDEMPOTENCY_CONFLICT` แสดงข้อความเฉพาะ ("เปิดฟอร์มใหม่แล้วลองอีกครั้ง")

## DRAFT / ACTIVATION UX
ปุ่ม **▶ Activate** บนการ์ด/แถว DRAFT → drawer เติม context ที่ขาด (industry group+sub / type / next action+date) — hint "ยังขาด: …" เป็น**advisory เท่านั้น**; ผู้ตัดสินคือ `activationGateErrors` + `validateProjectContextRelations` ฝั่ง server เสมอ (ไม่มี rule re-implement ใน React — มี static test กัน import); error จาก gate ถูกแปลเป็นไทย render ตรง ๆ

## THAI CONTEXT
Moment → `THAI_MOMENT_NAMES` (เช่น ขยายธุรกิจ), Industry/Sub → master nameTh, Project Type → ชื่อควบคุมจาก master (legacy sentinel แสดง "ไม่ระบุ (ข้อมูลเก่า)" — controlled display ไม่ใช่ code) — resolve ฝั่ง server ใน read model; ไม่มี EBM_*/PT-*/IND-* โผล่เป็น label หลัก (มีเทสต์ regex)

## LEGACY PROJECT UX
Legacy ACTIVE + PT-UNSPECIFIED ยังโชว์ครบทุกใบ + banner "ข้อมูลโปรเจกต์เดิมไม่สมบูรณ์ — กรุณาระบุประเภทโปรเจกต์" + chip "ยังไม่ระบุ" — ดู/เปลี่ยน stage ได้ปกติ (พิสูจน์สดใน browser); PT-UNSPECIFIED ไม่มีทางเป็นตัวเลือกใหม่

## RISK / FILTERS
Risk จาก `projectRiskFlags()` เดิมล้วน (บวก bulk `lastStageChangeByOpportunities` ใหม่กัน N+1 ของ STUCK_IN_STAGE — mock/D1 parity); filters 12 ตัวจาก concept เดิมทั้งหมด (ALL/MY/DRAFT/ACTIVE/AT_RISK/NO_NEXT_ACTION/OVERDUE/NO_RECENT_ACTIVITY/INCOMPLETE_CONTEXT/WON/LOST/CANCELLED) เป็นลิงก์ `?filter=` server-rendered + validator — ไม่มี Lead model

## ARCHITECTURE
UI → Server Action (`app/opportunities/actions.ts`: gate `writesEnabled` → use case → revalidate) → Use Case → Repository → D1 — **มี static tests บังคับ**: components ห้าม import repositories/infrastructure, actions ห้ามแตะ repo ตรง (ต้องผ่าน use cases), page ไม่มี mutation call

## PERFORMANCE
query count: read model เดียว = 1 project page (cap 100) + 6 bulk queries (accounts/moments/owners/lastActivity/nextTask/lastStageChange, chunked ≤50) + 2 cached master reads ≈ **9 bounded queries** ทั้ง board และ list — ไม่มี per-card load ใด ๆ; wizard เปิด = 1 round trip รวม (account+moments+contacts+masters+solutions)
measured latency: `GET /opportunities` ~**97–160ms** (next dev, จาก server log จริง); actions 1–2ms application time

## TESTS
**230/230 passing** (+4 real-API smoke ข้าม) — Step 4 เพิ่ม 14: board เฉพาะ ACTIVE ตาม stage / DRAFT ไม่ใช่ stage / closed ไม่อยู่คอลัมน์ / Thai moment-industry-type (regex กัน raw codes) / legacy render ปลอดภัย + controlled label / stage change สะท้อนบน board / filters + validation / PT-UNSPECIFIED ไม่อยู่ใน create options / create draft + double-submit หนึ่งแถว / activation error message / static architecture checks (no direct repo/D1 from UI) / org isolation / responsive containers

## TYPECHECK
PASS

## LINT
PASS (0/0)

## BUILD
PASS

## MANUAL UX (บน next dev + mock, browser จริง)
1. ✅ สร้าง Project — wizard 4 ขั้นเปิด/กรอกได้, prefill industry จาก account (รวมกรณี account map ระดับ sub → resolve เป็น group+sub — **bug ที่เจอจากการทดสอบสดและแก้แล้ว**), moments เฉพาะของลูกค้ารายนั้น
2. ✅ DRAFT แถบแยกนอก funnel
3–5. ✅ Activate drawer เติม context → เข้า NEW_BRIEF (ครอบด้วย use-case tests + UI ผูก action ตรง)
6. ✅ **เปลี่ยน stage ผ่านเมนูสำเร็จจริงหลายครั้ง** — จาก server log: `updateProjectStageAction` forward → QUALIFIED และถอยหลังพร้อมเหตุผล (ทดสอบสดโดย product owner ระหว่างรอบนี้ด้วย)
7. ✅ Next Action คงเห็นบนการ์ด/แถวตลอด
8. ✅ Legacy PT-UNSPECIFIED ดูได้ + banner เตือน
9. ✅ Board/List ใช้ read model เดียว (เทสต์บังคับ semantics ตรงกัน)
10. ✅ Thai labels ทั้งหน้า (หัวคอลัมน์/chips/สถานะ/ประเภท)
หมายเหตุ: mock store reset เมื่อ HMR (dev artifact เดิมที่บันทึกไว้ตั้งแต่ CRM Step 4) — ไม่กระทบ D1

## DEVIATIONS
- Close (WON/LOST) / Cancel ยังไม่มีปุ่มใน UI — use cases พร้อมแล้ว แต่ UI จุดที่เหมาะคือ Project Detail (Step 5) เพื่อไม่ยัด reason-form ลงเมนูการ์ด — บันทึกเป็นงาน Step 5
- Wizard ไม่ได้ submit จนจบใน browser อัตโนมัติ (product owner กำลังทดสอบสดใน tab เดียวกัน — ไม่แย่ง session); flow เดียวกันถูกพิสูจน์ครบที่ use-case layer + action wiring เป็น pattern เดียวกับ stage menu ที่พิสูจน์สดแล้ว

## KNOWN RISKS
- Candidate cap 100 + filter ใน application layer (pattern เดียวกับ account list — SQL pushdown เมื่อโต, UI contract เดิม)
- Contact-role links ใน wizard ยิงหลัง create (แต่ละ link idempotent ด้วย unique key) — ไม่ atomic กับ create; ยอมรับได้เพราะ role link เป็นข้อมูลเสริม เพิ่ม batch รวมได้ใน Step 5 ถ้าต้องการ
- Board แสดงทุกการ์ดต่อคอลัมน์ (ไม่มี per-column cap) — โอเคที่ pilot ≤100

## NEXT PROPOSED STEP
Step 5 — Project Detail (tabs: Overview / Activities / Contacts / Solutions / Tasks / Commercial+Close+Cancel / ERP)
