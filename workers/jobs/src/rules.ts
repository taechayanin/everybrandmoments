// Scheduled rule-based moment creation (PRD §38, plan §2.5).
// Idempotent by BUSINESS OCCURRENCE, not by active status (review 🔴 §5):
// each rule computes a dedupe_key identifying the occurrence, and the unique
// index on (organization_id, dedupe_key) makes INSERT OR IGNORE race-safe —
// closing an event early can never resurrect the same occurrence.

import { momentActivityKey } from "../../../lib/domain/activity";

const ORG = "ORG-001";

async function createRuleEvent(
  db: D1Database,
  input: {
    accountId: string;
    momentCode: string;
    subMoment: string;
    detail: string;
    expectedEventDate: string;
    action: string;
    ruleId: string;
    /** Occurrence identity, e.g. RULE-RETURN-180:ORG:ACC:<last_order_date>. */
    dedupeKey: string;
    scores: [number, number, number, number, number];
  },
): Promise<boolean> {
  const now = new Date().toISOString();
  const eventId = `ME-${crypto.randomUUID()}`;
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO moment_events (
         id, organization_id, account_id, moment_code, sub_moment,
         trigger_source, trigger_detail, detected_at, expected_event_date,
         score_business_fit, score_intent, score_timing, score_wallet, score_relationship,
         potential_wallet_min, potential_wallet_max,
         recommended_action, status, next_expected_moment,
         detection_confidence, detected_by, dedupe_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'Rule Engine', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'Detected', ?, 1.0, ?, ?, ?, ?)`,
    )
    .bind(
      eventId, ORG, input.accountId, input.momentCode, input.subMoment,
      input.detail, now.slice(0, 10), input.expectedEventDate,
      ...input.scores,
      input.action, input.momentCode, input.ruleId, input.dedupeKey, now, now,
    )
    .run();
  const created = (res.meta.changes ?? 0) > 0;
  if (created) {
    // System timeline row (Step 5) — only when the occurrence was actually
    // inserted, and keyed by the event id, so a repeated cron run (which
    // skips the event insert) never duplicates the activity either.
    await db
      .prepare(
        `INSERT OR IGNORE INTO activities (
           id, organization_id, account_id, moment_event_id, activity_type,
           title, body, occurred_at, created_at, updated_at, client_request_id
         ) VALUES (?, ?, ?, ?, 'MOMENT_DETECTED', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `ACT-${crypto.randomUUID()}`, ORG, input.accountId, eventId,
        `ตรวจพบ Moment — ${input.momentCode}`, input.subMoment,
        now, now, now, momentActivityKey("DETECTED", eventId),
      )
      .run();
  }
  return created;
}

/** RULE-RETURN-180: no order for ≥180 days → EBM Return (PRD §62). */
export async function scanInactiveAccounts(db: D1Database): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.name, MAX(o.order_date) AS last_order
       FROM accounts a
       JOIN orders_external o ON o.account_id = a.id
       WHERE a.organization_id = ?
       GROUP BY a.id
       HAVING julianday('now') - julianday(MAX(o.order_date)) >= 180`,
    )
    .bind(ORG)
    .all<{ id: string; name: string; last_order: string }>();

  let created = 0;
  for (const r of rows.results) {
    const days = Math.floor(
      (Date.now() - new Date(r.last_order).getTime()) / 86_400_000,
    );
    const made = await createRuleEvent(db, {
      accountId: r.id,
      momentCode: "EBM Return",
      subMoment: `ไม่มี Order มา ${days} วัน`,
      detail: `RULE-RETURN-180: days_since_last_order = ${days} (last: ${r.last_order})`,
      expectedEventDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      action: "สรุปประวัติ + มอบหมาย SDR ทำ Win-back",
      ruleId: "RULE-RETURN-180",
      // Same inactivity spell = same occurrence; a new order resets it.
      dedupeKey: `RULE-RETURN-180:${ORG}:${r.id}:${r.last_order}`,
      scores: [18, 10, 14, 8, 7],
    });
    if (made) created += 1;
  }
  console.log(
    JSON.stringify({ event: "scan_return_180", matched: rows.results.length, created }),
  );
}

/** Anniversary − 60 days from customer_since → EBM Milestone (PRD §38). */
export async function scanAnniversaries(db: D1Database): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT id, name, customer_since FROM accounts
       WHERE organization_id = ? AND customer_since IS NOT NULL`,
    )
    .bind(ORG)
    .all<{ id: string; name: string; customer_since: string }>();

  const today = new Date();
  let created = 0;

  for (const r of rows.results) {
    const since = new Date(r.customer_since);
    // Next anniversary of the relationship start date.
    const anniversary = new Date(
      Date.UTC(today.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()),
    );
    if (anniversary.getTime() < today.getTime()) {
      anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    }
    const daysUntil = Math.round(
      (anniversary.getTime() - today.getTime()) / 86_400_000,
    );
    if (daysUntil > 60) continue;

    const years = anniversary.getUTCFullYear() - since.getUTCFullYear();
    const made = await createRuleEvent(db, {
      accountId: r.id,
      momentCode: "EBM Milestone",
      subMoment: `ครบรอบ ${years} ปี ความสัมพันธ์กับ EBM`,
      detail: `Anniversary Automation: customer_since ${r.customer_since} (T-${daysUntil})`,
      expectedEventDate: anniversary.toISOString().slice(0, 10),
      action: "เสนอ Anniversary Set + มอบหมาย Account Owner",
      ruleId: "RULE-ANNIVERSARY-60",
      // One moment per anniversary year, even if closed early in the window.
      dedupeKey: `RULE-ANNIVERSARY:${ORG}:${r.id}:${anniversary.getUTCFullYear()}`,
      scores: [18, 8, 15, 8, 9],
    });
    if (made) created += 1;
  }
  console.log(
    JSON.stringify({ event: "scan_anniversary", scanned: rows.results.length, created }),
  );
}
