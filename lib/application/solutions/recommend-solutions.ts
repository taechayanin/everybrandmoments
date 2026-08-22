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
  const ranked: Solution[] = [];
  const seen = new Set<string>();

  const push = (s: Solution | null) => {
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      ranked.push(s);
    }
  };

  // 1) Solutions explicitly recommended on the active moment event
  if (currentMoment) {
    for (const id of currentMoment.recommendedSolutionIds) {
      push(await repos.solutions.getById(id));
    }
  }

  // 2) Whitespace gaps → category solutions
  for (const [cat, bought] of Object.entries(account.whitespace) as [
    WhitespaceCategory,
    boolean,
  ][]) {
    if (bought) continue;
    const id = GAP_SOLUTION_IDS[cat];
    if (id) push(await repos.solutions.getById(id as Solution["id"]));
  }

  // 3) Other solutions for the current moment
  if (currentMoment) {
    for (const s of await repos.solutions.listByMoment(currentMoment.momentType)) {
      push(s);
    }
  }

  return ranked.slice(0, limit);
}
