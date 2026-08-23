# REVIEW PACKET

## Step
Project Pipeline Step 1 — Thai Masters / Master Data Foundation

## COMMIT
(ดู git log — 1 logical commit: `feat(masters): Thai industry/project-type masters + Thai moment names (Pipeline Step 1)`)

## MASTERS CREATED
- `industries` — 14 กลุ่มบนสุด (handoff §20) + 24 sub-industries seed (สุขภาพครบ 6 ตาม handoff; กลุ่มอื่นเท่าที่ demo data ต้องใช้ + ธรรมชาติของกลุ่ม) = **38 แถว**; parent_id FK self-reference ลึก 1 ชั้นเท่านั้น (เทสต์บังคับ); uniqueness: ชื่อกลุ่ม unique ทั้งตาราง (partial index parent IS NULL), ชื่อ sub unique ภายในกลุ่ม (partial index parent IS NOT NULL)
- `project_types` — 8 ประเภทเลือกได้ + 1 sentinel = **9 แถว**; `selectable` + `active` CHECK (0,1); ชื่อไทย unique
- Canonical source = `lib/domain/industry.ts` (INDUSTRIES / PROJECT_TYPES / LEGACY_INDUSTRY_MAP) — migration และ seed **ถูกตรึงกับ constants ด้วย drift tests** (แบบเดียวกับ activity CHECKs)

## THAI MOMENT MAPPING
- `THAI_MOMENT_NAMES: Record<MomentCode, string>` — **type system บังคับ 1:1 กับ 20 codes เดิม** (key ขาด/เกิน = compile error) + เทสต์ยืนยันชื่อไม่ซ้ำ ไม่ว่าง
- `master_moments.thai_name` คอลัมน์ใหม่ + `MasterMoment.thaiName` ใน domain — **code เดิม ("EBM Start" ฯลฯ) ไม่ถูกแตะแม้แต่ตัวเดียว** (FK/data ผูกอยู่); mapping ตาม handoff §19 เช่น EBM Expand → ขยายธุรกิจ

## INDUSTRY / SUB-INDUSTRY
- Repositories ใหม่ mock/D1 parity: `IndustryRepository {listAll (groups ก่อน subs), getById}` — D1 ใช้ master cache 60s แบบเดียวกับ master_moments
- `accounts.industry_id` (FK, nullable) + backfill จาก free text เดิมผ่าน `LEGACY_INDUSTRY_MAP` (17 label → master id) — **ผล local: 20/20 accounts map ได้ครบ, unmapped = 0, FK ผิด = 0**; คอลัมน์ `industry` เดิมคงไว้เป็น display legacy ตามแผน; `Account.industryId` ใน domain แล้ว (mock derive จาก map เดียวกัน = lockstep กับ D1)

## PROJECT TYPES
`เปิดสาขาใหม่ · รีแบรนด์ · Onboarding/Welcome Kit · Seasonal/Festival Campaign · Launch Event · Corporate Gifting · Uniform Program · Loyalty/Repeat Program` + `PT-UNSPECIFIED "ไม่ระบุ (ข้อมูลเก่า)"`
- `ProjectTypeRepository {listAll, getById, listSelectable}` — `listSelectable()` คือทางเดียวที่ UI สร้าง Project ใหม่จะเรียก

## UNSPECIFIED LEGACY RULE (reviewer decision #4)
- `selectable = 0` ระดับ schema + `isSelectableProjectType()` ระดับ domain คืน false + `listSelectable()` ไม่มีมันอยู่ — เทสต์ยืนยันทั้งสามชั้น
- ยังโผล่ใน `listAll()` เพื่อ render label ของแถว legacy เท่านั้น
- การบังคับที่ activation gate (project ใหม่ห้ามใช้แม้ส่งตรง ๆ) เป็นของ Step 2/3 ตาม state machine — helper พร้อมแล้ว

## MIGRATION / SEED
- `migrations/0009_thai_masters.sql` — **applied LOCAL เท่านั้น** (`--local` ✅; remote ยังค้าง 0004–0009 ตามเกต PRE_DEPLOY): ตาราง+index+CHECK, insert masters 38+9, thai_name backfill 20, accounts backfill 17 UPDATEs
- `scripts/generate-seed.ts` + `seed/seed.sql` regenerate: industries/project_types อยู่ใน CLEAR_ORDER (ลบ accounts ก่อนเสมอ — FK), master_moments insert รวม thai_name, accounts insert รวม industry_id
- **Idempotence พิสูจน์จริง**: รัน seed ซ้ำบน local D1 → counts เท่าเดิมทุกตาราง (38/9/20) ไม่ duplicate

## TESTS
**165/165 passing** (+4 real-API smoke ข้ามเมื่อไม่มี key) — Step 1 เพิ่ม 15: industry uniqueness (id/group name/sub-in-group), 14 groups ตรงเป๊ะ, sub→parent ถูกกลุ่ม+ลึก 1 ชั้น, project type uniqueness, UNSPECIFIED ไม่ selectable (domain+repo), listSelectable ตัด sentinel, Thai names 1:1 กับ 20 codes + ไม่ซ้ำ, repo semantics (groups-first, getById), mock accounts industryId ตรง legacy map + map ครบ 20/20, legacy map targets มีจริงใน master, drift migration 0009 (industries/types/thai/backfill/constraints ครบทุกแถว), seed deterministic (DELETE ก่อน INSERT + row counts + ACC-001 มี industry_id)

## TYPECHECK
PASS

## LINT
PASS (0 errors, 0 warnings)

## BUILD
PASS

## DEVIATIONS
- ไม่มี deviation จาก scope — เพิ่มเติมเล็กน้อยที่อยู่ในเจตนา Step 1: `Account.industryId` ถูก expose ใน domain type แล้ว (เตรียม prefill ของ Step 2 wizard โดยไม่ต้องแตะ read path อีกครั้ง) — ไม่มี UI เปลี่ยน, ไม่มี write path ใหม่, ไม่แตะ opportunity schema

## KNOWN RISKS
- `master_moments.thai_name` เป็น nullable ระดับ DB (SQLite ADD COLUMN จำกัด) — domain บังคับ NOT NULL ผ่าน type + drift test; D1 mapper fallback ไป description ถ้าเจอแถวเก่าผิดปกติ
- Sub-industries กลุ่ม FINANCE/REALESTATE/MANUFACT/GOV/AUTO/EDU/LOGISTICS ยังไม่มี seed (เพิ่มผ่าน master ได้ — ไม่มี demo account ใช้)
- Migration 0009 ยังไม่ apply remote (ถูกต้องตามเกต — เข้าคิวต่อจาก 0004–0008 ใน PRE_DEPLOY sequence)

## NEXT PROPOSED STEP
Step 2 — Project Schema Evolution (migration 0010: status×stage + context บน project + stage_history + project_contacts + repositories)
