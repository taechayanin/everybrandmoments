# MOMENT OS

**Business Moment Operating System** — Every Business Moments / Giftwise Group

เปลี่ยนจากการขายแบบ "รอลูกค้าถามสินค้า" เป็น:

> รู้ว่า Business Moment อะไรกำลังเกิดขึ้น → รู้ว่าใครได้รับผลกระทบ → รู้ว่าควรเสนอ Solution อะไร → รู้ว่าควร Follow-up เมื่อไร → และรู้ว่า Moment ถัดไปคืออะไร

สร้างตาม PRD `MOMENT_OS_SYSTEM_FULL_PRD.md` (v1.0) + Refactor ตาม `MOMENT_OS_CLOUDFLARE_REFACTOR_PLAN.md`

## สถานะ: Phase 2 Architecture บน Cloudflare (Mock Adapter เป็น default)

```text
UI (Next.js 16 App Router)
  ↓
Application Use Cases   lib/application/
  ↓
Domain Rules            lib/domain/       (MomentCode, typed IDs, Score, OpportunityStage)
  ↓
Repository Interfaces   lib/repositories/
  ↓
Adapters                lib/infrastructure/
                          ├── mock/           ← default (in-memory, demo data)
                          └── cloudflare/d1/  ← MOMENT_OS_DATA_SOURCE=d1
```

- ทุก write ผ่าน Server Action + zod validation (`lib/validation/`)
- Workspace ใช้ state machine ตัวเดียว (`app/workspace/use-workspace-machine.ts`) — เปลี่ยน upstream step จะ reset downstream อัตโนมัติ
- Radar filter ทำงาน server-side ผ่าน URL params + pagination ใน repository
- Clock abstraction (`lib/services/clock.ts`) — mock mode ตรึงวันที่ 22 ส.ค. 2026 เพื่อเดโมคงที่

## รัน (Local Dev — Node runtime)

```bash
npm install
npm run dev
```

## รันบน Cloudflare workerd (จำเป็นก่อน merge/deploy)

```bash
npm run preview
```

Production รันใน `workerd` ไม่ใช่ Node — โค้ดที่ผ่าน `next dev` อาจพังบน Workers, `preview` คือตัวตรวจจริง

## Deploy ขึ้น Cloudflare Workers

```bash
npm run deploy
```

### เปิดใช้ D1 (ครั้งแรก)

```bash
npx wrangler d1 create moment-os          # เอา database_id ไปใส่ wrangler.jsonc
npx wrangler d1 migrations apply moment-os --remote
npm run generate-seed                     # สร้าง seed/seed.sql จาก mock data
npx wrangler d1 execute moment-os --file=seed/seed.sql --remote
```

แล้วตั้ง env `MOMENT_OS_DATA_SOURCE=d1` — UI ไม่ต้องแก้อะไร (สลับ adapter ที่ `lib/infrastructure/index.ts`)

## ตรวจสอบก่อน merge

```bash
npm run lint
npm run typecheck
npm run test        # vitest: score formula + data integrity + createOpportunity
npm run preview
```

## โมดูลทั้ง 13

| # | โมดูล | Route |
|---|---|---|
| 01 | Command Center | `/` |
| 02 | Moment Radar (server-side filters + Add Moment ผ่าน Server Action) | `/radar` |
| 03 | Journey Map (Master / Account / Revenue) | `/journey` |
| 04 | Business Accounts + Account 360 (dynamic, ไม่มี generateStaticParams) | `/accounts`, `/accounts/[id]` |
| 05 | Customer Solution Workspace (state machine 6 ขั้น + Server Action) | `/workspace` |
| 06 | Opportunity Queue (OpportunityStage แยกจาก Moment Status) | `/opportunities` |
| 07 | Solution Library (cross-sell เป็น ID-based relations) | `/solutions` |
| 08 | Offline Center | `/offline` |
| 09 | Customer Success | `/success` |
| 10 | Campaign & Automation | `/automation` |
| 11 | Analytics | `/analytics` |
| 12 | Team Performance | `/performance` |
| 13 | Admin / Moment Library | `/admin` |

## โครงสร้าง Cloudflare

- `wrangler.jsonc` — bindings: `DB` (D1), `FILES` (R2), `MOMENT_JOBS` (Queues), observability เปิดแล้ว
- `migrations/` — normalized schema 25+ ตาราง (organizations, accounts, contacts, moment_events, moment_signals, solutions, solution_relations, opportunities, audit_logs, …) + indexes
- `open-next.config.ts` — OpenNext Cloudflare adapter
- `npm run cf-typegen` — สร้าง `cloudflare-env.d.ts` จาก wrangler.jsonc

## Phase ถัดไป (ตามแผน §53–60)

- Sprint 5: Queues (AI / CRM / ERP jobs) — producer binding มีแล้ว
- Sprint 6: moment_signals + AI Detection + evidence UI (ตารางพร้อมแล้ว)
- Sprint 7: Auth + RBAC + organization scope (ทุก query scoped organization_id แล้ว)

Stack: Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind 4 · zod · Vitest · @opennextjs/cloudflare · Wrangler · D1/R2/Queues
