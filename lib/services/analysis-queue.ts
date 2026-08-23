import { JobSchema, type Job } from "@/lib/jobs/contracts";

// Async AI enrichment hand-off (sprint Step 6, spec §55): the CRM write has
// already committed before this runs, and NOTHING here may fail the save —
// Claude being down, the queue binding missing, or a send error all degrade
// to a logged skip. The activity stays safe; only the enrichment is lost.

const ORG = "ORG-001";

type Sink = (job: Job) => Promise<void>;

let testSink: Sink | null = null;

/** Test seam — lets vitest observe/enforce enqueue behavior without a real
 * Cloudflare queue binding. */
export function __setAnalysisQueueSinkForTests(sink: Sink | null): void {
  testSink = sink;
}

export async function enqueueActivityAnalysis(input: {
  accountId: string;
  activityId: string;
}): Promise<void> {
  try {
    const job = JobSchema.parse({
      jobType: "ANALYZE_ACTIVITY",
      organizationId: ORG,
      accountId: input.accountId,
      activityId: input.activityId,
    });
    if (testSink) {
      await testSink(job);
      return;
    }
    const { getBindings } = await import("@/lib/infrastructure/cloudflare/env");
    const env = await getBindings();
    if (env.MOMENT_JOBS) {
      await env.MOMENT_JOBS.send(job);
    } else {
      console.warn(
        JSON.stringify({ event: "analysis_enqueue_skipped", reason: "no_queue_binding" }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "analysis_enqueue_failed",
        activityId: input.activityId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
