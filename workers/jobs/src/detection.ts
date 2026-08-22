import type { MomentCode } from "../../../lib/domain/moment";
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
): Promise<void> {
  const signals = await db
    .prepare(
      `SELECT id, raw_text FROM moment_signals
       WHERE organization_id = ? AND account_id = ?
         AND id IN (${job.signalIds.map(() => "?").join(", ")})`,
    )
    .bind(job.organizationId, job.accountId, ...job.signalIds)
    .all<{ id: string; raw_text: string | null }>();

  if (signals.results.length === 0) {
    console.log(JSON.stringify({ event: "detect_no_signals", accountId: job.accountId }));
    return;
  }

  const result = detect(signals.results.map((s) => s.raw_text ?? ""));

  // Dedup: one active moment per (account, moment code) — attach evidence to
  // the existing event instead of creating a duplicate.
  const existing = await db
    .prepare(
      `SELECT id FROM moment_events
       WHERE organization_id = ? AND account_id = ? AND moment_code = ?
         AND status IN ('Detected', 'Review', 'Contacted', 'Qualified')`,
    )
    .bind(job.organizationId, job.accountId, result.momentCode)
    .first<{ id: string }>();

  const now = new Date().toISOString();
  let eventId: string;

  if (existing) {
    eventId = existing.id;
  } else {
    eventId = `ME-${crypto.randomUUID()}`;
    // Conservative default score — Customer Solution re-scores at
    // qualification (SOP step 5). Intent is signal-driven.
    await db
      .prepare(
        `INSERT INTO moment_events (
           id, organization_id, account_id, moment_code, sub_moment,
           trigger_source, trigger_detail, detected_at, expected_event_date,
           score_business_fit, score_intent, score_timing, score_wallet, score_relationship,
           potential_wallet_min, potential_wallet_max,
           recommended_action, status, next_expected_moment,
           detection_confidence, detected_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, ?, 10, 5, 5, 0, 0, ?, 'Detected', ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId, job.organizationId, job.accountId, result.momentCode, result.subMoment,
        "Rule Engine", result.reason, now.slice(0, 10), result.expectedEventDate,
        Math.round(result.confidence * 20), // intent /25 scales with confidence
        RULES.find((r) => r.moment === result.momentCode)?.action ?? "Review Moment ใหม่",
        result.momentCode,
        result.confidence, `${DETECTOR}@${DETECTOR_VERSION}`, now, now,
      )
      .run();
  }

  await db
    .prepare(
      `UPDATE moment_signals SET moment_event_id = ?, confidence = ?, model_name = ?, model_version = ?
       WHERE id IN (${job.signalIds.map(() => "?").join(", ")})`,
    )
    .bind(eventId, result.confidence, DETECTOR, DETECTOR_VERSION, ...job.signalIds)
    .run();

  console.log(
    JSON.stringify({
      event: "moment_detected",
      accountId: job.accountId,
      momentCode: result.momentCode,
      confidence: result.confidence,
      eventId,
      deduped: Boolean(existing),
      source: DETECTOR,
    }),
  );
}
