# Claude Code Development Workflow
## Moment OS — Plan → Review → Implement → Review → Proceed

**Purpose:** ใช้เป็นมาตรฐานการพัฒนา Moment OS เพื่อควบคุม Architecture, Code Quality, UX, Security และลดความเสี่ยงจากการให้ AI implement งานยาวเกินไปในครั้งเดียว

---

# 1. Core Principle

Claude Code ห้าม implement งานใหญ่ทั้งหมดรวดเดียว

ทุก Feature ต้องผ่าน Review Gate ตามลำดับ:

```text
Architecture / PRD / Figma
        ↓
Claude Code อ่าน Existing Code
        ↓
สร้าง IMPLEMENTATION_PLAN.md
        ↓
STOP
        ↓
ส่ง Plan ให้ Reviewer
        ↓
Audit / Feedback
        ↓
แก้ Plan ถ้าจำเป็น
        ↓
PLAN APPROVED
        ↓
Implement STEP 1 ONLY
        ↓
Run Tests / Typecheck / Lint
        ↓
สร้าง REVIEW_PACKET.md
        ↓
STOP
        ↓
ส่ง Commit + Review Packet ให้ Reviewer
        ↓
Code / Architecture / UX Review
        ↓
ถ้ามี P0 / P1 → Fix
        ↓
REVIEW APPROVED — PROCEED
        ↓
เริ่ม Step ต่อไป
```

---

# 2. PLAN GATE

ก่อนเขียน Code ทุก Feature ให้ Claude Code:

1. อ่าน Architecture
2. อ่าน PRD
3. อ่าน Figma / UX Requirement
4. Inspect Existing Code
5. อ่าน Migration / Repository / Use Case ที่เกี่ยวข้อง
6. สร้าง `IMPLEMENTATION_PLAN.md`
7. **STOP — ห้ามเขียน Code**

---

# 3. IMPLEMENTATION_PLAN.md ต้องมี

```text
# IMPLEMENTATION PLAN

## Goal
Feature นี้ต้องแก้ปัญหาอะไร

## Non-Goals
อะไรที่ Sprint นี้จะไม่ทำ

## Existing Architecture
ส่วนของระบบปัจจุบันที่เกี่ยวข้อง

## Current Problems
สิ่งที่ต้องแก้ / limitation ปัจจุบัน

## Proposed Architecture
Architecture หลังแก้

## Files to Change
ไฟล์ที่จะสร้าง / แก้

## Data Model
Table / Field / Relation ที่จะเพิ่มหรือแก้

## Migration Plan
Migration ที่ต้องสร้าง

## Repository Changes
Interface / Adapter ที่ต้องเปลี่ยน

## Application Use Cases
Use cases ใหม่หรือที่ต้อง refactor

## UI / UX Changes
หน้าจอ / component / workflow ที่เกี่ยวข้อง

## API / Server Actions
Endpoint / server action ที่ต้องเพิ่มหรือแก้

## Queue / Cron / AI Impact
ถ้ามี

## Security
Auth
Organization scope
Permissions
Validation

## Performance
Query pattern
Pagination
Caching
N+1 risk

## Tests
Tests ที่จะเพิ่ม

## Risks
สิ่งที่อาจพัง

## Implementation Steps
Step 1
Step 2
Step 3
...

## Open Questions
สิ่งที่ Claude ยังไม่แน่ใจ
```

หลังสร้าง Plan:

> **STOP และรอ Review**

ห้าม implement เองต่อทันที

---

# 4. PLAN REVIEW

Reviewer จะจัด Feedback เป็น:

## 🔴 P0 — Blocker

ตัวอย่าง:

- Security vulnerability
- Data corruption risk
- Wrong architecture
- Migration unsafe
- Cross-organization leak
- Race condition / idempotency issue

ต้องแก้ก่อนเริ่ม implementation

---

## 🟡 P1 — Must Fix

ตัวอย่าง:

- Wrong abstraction
- N+1 query
- Missing test
- UX flow ไม่ถูก
- Type safety ต่ำ
- Poor repository boundary

ควรแก้ก่อน implement Step แรก

---

## 🟢 P2 — Improvement

สามารถเก็บไว้ Backlog ได้หากไม่กระทบ architecture หลัก

---

เมื่อ Plan ผ่าน Reviewer ต้องมีข้อความ:

# `PLAN APPROVED — IMPLEMENT STEP 1 ONLY`

จากนั้น Claude Code จึงเริ่มเขียน Code

---

# 5. IMPLEMENTATION GATE

Claude Code ต้องทำ **ทีละ Step เท่านั้น**

ตัวอย่าง:

```text
PLAN

Step 1 — Database + Domain
Step 2 — Repository + Use Cases
Step 3 — UI
Step 4 — AI Integration
Step 5 — Analytics
```

ถ้าได้รับอนุมัติ:

> `IMPLEMENT STEP 1 ONLY`

Claude ต้องทำเฉพาะ Step 1

ห้ามทำ Step 2–5 ล่วงหน้า

---

# 6. Scope Change Rule

ถ้าระหว่าง implement Claude พบว่า:

- ต้องเปลี่ยน Architecture
- ต้องเพิ่ม Migration ใหม่ที่ไม่ได้อยู่ใน Plan
- ต้องเปลี่ยน Scope
- ต้องแก้ Module ใหญ่ที่ไม่เคยระบุ
- Requirement มี conflict
- Figma กับ Architecture ไม่ตรงกัน

ให้:

```text
STOP
↓
REPORT SCOPE CHANGE
↓
อธิบายเหตุผล
↓
เสนอ Plan ใหม่
↓
รอ Approval
```

ห้ามตัดสินใจขยาย Scope เอง

---

# 7. หลัง Implement แต่ละ Step

Claude Code ต้องรันอย่างน้อย:

```text
Tests
Typecheck
Lint
Build (ถ้าเหมาะสม)
```

จากนั้นสร้าง:

# `REVIEW_PACKET.md`

แล้ว **STOP**

---

# 8. REVIEW_PACKET.md Template

```text
# REVIEW PACKET

## Step
Step X — ...

## Goal
...

## Commit
<commit hash>

## Files Changed
- ...

## Architecture Changes
...

## Database / Migration
...

## Repository / Use Case Changes
...

## API / Server Actions
...

## UI / UX
...

## Figma Comparison
Matched:
Differences:
Reason:

## Security
Authentication:
Organization Scope:
Permissions:
Validation:
Write Gate:

## Performance
Query Count:
Pagination:
N+1:
Caching:
Known Risks:

## Tests Added
- ...

## Test Results
X / X passing

## Typecheck
PASS / FAIL

## Lint
PASS / FAIL

## Build
PASS / FAIL

## Known Limitations
...

## Decisions / Trade-offs
...

## Things Reviewer Should Check Carefully
1.
2.
3.

## Next Proposed Step
Step X+1 — ...
```

---

# 9. Commit Rule

ใช้หลัก:

> **1 Step = 1 Logical Commit**

ไม่รวมหลาย Feature ลง Commit เดียว

ตัวอย่าง:

```text
feat(crm): add activity domain and migration

feat(crm): add activity repository and use cases

feat(crm): add account activity timeline
```

ทำให้ Review และ Rollback ง่าย

---

# 10. REVIEW GATE

หลัง Claude Code ส่ง:

```text
Commit Hash
+
REVIEW_PACKET.md
```

Reviewer ต้องตรวจ:

- Code
- Architecture
- Data Model
- Migration
- Repository
- Security
- Performance
- UX / Figma
- Tests

---

# 11. Review Severity

## 🔴 P0

ห้ามไป Step ต่อไป

Examples:

```text
Security hole
Cross-org data leak
Data corruption
Unsafe migration
Race condition
Broken idempotency
Production-breaking issue
```

---

## 🟡 P1

ต้องแก้ก่อน Step ต่อไป

Examples:

```text
N+1 query
Wrong abstraction
Missing validation
Missing test
Poor UX workflow
Type safety issue
Incorrect repository usage
```

---

## 🟢 P2

ไม่ Block Step ต่อไป

Examples:

```text
Naming
Code cleanup
Minor UX polish
Observability enhancement
Future optimization
```

---

# 12. ถ้ามี P0 / P1

Workflow:

```text
Reviewer Feedback
        ↓
Claude Code รับ Fix Prompt
        ↓
Fix เฉพาะ Review Findings
        ↓
Run Tests
        ↓
New Commit
        ↓
Update REVIEW_PACKET.md
        ↓
STOP
        ↓
Reviewer ตรวจใหม่
```

ห้ามเริ่ม Step ต่อไปก่อน Review ผ่าน

---

# 13. Approval Message

เมื่อ Step ผ่านทั้งหมด Reviewer ต้องระบุ:

# `REVIEW APPROVED — PROCEED`

Claude Code จึงเริ่ม Step ถัดไป

---

# 14. Feature Completion Gate

แม้ทุก Step ผ่านแล้ว:

> **ห้าม Deploy ทันที**

ต้องสร้าง:

# `PRE_DEPLOY_PACKET.md`

---

# 15. PRE_DEPLOY_PACKET.md

ต้องมี:

```text
# PRE-DEPLOY PACKET

## Feature
...

## Commits
- ...
- ...

## Final Architecture
...

## Migrations
...

## Security Review
...

## Organization / Tenant Review
...

## Queue / Cron / AI Review
...

## Performance
Before:
After:

## UX / Figma Review
...

## End-to-End Tests
...

## Regression Tests
...

## Typecheck
PASS

## Lint
PASS

## Build
PASS

## Known Limitations
...

## Rollback Plan
...

## Remaining Risks
...

## Deployment Recommendation
INTERNAL PILOT:
PUBLIC PRODUCTION:
```

แล้ว:

> **STOP**

---

# 16. RELEASE GATE

```text
Feature Complete
      ↓
PRE_DEPLOY_PACKET.md
      ↓
STOP
      ↓
Final Reviewer Audit
      ↓
┌──────────────┬──────────────┐
│              │              │
NO-GO         GO
│              │
FIX       DEPLOY APPROVED
```

Claude Code ห้าม Deploy จนกว่าจะได้รับข้อความ:

# `DEPLOY APPROVED`

---

# 17. Mandatory Rules

## Rule 1

**Claude Code ห้าม Deploy เอง**

เว้นแต่ได้รับคำสั่ง deploy โดยตรงหลัง Final Review

---

## Rule 2

**Claude Code ห้าม implement หลังสร้าง Plan**

Plan ต้องถูก Review ก่อน

---

## Rule 3

**Implement ทีละ Step**

ห้ามทำหลาย Steps ล่วงหน้า

---

## Rule 4

**1 Step = 1 Logical Commit**

---

## Rule 5

**Architecture ที่ Approved แล้วห้ามเปลี่ยนเอง**

ถ้าต้องเปลี่ยน → STOP + Report

---

## Rule 6

**Migration ต้องถูก Review ก่อน Run Remote Production DB**

---

## Rule 7

**Tests เดิมห้ามถูกลบหรืออ่อนลงเพื่อให้ Suite ผ่าน**

---

## Rule 8

**ต้องรักษา Layered Architecture**

Moment OS:

```text
UI
↓
Application Use Cases
↓
Repository Interfaces
↓
Infrastructure Adapters
↓
D1 / External Services
```

UI ห้ามเขียน D1 โดยตรง

---

## Rule 9

ทุก Query ต้องคำนึงถึง:

```text
organization_id
auth
permissions
validation
pagination
N+1
D1 bind limits
```

---

## Rule 10

AI ต้องเป็น Enrichment Layer

Core CRM / Transaction data ห้ามขึ้นกับ AI availability

Correct:

```text
Save Data
↓
Success
↓
Queue AI Job
```

Not:

```text
Wait AI
↓
Save Data
```

---

# 18. Moment OS Review Areas

ทุก Review ต้องตรวจอย่างน้อย:

## Architecture
- Layer boundaries
- Domain separation
- Repository usage

## Security
- Authentication
- Authorization
- Organization scope
- Cross-org access

## Database
- Migration safety
- FK
- Unique constraints
- Idempotency
- Indexes

## Queue / Cron
- Retry
- ACK
- DLQ
- Race
- Dedup

## AI
- Input trust
- JSON validation
- Failure behavior
- Cost
- Human verification

## Performance
- N+1
- Pagination
- Query count
- D1 limits
- Cache

## UX
- Figma match
- User workflow
- Loading states
- Error states
- Mobile

## Quality
- Tests
- Type safety
- Lint
- Build

---

# 19. Full Workflow

```text
PRODUCT / FEATURE REQUEST
        ↓
Architecture + PRD + Figma
        ↓
Claude Code
        ↓
Inspect Existing Code
        ↓
IMPLEMENTATION_PLAN.md
        ↓
STOP
        ↓
Reviewer Audit
        ↓
P0/P1?
   ┌────┴────┐
  YES        NO
   ↓          ↓
Fix Plan   PLAN APPROVED
   │          │
   └────┬─────┘
        ↓
IMPLEMENT STEP 1 ONLY
        ↓
Claude Code
        ↓
Run Tests
        ↓
Typecheck / Lint / Build
        ↓
REVIEW_PACKET.md
        ↓
STOP
        ↓
Reviewer Review
        ↓
P0 / P1?
   ┌────┴────┐
  YES        NO
   ↓          ↓
Fix Code   REVIEW APPROVED
   │          │
   └────┬─────┘
        ↓
IMPLEMENT NEXT STEP
        ↓
...
        ↓
FEATURE COMPLETE
        ↓
PRE_DEPLOY_PACKET.md
        ↓
STOP
        ↓
FINAL REVIEW
        ↓
   ┌────┴────┐
 NO-GO       GO
   ↓          ↓
  FIX    DEPLOY APPROVED
```

---

# 20. Default Instruction to Claude Code

Use this process for every new Moment OS feature.

> **Do not implement immediately.**
>
> First inspect the current repository, Architecture, PRD and Figma.
>
> Create `IMPLEMENTATION_PLAN.md`.
>
> Then STOP.
>
> Do not modify production code until the Plan has been reviewed and explicitly approved.
>
> After approval, implement only the specific Step requested.
>
> Run tests, typecheck, lint and build.
>
> Create `REVIEW_PACKET.md`.
>
> Then STOP again.
>
> Do not begin the next Step until receiving:
>
> `REVIEW APPROVED — PROCEED`
>
> Do not deploy automatically.
>
> Final deployment requires:
>
> `DEPLOY APPROVED`

---

# Final Principle

The objective is not to make Claude Code write as much code as possible.

The objective is:

> **Small change → Reviewable change → Verified change → Safe progress**

For Moment OS, every Feature must protect:

```text
Architecture
Data Integrity
Customer Data
Security
Performance
UX
AI Reliability
```

ก่อนเริ่ม Step ต่อไปเสมอ
