import type { Solution } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

export interface SolutionWithNames extends Solution {
  crossSellNames: string[];
}

export async function listSolutions(): Promise<SolutionWithNames[]> {
  const repos = await getRepositories();
  const all = await repos.solutions.listAll();
  const nameById = new Map(all.map((s) => [s.id, s.name]));
  return all.map((s) => ({
    ...s,
    crossSellNames: s.crossSellSolutionIds.map((id) => nameById.get(id) ?? id),
  }));
}
