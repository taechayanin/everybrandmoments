import { JobSchema, type Job } from "../../../lib/jobs/contracts";
import { detectMomentFromSignals } from "./detection";
import { scanAnniversaries, scanInactiveAccounts } from "./rules";

export interface JobsEnv {
  DB: D1Database;
  /** Producer for re-enqueueing orphaned signals (reconciliation). */
  MOMENT_JOBS: Queue;
  /** Enables Level 3 AI detection when set (wrangler secret put ANTHROPIC_API_KEY). */
  ANTHROPIC_API_KEY?: string;
  /** Override the detection model (default claude-opus-5). */
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
  },
} satisfies ExportedHandler<JobsEnv>;

async function handleDeadLetters(
  batch: MessageBatch<unknown>,
  env: JobsEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = JobSchema.safeParse(message.body);
    if (parsed.success && parsed.data.jobType === "DETECT_MOMENT") {
      const job = parsed.data;
      // Guard `!= 'processed'` — a redelivered copy of an already-completed
      // job must not flip its signals back to failed.
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
        jobType: parsed.success ? parsed.data.jobType : "invalid",
        accountId:
          parsed.success && parsed.data.jobType === "DETECT_MOMENT"
            ? parsed.data.accountId
            : undefined,
      }),
    );
    message.ack(); // dead letters are terminal — never retry from the DLQ
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

async function handleJob(job: Job, env: JobsEnv): Promise<void> {
  switch (job.jobType) {
    case "DETECT_MOMENT":
      await detectMomentFromSignals(env.DB, job, env);
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
