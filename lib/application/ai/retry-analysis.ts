import { getRepositories } from "@/lib/infrastructure";
import { CrmError } from "@/lib/application/activities/shared";
import type { ActivityId } from "@/lib/types";

/**
 * Operator-controlled retry (Step-6 review round 2): after configuration is
 * fixed (API key / model), a BLOCKED or FAILED analysis re-enters the
 * lifecycle at PENDING with a fresh attempt budget; the cron reconciler
 * re-enqueues it on the next sweep. Any other state is a no-op guard —
 * PROCESSED work is never re-run through this path.
 */
export async function retryAnalysis(activityId: ActivityId): Promise<void> {
  const repos = await getRepositories();
  const activity = await repos.activities.getById(activityId);
  if (!activity) throw new CrmError("ไม่พบ Activity นี้ในองค์กร");
  if (activity.analysisStatus !== "BLOCKED" && activity.analysisStatus !== "FAILED") {
    throw new CrmError("Retry ได้เฉพาะรายการที่ BLOCKED หรือ FAILED");
  }
  await repos.activities.resetAnalysis([activityId]);
}
