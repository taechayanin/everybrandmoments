import type { MasterMoment, MomentCode } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

/**
 * Next Moment Engine (PRD §37) — rule-based for Phase 2; the AI predictor
 * (Phase 3) replaces this implementation behind the same signature.
 */
export async function predictNextMoments(code: MomentCode): Promise<MasterMoment[]> {
  const repos = await getRepositories();
  const master = await repos.masterMoments.getByCode(code);
  if (!master) return [];
  const next = await Promise.all(
    master.nextMoments.map((c) => repos.masterMoments.getByCode(c)),
  );
  return next.filter((m): m is MasterMoment => m !== null);
}
