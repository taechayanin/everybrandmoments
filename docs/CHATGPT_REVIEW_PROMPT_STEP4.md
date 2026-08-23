# ChatGPT Review Prompt — Project Pipeline Step 4 (UX / UI / Coding)

วิธีใช้: copy ทั้งบล็อกด้านล่างวางใน ChatGPT แล้วแนบ (1) screenshot หน้า Board, List, Wizard, Activate drawer จากเบราว์เซอร์ของคุณ (2) ไฟล์โค้ดตามรายการท้าย prompt (ลากไฟล์เข้า chat หรือวางเนื้อหา)

---

You are reviewing Step 4 (Project Pipeline UI) of "Moment OS", a Thai-first CRM on Next.js 16 App Router + Cloudflare Workers/D1. The system follows a strict layered architecture: UI → Server Actions → Application Use Cases → Repository Interfaces → Adapters (mock/D1) → D1. Business rules live ONLY in the domain/application layers.

CONTEXT (approved in earlier review rounds — do NOT re-litigate):
- The Opportunity entity IS the "Project" (no separate projects domain).
- Two axes: Project Status (DRAFT/ACTIVE/WON/LOST/CANCELLED) × Sales Stage (NEW_BRIEF→DISCOVERY→QUALIFIED→SOLUTION_DESIGN→PROPOSAL→NEGOTIATION, ACTIVE only). DRAFT is NOT a stage.
- Activation gate (canonical, server-side): account, industry_id, moment_event_id, selectable project_type_id (PT-UNSPECIFIED sentinel never valid for new/activated projects), owner, revenue, next_action, next_action_date.
- Legacy migrated ACTIVE projects may carry PT-UNSPECIFIED — must stay viewable/operable with an "incomplete context" warning.
- Thai-first UI: Thai labels for moments/industries/project types; internal codes never surface.
- Idempotent create via clientRequestId; same key + different payload = IDEMPOTENCY_CONFLICT.
- No drag-and-drop on the board (explicitly deferred). Stage changes via a controlled menu calling the use case.

WHAT SHIPPED IN STEP 4 (commit a6b717e):
- /opportunities → "06 · Project Pipeline": Kanban board (6 Thai stage columns, ACTIVE only) + DRAFT strip outside the funnel + closed counts; List view sharing the same read model; 12 URL-driven filters; risk badges from domain projectRiskFlags (NO_NEXT_ACTION / OVERDUE_NEXT_ACTION / NO_RECENT_ACTIVITY / STUCK_IN_STAGE / INCOMPLETE_CONTEXT).
- Create Project wizard (4 steps: Context → Commercial → People/Solutions → Next Action) → always creates DRAFT; industry prefills from the account (sub-industry resolves to group+sub); moments listed only from the selected account; PT-UNSPECIFIED absent from options.
- Activate drawer: advisory hints only; server gate errors rendered verbatim (translated labels).
- Server actions are thin gates (writesEnabled → use case → revalidatePath). Static tests forbid UI components from importing repositories/infrastructure.
- Read model: 1 bounded project page (cap 100) + 6 bulk queries + cached masters ≈ 9 queries for both views; no N+1.

REVIEW TASKS — report findings as P0 (broken/unsafe), P1 (must fix before next step), P2 (improvement), each with file/line and a concrete fix:

1. UX: Is the board→card→stage-change→activate loop operationally efficient for a Thai sales team? Any dead ends, unclear states, or missing affordances (e.g., DRAFT discoverability, error recovery in the wizard, backward-stage reason flow)?
2. UI: Visual hierarchy, density, Thai typography/labels, responsive behavior (board is min-w-1200 with overflow scroll), accessibility (contrast, focus, keyboard) — judge from the screenshots.
3. Coding: Review the attached files for
   - business logic leaking into React components (should be none),
   - server-action input handling (they cast to `never` and delegate zod validation to use cases — acceptable or a P1?),
   - idempotency UX correctness (requestId lifecycle on retry/success),
   - state management pitfalls in the wizard (stale context after account switch, race on double submit),
   - anything that breaks when data grows past the 100-project cap.
4. Consistency: Board vs List semantics, Thai label coverage, legacy-project handling.

FILES TO ATTACH:
- app/opportunities/page.tsx
- app/opportunities/actions.ts
- components/projects/create-project-wizard.tsx
- components/projects/activate-button.tsx
- components/projects/stage-menu.tsx
- components/projects/project-card.tsx
- lib/application/projects/get-project-pipeline.ts
- lib/domain/opportunity.ts (reference — canonical rules)

Return format:
P0: …
P1: …
P2: …
UX VERDICT: …
CODE VERDICT: …
