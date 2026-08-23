import type { Account, MomentEvent, Solution, WhitespaceCategory } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

/**
 * Next Best Solution (refactor plan §33) — combines whitespace gaps, the
 * current moment, and the moment's recommended solutions. Phase 2 AI can
 * replace the ranking without touching callers.
 */

// Whitespace gap → solution category, expressed as solution IDs (never names).
const GAP_SOLUTION_IDS: Partial<Record<WhitespaceCategory, string>> = {
  "Brand Identity": "SOL-START-001",
  Website: "SOL-START-001",
  Packaging: "SOL-BUILD-002",
  Uniform: "SOL-HIRE-001",
  "Employee Kit": "SOL-WELCOME-001",
  Merchandise: "SOL-ENGAGE-001",
  Signage: "SOL-BUILD-001",
  "Campaign Materials": "SOL-SELL-001",
  "Corporate Gift": "SOL-THANKS-001",
};

export interface RecommendSolutionsInput {
  account: Account;
  currentMoment: MomentEvent | null;
  limit?: number;
}

export async function recommendSolutions({
  account,
  currentMoment,
  limit = 3,
}: RecommendSolutionsInput): Promise<Solution[]> {
  const repos = await getRepositories();
  // Solution catalog is master data — one (cached) load, then in-memory maps
  // instead of a query per candidate (review perf §9).
  const catalog = await repos.solutions.listAll();
  const byId = new Map(catalog.map((s) => [s.id, s]));

  const ranked: Solution[] = [];
  const seen = new Set<string>();
  const push = (s: Solution | null | undefined) => {
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      ranked.push(s);
    }
  };

  // 1) Solutions explicitly recommended on the active moment event
  if (currentMoment) {
    for (const id of currentMoment.recommendedSolutionIds) push(byId.get(id));
  }

  // 2) Whitespace gaps → category solutions
  for (const [cat, bought] of Object.entries(account.whitespace) as [
    WhitespaceCategory,
    boolean,
  ][]) {
    if (bought) continue;
    const id = GAP_SOLUTION_IDS[cat];
    if (id) push(byId.get(id as Solution["id"]));
  }

  // 3) Other solutions for the current moment
  if (currentMoment) {
    for (const s of catalog) {
      if (s.moment === currentMoment.momentType) push(s);
    }
  }

  return ranked.slice(0, limit);
}
