import { ACTIVE_MOMENT_STATUSES, type MomentCode } from "../../../lib/domain/moment";
import { momentActivityKey } from "../../../lib/domain/activity";
import { signalOccurrenceKey } from "../../../lib/jobs/occurrence";
import { detectWithAI, type AiDetectorEnv } from "./ai-detection";
import {
  DetectionResultSchema,
  type DetectMomentJob,
  type DetectionResult,
} from "../../../lib/jobs/contracts";

// Level 2 rule-based detection (PRD §12). Sprint 6 swaps the `detect`
// implementation for an LLM call — the validated DetectionResult contract and
// the evidence trail stay identical (plan §40–41).

const DETECTOR = "RULE-KEYWORD-L2";
const DETECTOR_VERSION = "1.0.0";

interface KeywordRule {
  moment: MomentCode;
  subMoment: string;
  pattern: RegExp;
  confidence: number;
  action: string;
}

const RULES: KeywordRule[] = [
  {
    moment: "EBM Expand",
    subMoment: "สัญญาณขยายสาขา / พื้นที่ใหม่",
    pattern: /สาขา(ใหม่)?|branch|coming soon|franchise|ขยาย/i,
    confidence: 0.8,
    action: "Qualify แผนขยายสาขา + เตรียม Branch Package",
  },
  {
    moment: "EBM Hire",
    subMoment: "สัญญาณรับพนักงานใหม่",
    pattern: /รับสมัคร|ตำแหน่ง|hiring|recruit|พนักงานใหม่/i,
    confidence: 0.75,
    action: "เสนอ Uniform + Welcome Kit ก่อนวันเริ่มงาน",
  },
  {
    moment: "EBM Recover",
    subMoment: "สัญญาณ Complaint / ปัญหา",
    pattern: /complaint|ร้องเรียน|ล่าช้า|เสียหาย|ไม่พอใจ/i,
    confidence: 0.85,
    action: "Customer Success ติดต่อทันที + Recovery Gesture",
  },
  {
    moment: "EBM Milestone",
    subMoment: "สัญญาณครบรอบ / ความสำเร็จ",
    pattern: /ครบรอบ|anniversary|milestone|รางวัล/i,
    confidence: 0.75,
    action: "เสนอ Anniversary Celebration Set",
  },
  {
    moment: "EBM Launch",
    subMoment: "สัญญาณเปิดตัวสินค้า / ร้าน",
    pattern: /เปิดตัว|launch|grand opening|แคมเปญใหม่/i,
    confidence: 0.75,
    action: "เสนอ Grand Opening Kit",
  },
  {
    moment: "EBM Change",
    subMoment: "สัญญาณ Rebrand / เปลี่ยนแปลงองค์กร",
    pattern: /rebrand|ย้าย(สำนักงาน|ออฟฟิศ)|ผู้บริหารใหม่|ceo ใหม่|ปรับโครงสร้าง/i,
    confidence: 0.7,
    action: "เสนอ Rebrand Rollout Package",
  },
];

export function detect(rawTexts: string[]): DetectionResult {
  const joined = rawTexts.join("\n");
  const matched = RULES.filter((r) => r.pattern.test(joined));
  const expected = new Date(Date.now() + 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  if (matched.length === 0) {
    return DetectionResultSchema.parse({
      momentCode: "EBM Engage",
      subMoment: "Signal ใหม่ — ยังจับ Moment ไม่ได้ชัด",
      confidence: 0.4,
      expectedEventDate: expected,
      reason: "No keyword rule matched; needs human review",
      recommendedSolutionIds: [],
    });
  }

  // Highest-confidence rule wins; extra matches raise confidence slightly.
  const best = matched.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  const confidence = Math.min(best.confidence + (matched.length - 1) * 0.05, 0.95);
  return DetectionResultSchema.parse({
    momentCode: best.moment,
    subMoment: best.subMoment,
    confidence,
    expectedEventDate: expected,
    reason: `Matched rules: ${matched.map((m) => m.moment).join(", ")}`,
    recommendedSolutionIds: [],
  });
}

export async function detectMomentFromSignals(
  db: D1Database,
  job: DetectMomentJob,
  env: AiDetectorEnv = {},
): Promise<void> {
  const signals = await db
    .prepare(
      `SELECT id, source_type, raw_text FROM moment_signals
       WHERE organization_id = ? AND account_id = ?
         AND id IN (${job.signalIds.map(() => "?").join(", ")})`,
    )
    .bind(job.organizationId, job.accountId, ...job.signalIds)
    .all<{ id: string; source_type: string; raw_text: string | null }>();

  if (signals.results.length === 0) {
    console.log(JSON.stringify({ event: "detect_no_signals", accountId: job.accountId }));
    return;
  }

  // Only IDs that passed the org/account-scoped SELECT may be written to —
  // never trust job.signalIds beyond the lookup (review 🔴 §3).
  const validSignalIds = signals.results.map((s) => s.id);

  // Level 3 (AI) when an API key is configured; Level 2 keyword rules
  // otherwise. AI refusal/invalid output falls back to rules; transient AI
  // errors throw so the queue retries (review 🟡 §1).
  const aiOutcome = await detectWithAI(
    env,
    signals.results.map((s) => ({
      sourceType: s.source_type,
      rawText: s.raw_text ?? "",
    })),
  );
  if (aiOutcome.type === "retry") throw aiOutcome.error;

  const aiResult = aiOutcome.type === "success" ? aiOutcome.result : null;
  const result = aiResult ?? detect(signals.results.map((s) => s.raw_text ?? ""));
  const detectorName = aiOutcome.type === "success" ? aiOutcome.model : DETECTOR;
  const detectorVersion =
    aiOutcome.type === "success" ? "structured-output" : DETECTOR_VERSION;

  // Keep only AI-recommended solutions that exist in the catalog (review 🟡 §2).
  let solutionIds: string[] = [];
  if (result.recommendedSolutionIds.length > 0) {
    const found = await db
      .prepare(
        `SELECT id FROM solutions
         WHERE organization_id = ? AND active = 1
           AND id IN (${result.recommendedSolutionIds.map(() => "?").join(", ")})`,
      )
      .bind(job.organizationId, ...result.recommendedSolutionIds)
      .all<{ id: string }>();
    solutionIds = found.results.map((r) => r.id);
  }

  const now = new Date().toISOString();
  // TECHNICAL IDEMPOTENCY (review P1): the key is derived from the actual
  // evidence — sorted signal ids — so a redelivered queue message or a
  // concurrent worker with the same signal group resolves to the same key,
  // while a *different* signal group next year is free to open a new moment.
  const dedupeKey = await signalOccurrenceKey(
    job.organizationId,
    job.accountId,
    result.momentCode,
    validSignalIds,
  );

  let finalEventId: string;
  let dedupReason: "none" | "idempotent_replay" | "active_moment" = "none";

  // 1) Same evidence already produced a moment (retry / duplicate delivery).
  const byKey = await db
    .prepare(
      "SELECT id FROM moment_events WHERE organization_id = ? AND dedupe_key = ?",
    )
    .bind(job.organizationId, dedupeKey)
    .first<{ id: string }>();

  if (byKey) {
    finalEventId = byKey.id;
    dedupReason = "idempotent_replay";
  } else {
    // 2) BUSINESS DEDUP (application logic, not a DB constraint): while a
    // moment of this type is still ACTIVE for the account, new evidence
    // attaches to it instead of opening a parallel moment. Once it closes,
    // future occurrences create fresh moments.
    const active = await db
      .prepare(
        `SELECT id FROM moment_events
         WHERE organization_id = ? AND account_id = ? AND moment_code = ?
           AND status IN (${ACTIVE_MOMENT_STATUSES.map(() => "?").join(", ")})
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(job.organizationId, job.accountId, result.momentCode, ...ACTIVE_MOMENT_STATUSES)
      .first<{ id: string }>();

    if (active) {
      finalEventId = active.id;
      dedupReason = "active_moment";
    } else {
      // 3) New occurrence — insert. OR IGNORE + the unique index on
      // (organization_id, dedupe_key) makes the concurrent-worker race safe;
      // whichever insert wins, the read-back below returns the survivor.
      const eventId = `ME-${crypto.randomUUID()}`;
      await db
        .prepare(
          `INSERT OR IGNORE INTO moment_events (
             id, organization_id, account_id, moment_code, sub_moment,
             trigger_source, trigger_detail, detected_at, expected_event_date,
             score_business_fit, score_intent, score_timing, score_wallet, score_relationship,
             potential_wallet_min, potential_wallet_max,
             recommended_action, status, next_expected_moment,
             detection_confidence, detected_by, dedupe_key, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, ?, 10, 5, 5, 0, 0, ?, 'Detected', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          eventId, job.organizationId, job.accountId, result.momentCode, result.subMoment,
          "Rule Engine", result.reason, now.slice(0, 10), result.expectedEventDate,
          Math.round(result.confidence * 20), // intent /25 scales with confidence
          RULES.find((r) => r.moment === result.momentCode)?.action ?? "Review Moment ใหม่",
          result.momentCode,
          result.confidence, `${detectorName}@${detectorVersion}`, dedupeKey, now, now,
        )
        .run();

      const survivor = await db
        .prepare(
          "SELECT id FROM moment_events WHERE organization_id = ? AND dedupe_key = ?",
        )
        .bind(job.organizationId, dedupeKey)
        .first<{ id: string }>();
      if (!survivor) throw new Error("Moment insert failed: no survivor for dedupe key");
      finalEventId = survivor.id;
      if (finalEventId !== eventId) dedupReason = "idempotent_replay";
    }
  }
  const deduped = dedupReason !== "none";

  // Attach evidence + persist validated AI solution recommendations + mark
  // signals processed + system timeline row — one atomic batch, all
  // org/account scoped. The MOMENT_DETECTED activity is keyed by the moment
  // event id, so redelivery / extra evidence on the same event writes nothing
  // (Step 5; created_by NULL = system actor).
  const followUps = [
    db
      .prepare(
        `INSERT OR IGNORE INTO activities (
           id, organization_id, account_id, moment_event_id, activity_type,
           title, body, occurred_at, created_at, updated_at, client_request_id
         ) VALUES (?, ?, ?, ?, 'MOMENT_DETECTED', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `ACT-${crypto.randomUUID()}`, job.organizationId, job.accountId,
        finalEventId, `ตรวจพบ Moment — ${result.momentCode}`, result.subMoment,
        now, now, now, momentActivityKey("DETECTED", finalEventId),
      ),
    db
      .prepare(
        `UPDATE moment_signals
         SET moment_event_id = ?, confidence = ?, model_name = ?, model_version = ?,
             processing_status = 'processed'
         WHERE organization_id = ? AND account_id = ?
           AND id IN (${validSignalIds.map(() => "?").join(", ")})`,
      )
      .bind(
        finalEventId, result.confidence, detectorName, detectorVersion,
        job.organizationId, job.accountId, ...validSignalIds,
      ),
    ...solutionIds.map((sid) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO moment_event_solutions (moment_event_id, solution_id) VALUES (?, ?)",
        )
        .bind(finalEventId, sid),
    ),
  ];
  await db.batch(followUps);

  console.log(
    JSON.stringify({
      event: "moment_detected",
      accountId: job.accountId,
      momentCode: result.momentCode,
      confidence: result.confidence,
      eventId: finalEventId,
      deduped,
      dedupReason,
      solutionsAttached: solutionIds.length,
      source: detectorName,
    }),
  );
}
