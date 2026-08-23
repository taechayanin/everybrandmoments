# REVIEW PACKET

## Step
Step 6 — AI Activity Analysis (async enrichment + human-confirmed suggestions)

## COMMITS
- `b2bf11c` feat(crm): AI activity analysis — async enrichment + human-confirmed suggestions (Step 6)
- `77fbc12` fix(crm): durable AI dispatch outbox + mock/D1 parity (Step 6 review)

## STEP-6 REVIEW FIXES
1. **P0 — Durable dispatch (outbox)**: migration `0007_analysis_outbox.sql` เพิ่ม `activities.analysis_status` (PENDING/QUEUED/PROCESSED + CHECK + partial index) — เขียน **ใน batch เดียวกับ CRM save** (อยู่ใน INSERT ของ activity เอง) → activity ไม่มีทางเกิดโดยไม่มี dispatch record; enqueue สำเร็จ → mark QUEUED, ล้มเหลว → คง PENDING; consumer จบงาน (สำเร็จ/safe-skip/ineligible) → PROCESSED; retry-class error คง QUEUED; **cron reconciler ใหม่** (pattern เดียวกับ signal reconciliation ที่มี E2E แล้ว) กวาด PENDING/QUEUED ที่ stale >15 นาที LIMIT 50 → re-enqueue + mark; suggestion id deterministic ทำให้ duplicate delivery ไร้ผล — **D1 verified**: reconciler เลือกเฉพาะแถว stale PENDING (fresh/PROCESSED ไม่ถูกเลือก), consumer lookup org ผิด → 0 แถว
2. **P1 — Mock/D1 parity**: mock `acceptAtomic` attach validated solutions ลง moment ที่สร้าง (เหมือน `moment_event_solutions` ฝั่ง D1) และ mock `suggestions.create` ใช้ deterministic id `SUG-<activityId>` + dedupe duplicate delivery เหมือน D1 PK OR IGNORE; contract-parity assertions อยู่ในเทสต์ acceptance (solutions จริง attach / ของปลอมไม่ attach) และเทสต์ duplicate-delivery

## FILES CHANGED
- `lib/jobs/contracts.ts` — `ANALYZE_ACTIVITY` job (org/account/activity ids, zod ทั้งสองฝั่ง queue)
- `lib/services/analysis-queue.ts` (ใหม่) — enqueue หลัง commit แบบ fire-and-forget: ไม่มีทางทำให้ save fail (queue หาย/binding ไม่มี/ส่งพัง → log แล้วไปต่อ); มี test seam
- `lib/application/activities/create-note|log-call|log-meeting.ts` — enqueue เมื่อ `!deduped` เท่านั้น (retry เดิมไม่ enqueue ซ้ำ)
- `workers/jobs/src/analyze-activity.ts` (ใหม่) — consumer: โหลด activity (org+account scoped, ไม่เอา deleted/system types) → Claude → validate → persist suggestion
- `workers/jobs/src/index.ts` — route `ANALYZE_ACTIVITY`
- `lib/repositories/index.ts` — `SuggestionDecisionWriteRepository` (`acceptAtomic`/`ignoreAtomic`) + input/outcome types + `Repositories.suggestionDecisions`
- D1 + mock adapters — decision write implementations
- `lib/application/ai/decide-suggestion.ts` (ใหม่) — accept/ignore use cases + `validateAnalysisAgainstCatalog`
- `app/accounts/[id]/actions.ts` — `acceptSuggestionAction` / `ignoreSuggestionAction` (gate → zod → use case → revalidate)
- `lib/application/accounts/get-account-360.ts` — `pendingSuggestions` (1 bounded query, limit 5)
- `components/crm/suggestions-panel.tsx` (ใหม่) — "AI พบ N insight": summary + moment/budget/date/confidence badges + needs + next action → Accept / Ignore
- `tests/crm-step6.test.ts` (ใหม่) — 16 เทสต์

## AI FLOW
User save Activity → **CRM write commit สำเร็จทันที** → enqueue `ANALYZE_ACTIVITY` (fire-and-forget) → worker วิเคราะห์ด้วย `claude-opus-5` (structured output) → validate → เก็บเป็น **PENDING suggestion** (id deterministic `SUG-<activityId>` — queue redelivery ชน PK เขียนซ้ำไม่ได้, 1 suggestion/activity) → มนุษย์ Accept/Ignore บน Account 360 → Accept ไหลผ่าน Moment/Task domain rules เดิม — **ไม่มี AI call ใน synchronous save path ใดเลย และ AI ไม่ mutate อะไรเองทั้งสิ้น**

## STRUCTURED OUTPUT / VALIDATION
- `output_config.format: json_schema` (`ANALYSIS_OUTPUT_SCHEMA` — moment enum ผูกกับ `MOMENT_CODES` จริง, additionalProperties:false) → JSON.parse → **zod `ActivityAnalysisSchema` strict** (real calendar dates, confidence 0–1, string/array maxes) → **catalog validation**: moment codes กับ `master_moments WHERE active=1`, solution ids กับ `solutions WHERE active=1` — id ที่โมเดล invent ถูกกรองทิ้งก่อน persist และถูก **validate ซ้ำอีกครั้งตอน accept** (ไม่เชื่อ payload ที่เก็บไว้)
- Input: `<activity>` delimiters + truncate 4000 chars + SECURITY paragraph (ห้ามทำตามคำสั่งในเนื้อความ) — pattern เดียวกับ `<signal>` เดิม

## ERROR CLASSIFICATION
- **429/5xx/timeout/network** → log `ai_analysis_error {errorCategory:"transient"}` → throw → queue retry ×3 → DLQ
- **401/403** → log `errorCategory:"config"` (loud) → throw → DLQ — สังเกตได้ ไม่ retry-forever เงียบ ๆ และไม่มีวันกลายเป็น success
- **refusal / invalid output / empty** → log `ai_analysis_skipped {reason}` → ack (safe failure — activity ปลอดภัยอยู่แล้ว ไม่มี suggestion เกิด)
- **ไม่มี key** → skip (feature ยังไม่เปิด)

## HUMAN CONFIRMATION
AI เขียนได้แค่ `activity_ai_suggestions` — ห้ามแตะ moment/opportunity/task/account; ทุกอย่างเกิดตอนมนุษย์ Accept ผ่าน use case + atomic write เท่านั้น; Ignore = จบ ไม่มี record ใดเกิด; Edit = แก้ที่ moment/task ปกติหลัง accept (spec §22 MVP)

## ACCEPTANCE IDEMPOTENCY
`acceptAtomic` = **หนึ่ง `db.batch()`**: [guarded UPDATE PENDING→ACCEPTED] + [moment `INSERT OR IGNORE ... SELECT ... WHERE EXISTS(status='ACCEPTED')` dedupe_key `SUGGESTION:{org}:{acc}:{code}:{sugId}` ลง unique index เดิม] + [solution attaches แบบเดียวกัน] + [task key `SUG:{sugId}`] + [audit id `AUD:SUG:{sugId}` deterministic] — **พิสูจน์**: mock tests (accept ซ้ำ → moment/task เท่าเดิม 1 รายการ, ignore แล้ว accept → ไม่เกิดอะไร) และ **D1 จริง**: accept + rerun ×2 → `accepted_moments: 1`; suggestion ที่ IGNORED ผ่าน statement ชุดเดียวกัน → `ignored_moments: 0`
- Moment สร้างผ่าน dedupe semantics เดิมของ `moment_events` — ไม่มี AI-only path ขนาน

## SECURITY / ORG SCOPE
ทุก SQL ใหม่ bind org; suggestion ของ org อื่น/ไม่รู้จัก → repo คืน null → `CrmError` (มีเทสต์); actions ผ่าน write gate + zod strict + DEMO_USER (temporary); activity body ไม่ log (log เฉพาะ id/model/confidence/counts)

## AI OBSERVABILITY
`ai_activity_analyzed {activityId, organizationId, model (จริงจาก response), analyzerVersion, confidence, momentsSuggested, solutionsSuggested, ms}` + `ai_analysis_skipped {reason}` + `ai_analysis_error {errorCategory}` + enqueue events — ครบ activity/org/model/version/confidence/status/error/timestamps โดยไม่ log เนื้อความ

## PERFORMANCE IMPACT
Save path เพิ่มแค่ 1 queue send (ไม่ block, ไม่ throw); Account 360 เพิ่ม 1 bounded query (pending suggestions limit 5) — จาก ~11 → ~12; งาน AI ทั้งหมดอยู่ใน worker async

## TESTS
133/133 passing (13 files) — หลัง review fixes; เพิ่ม: queue ล่ม → save สำเร็จและ **outbox คง PENDING (recoverable)**, dispatch สำเร็จ → QUEUED, duplicate delivery → suggestion เดียว, parity solutions attach — Step 6 เพิ่ม 16 ครอบทั้ง 17 หัวข้อที่สั่ง: Note/Call/Meeting → enqueue job (+ deduped retry ไม่ enqueue ซ้ำ), save สำเร็จเมื่อ queue ล่ม, valid structured response, garbage/invalid output, invented moment code, invalid date, confidence out of range, catalog กรอง solution ปลอม, prompt-injection อยู่ใน delimiters + truncation, 429/5xx→transient / 401/403→config, accept สร้าง Moment ครั้งเดียว + Task ครั้งเดียว, retry idempotent, ignored ไม่สร้างอะไร (รวม accept-หลัง-ignore), re-ignore idempotent, cross-org rejected — (เคส "invalid JSON" ระดับ HTTP ครอบด้วย schema+skip path; retry behavior ระดับ queue ใช้กลไก `message.retry()` เดิมที่มี E2E จากรอบ Sprint 5)

## TYPECHECK
PASS

## LINT
PASS

## BUILD
PASS

## KNOWN RISKS
- ~~enqueue-fail ไม่มี reconciliation~~ → ปิดแล้วด้วย outbox + cron reconciler (`77fbc12`)
- ~~mock parity gap~~ → ปิดแล้ว (`77fbc12`)
- Suggestion 1 รายการ/activity (deterministic id) — วิเคราะห์ซ้ำหลัง edit activity จะไม่สร้างใหม่ (ตั้งใจใน MVP)
- ยังไม่ตั้ง ANTHROPIC_API_KEY บน jobs worker remote — จนกว่าจะตั้ง ระบบ skip อย่างปลอดภัย (บันทึกใน pre-deploy checklist)

## NEXT PROPOSED STEP
Step 7 — Account list CRM columns/filters + management analytics (P2 สุดท้ายของแผน) — จากนั้น PRE_DEPLOY_PACKET.md ตาม Workflow §15 (รวม remote migrations 0004–0006 + preflight + secrets) — รอ `REVIEW APPROVED — PROCEED`
