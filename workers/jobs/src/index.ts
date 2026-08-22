import { JobSchema, type Job } from "../../../lib/jobs/contracts";
import { detectMomentFromSignals } from "./detection";
import { scanAnniversaries, scanInactiveAccounts } from "./rules";

export interface JobsEnv {
  DB: D1Database;
}

// Cron slots (UTC) — see wrangler.jsonc triggers.
const CRON_ANNIVERSARY = "0 23 * * *"; // 06:00 ICT
const CRON_RETURN_180 = "0 0 * * *"; // 07:00 ICT

export default {
  // Queue consumer: UI/API enqueues → this worker processes → D1 → Radar.
  // Long-running work never blocks a page request (refactor plan §2.4).
  async queue(batch: MessageBatch<unknown>, env: JobsEnv): Promise<void> {
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
        // Manual trigger via `wrangler dev --test-scheduled` runs both.
        await scanAnniversaries(env.DB);
        await scanInactiveAccounts(env.DB);
    }
  },
} satisfies ExportedHandler<JobsEnv>;

async function handleJob(job: Job, env: JobsEnv): Promise<void> {
  switch (job.jobType) {
    case "DETECT_MOMENT":
      await detectMomentFromSignals(env.DB, job);
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
