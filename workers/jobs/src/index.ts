import { JobSchema, type Job } from "../../../lib/jobs/contracts";
import { MAX_ANALYSIS_ATTEMPTS } from "../../../lib/domain/analysis-lifecycle";
import { analyzeActivityJob } from "./analyze-activity";
import { detectMomentFromSignals } from "./detection";
import { scanAnniversaries, scanInactiveAccounts } from "./rules";

export interface JobsEnv {
  DB: D1Database;
  /** Producer for re-enqueueing orphaned signals (reconciliation). */
  MOMENT_JOBS: Queue;
  /** Enables AI detection + activity analysis (wrangler secret put OPENAI_API_KEY). */
  OPENAI_API_KEY?: string;
  /** Override the model (default gpt-5-mini). */
  AI_MODEL?: string;
}

// Cron slots (UTC) — see wrangler.jsonc triggers.
const CRON_ANNIVERSARY = "0 23 * * *"; // 06:00 ICT
const CRON_RETURN_180 = "0 0 * * *"; // 07:00 ICT

const DLQ_NAME = "everybrandmoments-jobs-dlq";

export default {
  // Queue consumer: UI/API enqueues → this worker processes → D1 → Radar.
  // Long-running work never blocks a page request (refactor plan §2.4).
  async queue(batch: MessageBatch<unknown>, env: JobsEnv): Promise<void> {
    // Dead letters land here after max_retries: mark their signals `failed`
    // so they stop showing as in-flight and reconciliation never resurrects
    // them silently (pre-deploy known issue).
    if (batch.queue === DLQ_NAME) {
      await handleDeadLetters(batch, env);
      return;
    }
    for (const message of batch.messages) {
      const parsed = JobSchema.safeParse(message.body);
      if (!parsed.success) {
        console.error(
          JSON.stringify({ event: "job_invalid", error: parsed.error.message }),
        );
        message.ack(); // malformed forever — do not retry
        continue;
      }
      try {
        await handleJob(parsed.data, env);
        message.ack();
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "job_failed",
            jobType: parsed.data.jobType,
            error: err instanceof Error ? err.message : String(err),
            attempts: message.attempts,
          }),
        );
        message.retry();
      }
    }
  },

  async scheduled(controller: ScheduledController, env: JobsEnv): Promise<void> {
    switch (controller.cron) {
      case CRON_ANNIVERSARY:
        await scanAnniversaries(env.DB);
        break;
      case CRON_RETURN_180:
        await scanInactiveAccounts(env.DB);
        break;
      default:
        // Manual trigger via `wrangler dev --test-scheduled` runs everything.
        await scanAnniversaries(env.DB);
        await scanInactiveAccounts(env.DB);
    }
    // Signal insert + queue send are not atomic (review 🔴 §6): re-enqueue
    // signals stuck `pending` for >15 minutes on every scheduled run.
    await reconcilePendingSignals(env);
    // Same durability contract for AI activity analysis (Step-6 P0): stale
    // PENDING (enqueue failed) or QUEUED (lost in flight) outbox rows are
    // re-enqueued; the deterministic suggestion id makes duplicates harmless.
    await reconcilePendingAnalyses(env);
  },
} satisfies ExportedHandler<JobsEnv>;

async function handleDeadLetters(
  batch: MessageBatch<unknown>,
  env: JobsEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = JobSchema.safeParse(message.body);
    if (!parsed.success) {
      // Permanently malformed — log and ack; retrying cannot fix it.
      console.error(JSON.stringify({ event: "job_dead_lettered", jobType: "invalid" }));
      message.ack();
      continue;
    }
    try {
      if (parsed.data.jobType === "DETECT_MOMENT") {
        const job = parsed.data;
        // Guard `!= 'processed'` — a redelivered copy of an already-completed
        // job must not flip its signals back to failed. The statement is
        // idempotent, so DLQ redelivery after a transient failure is safe.
        await env.DB.prepare(
          `UPDATE moment_signals SET processing_status = 'failed'
           WHERE organization_id = ? AND account_id = ?
             AND id IN (${job.signalIds.map(() => "?").join(", ")})
             AND processing_status != 'processed'`,
        )
          .bind(job.organizationId, job.accountId, ...job.signalIds)
          .run();
      }
      console.error(
        JSON.stringify({
          event: "job_dead_lettered",
          jobType: parsed.data.jobType,
          accountId:
            parsed.data.jobType === "DETECT_MOMENT"
              ? parsed.data.accountId
              : undefined,
        }),
      );
      message.ack();
    } catch (err) {
      // Transient D1 failure — let the queue redeliver (max_retries 3).
      console.error(
        JSON.stringify({
          event: "dlq_mark_failed_error",
          jobType: parsed.data.jobType,
          attempts: message.attempts,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      message.retry();
    }
  }
}

const RECONCILE_AFTER_MS = 15 * 60 * 1000;

async function reconcilePendingSignals(env: JobsEnv): Promise<void> {
  const cutoff = new Date(Date.now() - RECONCILE_AFTER_MS).toISOString();
  const orphans = await env.DB.prepare(
    `SELECT id, organization_id, account_id FROM moment_signals
     WHERE processing_status = 'pending' AND detected_at < ?
     LIMIT 50`,
  )
    .bind(cutoff)
    .all<{ id: string; organization_id: string; account_id: string }>();

  let requeued = 0;
  for (const s of orphans.results) {
    const job = JobSchema.safeParse({
      jobType: "DETECT_MOMENT",
      organizationId: s.organization_id,
      accountId: s.account_id,
      signalIds: [s.id],
    });
    if (!job.success) continue;
    await env.MOMENT_JOBS.send(job.data);
    await env.DB.prepare(
      "UPDATE moment_signals SET processing_status = 'queued' WHERE id = ?",
    )
      .bind(s.id)
      .run();
    requeued += 1;
  }
  if (orphans.results.length > 0) {
    console.log(
      JSON.stringify({ event: "signal_reconciliation", found: orphans.results.length, requeued }),
    );
  }
}

async function reconcilePendingAnalyses(env: JobsEnv): Promise<void> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - RECONCILE_AFTER_MS).toISOString();
  // Bounded lifecycle (Step-6 review round 2): rows whose attempt budget is
  // spent flip to FAILED (observable, operator-resettable) instead of
  // spinning through the queue forever.
  await env.DB.prepare(
    `UPDATE activities
     SET analysis_status = 'FAILED',
         analysis_last_error = COALESCE(analysis_last_error, 'max_attempts_exceeded'),
         updated_at = ?
     WHERE analysis_status IN ('PENDING', 'QUEUED')
       AND analysis_attempt_count >= ?`,
  )
    .bind(now, MAX_ANALYSIS_ATTEMPTS)
    .run();
  // Eligibility mirrors isAnalysisRetryEligible(): retryable status, budget
  // remaining, stale, and past its scheduled backoff. BLOCKED/FAILED/
  // PROCESSED are never selected.
  const stale = await env.DB.prepare(
    `SELECT id, organization_id, account_id FROM activities
     WHERE analysis_status IN ('PENDING', 'QUEUED')
       AND analysis_attempt_count < ?
       AND updated_at < ?
       AND (analysis_next_retry_at IS NULL OR analysis_next_retry_at <= ?)
     LIMIT 50`,
  )
    .bind(MAX_ANALYSIS_ATTEMPTS, cutoff, now)
    .all<{ id: string; organization_id: string; account_id: string }>();

  let requeued = 0;
  for (const a of stale.results) {
    const job = JobSchema.safeParse({
      jobType: "ANALYZE_ACTIVITY",
      organizationId: a.organization_id,
      accountId: a.account_id,
      activityId: a.id,
    });
    if (!job.success) continue;
    await env.MOMENT_JOBS.send(job.data);
    await env.DB.prepare(
      "UPDATE activities SET analysis_status = 'QUEUED', updated_at = ? WHERE id = ?",
    )
      .bind(new Date().toISOString(), a.id)
      .run();
    requeued += 1;
  }
  if (stale.results.length > 0) {
    console.log(
      JSON.stringify({
        event: "analysis_reconciliation",
        found: stale.results.length,
        requeued,
      }),
    );
  }
}

async function handleJob(job: Job, env: JobsEnv): Promise<void> {
  switch (job.jobType) {
    case "DETECT_MOMENT":
      await detectMomentFromSignals(env.DB, job, env);
      break;
    case "ANALYZE_ACTIVITY":
      await analyzeActivityJob(env.DB, job, env);
      break;
    case "SCORE_MOMENT":
    case "RECOMMEND_SOLUTIONS":
    case "NEXT_MOMENT":
      // Sprint 6: AI scoring / recommendation / prediction land here behind
      // the same contracts. Acked as no-op until then.
      console.log(JSON.stringify({ event: "job_noop", jobType: job.jobType }));
      break;
    case "CRM_SYNC":
    case "ERP_SYNC":
      // Sprint 5b: external sync via translation layer (plan §42–43).
      console.log(JSON.stringify({ event: "job_noop", jobType: job.jobType }));
      break;
  }
}
