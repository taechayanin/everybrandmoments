import { getRepositories } from "@/lib/infrastructure";
import type { Activity, ActivityId, UserId } from "@/lib/types";
import { CrmError } from "./shared";

export interface UpdateActivityCommand {
  activityId: ActivityId;
  /** Actor recorded on the ACTIVITY_UPDATED audit row. */
  actor: UserId;
  body?: string;
  outcome?: string;
  nextAction?: string;
  nextActionAt?: string;
}

/** User-created notes are editable; system rows are not (spec §31).
 * The repository writes the mutation + audit as one atomic unit. */
export async function updateActivity(
  command: UpdateActivityCommand,
): Promise<Activity> {
  const repos = await getRepositories();
  const existing = await repos.activities.getById(command.activityId);
  if (!existing) throw new CrmError("ไม่พบ Activity นี้");
  const editable = ["NOTE", "CALL", "MEETING", "EMAIL", "LINE", "VISIT"];
  if (!editable.includes(existing.activityType)) {
    throw new CrmError("Activity จากระบบแก้ไขไม่ได้");
  }
  const updated = await repos.activities.update(
    command.activityId,
    {
      body: command.body,
      outcome: command.outcome,
      nextAction: command.nextAction,
      nextActionAt: command.nextActionAt,
    },
    command.actor,
  );
  if (!updated) throw new CrmError("แก้ไข Activity ไม่สำเร็จ");
  return updated;
}

/** Soft delete only (spec §31); returns the owning account for revalidation. */
export async function deleteActivity(
  activityId: ActivityId,
  userId: UserId,
): Promise<{ deleted: boolean; accountId: string | null }> {
  const repos = await getRepositories();
  const existing = await repos.activities.getById(activityId);
  if (!existing) return { deleted: false, accountId: null };
  const editable = ["NOTE", "CALL", "MEETING", "EMAIL", "LINE", "VISIT"];
  if (!editable.includes(existing.activityType)) {
    throw new CrmError("Activity จากระบบลบไม่ได้");
  }
  const deleted = await repos.activities.softDelete(activityId, userId);
  return { deleted, accountId: existing.accountId };
}
