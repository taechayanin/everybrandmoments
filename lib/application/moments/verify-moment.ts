import type { MomentEventId, UserId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

// SOP step 3 (PRD §47): "ไม่เชื่อ AI 100%" — Customer Solution confirms or
// rejects every detected moment before it moves down the pipeline.

export async function confirmMoment(
  id: MomentEventId,
  verifiedBy: UserId,
): Promise<void> {
  const repos = await getRepositories();
  const event = await repos.moments.getById(id);
  if (!event) throw new Error(`Moment event not found: ${id}`);
  await repos.moments.verify(id, verifiedBy);
}

export async function rejectMoment(
  id: MomentEventId,
  verifiedBy: UserId,
): Promise<void> {
  const repos = await getRepositories();
  const event = await repos.moments.getById(id);
  if (!event) throw new Error(`Moment event not found: ${id}`);
  // Rejected detection = not a real moment. Record who decided, then close it.
  await repos.moments.verify(id, verifiedBy);
  await repos.moments.updateStatus(id, "Lost");
}
