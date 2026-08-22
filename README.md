# MOMENT OS

**Business Moment Operating System** — Every Business Moments / Giftwise Group

เปลี่ยนจากการขายแบบ "รอลูกค้าถามสินค้า" เป็น:

> รู้ว่า Business Moment อะไรกำลังเกิดขึ้น → รู้ว่าใครได้รับผลกระทบ → รู้ว่าควรเสนอ Solution อะไร → รู้ว่าควร Follow-up เมื่อไร → และรู้ว่า Moment ถัดไปคืออะไร

สร้างตาม PRD `MOMENT_OS_SYSTEM_FULL_PRD.md` (v1.0, สิงหาคม 2026)

## สถานะ: MVP Phase 1 (Mock Data)

ทำงานด้วย local mock data ทั้งหมด — ไม่ต้องมี backend / database
("วันนี้" ของระบบตรึงไว้ที่ 22 ส.ค. 2026 เพื่อให้เดโมคงที่ ดู `lib/format.ts` → `TODAY`)

### โมดูลทั้ง 13

| # | โมดูล | Route | สถานะ |
|---|---|---|---|
| 01 | Command Center | `/` | ✅ KPI cards + Priority Feed + นัดหมาย |
| 02 | Moment Radar | `/radar` | ✅ Signal filters + Add Moment (Manual Level 1) |
| 03 | Journey Map | `/journey` | ✅ Master / Account / Revenue modes, 7 Phases × 4 Swimlanes |
| 04 | Business Accounts | `/accounts`, `/accounts/[id]` | ✅ Account 360: timeline, whitespace map, purchase history |
| 05 | Customer Solution Workspace | `/workspace` | ✅ 3 คอลัมน์ + workflow 6 ขั้น (Discovery → Opportunity) |
| 06 | Opportunity Queue | `/opportunities` | ✅ Pipeline strip + ตารางเต็ม + SLA |
| 07 | Solution Library | `/solutions` | ✅ 26 Solutions ผูก Moment/Stakeholder + Packages |
| 08 | Offline Center | `/offline` | ✅ Routing logic, bookings, center dashboard, expansion intel |
| 09 | Customer Success | `/success` | ✅ Next Moment engine, Recover, Win-back |
| 10 | Campaign & Automation | `/automation` | ✅ 6 automations + rule engine + notifications |
| 11 | Analytics | `/analytics` | ✅ Funnel, Revenue by Moment, Moment Economics, North Star |
| 12 | Team Performance | `/performance` | ✅ KPI 4 ทีม + leaderboard |
| 13 | Admin / Moment Library | `/admin` | ✅ 20 Master Moments, Score Formula, Roles |

### Data Layer (`lib/`)

- `types.ts` — โครงสร้างข้อมูลทั้งหมด (MomentEvent ตาม PRD §8, Solution ตาม §28)
- `data/moments.ts` — 20 Master Moments + Discovery Questions + Next Moment mapping
- `data/accounts.ts` — 20 mock business accounts
- `data/events.ts` — 50 moment events (score breakdown /100 ตามสูตร §13)
- `data/solutions.ts` — Solution Library + Packages
- `data/opportunities.ts` — Opportunities, Appointments, Centers
- `format.ts` — Score → Priority (HOT/WARM/NURTURE/WATCH), SLA, ฿ formatting

## รัน

```bash
npm install
npm run dev
```

เปิด http://localhost:3000

## Phase ถัดไป (ตาม PRD)

- **Phase 2:** CRM/ERP Sync, Rule-based Trigger จริง, Offline Booking จริง, AI Sales Brief
- **Phase 3:** External Signal Detection, Predictive Next Moment, Customer Portal

Stack: Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 · lucide-react
