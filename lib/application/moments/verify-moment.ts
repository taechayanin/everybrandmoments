import type { MomentEventId, UserId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { momentActivityKey } from "@/lib/domain/activity";

// SOP step 3 (PRD §47): "ไม่เชื่อ AI 100%" — Customer Solution confirms or
// rejects every detected moment. Decisions are atomic with their audit record
// and idempotent: once decided, later calls change nothing.
//
// Step 5: each decision also lands on the Account Timeline as a system
// activity (MOMENT_VERIFIED / MOMENT_REJECTED). Two idempotency layers keep
// retries silent: the decision itself only reports changed=true once, and the
// activity's clientRequestId is keyed by the moment event id.

export async function confirmMoment(
  id: MomentEventId,
  userId: UserId,
): Promise<{ changed: boolean }> {
  const repos = await getRepositories();
  const event = await repos.moments.getById(id);
  if (!event) throw new Error(`Moment event not found: ${id}`);
  const changed = await repos.moments.confirm(id, userId);
  if (changed) {
    await repos.activities.create({
      accountId: event.accountId,
      momentEventId: id,
      activityType: "MOMENT_VERIFIED",
      title: `ยืนยัน Moment — ${event.momentType}`,
      body: event.subMoment,
      occurredAt: new Date().toISOString(),
      createdBy: userId,
      clientRequestId: momentActivityKey("VERIFIED", id),
    });
  }
  return { changed };
}

export async function rejectMoment(
  id: MomentEventId,
  userId: UserId,
  reason?: string,
): Promise<{ changed: boolean }> {
  const repos = await getRepositories();
  const event = await repos.moments.getById(id);
  if (!event) throw new Error(`Moment event not found: ${id}`);
  const changed = await repos.moments.reject(id, userId, reason);
  if (changed) {
    await repos.activities.create({
      accountId: event.accountId,
      momentEventId: id,
      activityType: "MOMENT_REJECTED",
      title: `ปฏิเสธ Moment — ${event.momentType}`,
      body: reason ?? event.subMoment,
      occurredAt: new Date().toISOString(),
      createdBy: userId,
      clientRequestId: momentActivityKey("REJECTED", id),
    });
  }
  return { changed };
}
