import type { MomentEventId, UserId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

// SOP step 3 (PRD §47): "ไม่เชื่อ AI 100%" — Customer Solution confirms or
// rejects every detected moment. Decisions are atomic with their audit record
// and idempotent: once decided, later calls change nothing.

export async function confirmMoment(
  id: MomentEventId,
  userId: UserId,
): Promise<{ changed: boolean }> {
  const repos = await getRepositories();
  const event = await repos.moments.getById(id);
  if (!event) throw new Error(`Moment event not found: ${id}`);
  const changed = await repos.moments.confirm(id, userId);
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
  return { changed };
}
