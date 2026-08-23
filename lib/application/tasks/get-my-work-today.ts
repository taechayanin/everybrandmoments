import { getRepositories } from "@/lib/infrastructure";
import { getClock } from "@/lib/services/clock";
import type { CrmTask, UserId } from "@/lib/types";

export interface MyWorkTodayView {
  today: string; // ISO date
  overdue: CrmTask[];
  dueToday: CrmTask[];
  upcoming: CrmTask[];
}

const BAND_LIMIT = 20;

/** My Work Today (spec §18) — three bounded band queries, no scans. */
export async function getMyWorkToday(userId: UserId): Promise<MyWorkTodayView> {
  const repos = await getRepositories();
  const today = getClock().now().toISOString().slice(0, 10);
  const [overdue, dueToday, upcoming] = await Promise.all([
    repos.tasks.listByAssignee(userId, "overdue", today, BAND_LIMIT),
    repos.tasks.listByAssignee(userId, "today", today, BAND_LIMIT),
    repos.tasks.listByAssignee(userId, "upcoming", today, BAND_LIMIT),
  ]);
  return { today, overdue, dueToday, upcoming };
}
