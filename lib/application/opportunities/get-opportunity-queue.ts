import type { Account, CrmTask, MomentEvent, Opportunity } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { totalScore } from "@/lib/domain/score";
import { getClock } from "@/lib/services/clock";
import {
  daysSinceOpportunityContact,
  isOpportunityAtRisk,
} from "@/lib/domain/opportunity";

export interface OpportunityRow {
  opportunity: Opportunity;
  account: Account;
  event: MomentEvent | null;
  ownerName: string;
  /** Step 5 — CRM context from the activity layer (bulk reads, no N+1). */
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  /** Days since last contact — falls back to opportunity creation when no
   * activity exists (canonical no-contact rule, spec §27). */
  daysSinceContact: number;
  atRisk: boolean;
  nextFollowUp: CrmTask | null;
}

export interface OpportunityQueueView {
  rows: OpportunityRow[];
  openCount: number;
  /** Open opportunities past the no-contact threshold (same canonical rule
   * as the per-row display). */
  atRiskCount: number;
  pipelineValue: number;
  weightedGP: number;
  inProposalOrNegotiation: number;
}

export async function getOpportunityQueue(): Promise<OpportunityQueueView> {
  const repos = await getRepositories();
  // Bounded page (review P2): production never loads the full table.
  const { items: opportunities } = await repos.opportunities.list({ limit: 100 });

  // Batch read model (review perf §9) — activity context joins the same
  // batch: one grouped last-activity query + one next-open-task query.
  const opportunityIds = opportunities.map((o) => o.id);
  const [accounts, events, owners, lastActivity, nextTasks] = await Promise.all([
    repos.accounts.getByIds([...new Set(opportunities.map((o) => o.accountId))]),
    repos.moments.getByIds([...new Set(opportunities.map((o) => o.momentEventId))]),
    repos.users.getByIds([...new Set(opportunities.map((o) => o.ownerId))]),
    repos.activities.lastActivityByOpportunities(opportunityIds),
    repos.tasks.nextOpenTaskByOpportunities(opportunityIds),
  ]);
  const clockNow = getClock().now();
  const now = clockNow.getTime();
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const ownerMap = new Map(owners.map((u) => [u.id, u]));

  const rows: OpportunityRow[] = [];
  for (const opportunity of opportunities) {
    const account = accountMap.get(opportunity.accountId);
    if (!account) continue;
    const owner = ownerMap.get(opportunity.ownerId);
    const lastAt = lastActivity.get(opportunity.id) ?? null;
    rows.push({
      opportunity,
      account,
      event: eventMap.get(opportunity.momentEventId) ?? null,
      ownerName: owner
        ? `${owner.nickname} (${owner.name.split(" ")[0]})`
        : opportunity.ownerId,
      lastActivityAt: lastAt,
      daysSinceLastActivity: lastAt
        ? Math.max(0, Math.floor((now - new Date(lastAt).getTime()) / 86_400_000))
        : null,
      daysSinceContact: daysSinceOpportunityContact(
        lastAt, opportunity.createdAt, clockNow,
      ),
      atRisk: isOpportunityAtRisk(
        opportunity.status, lastAt, opportunity.createdAt, clockNow,
      ),
      nextFollowUp: nextTasks.get(opportunity.id) ?? null,
    });
  }

  rows.sort(
    (a, b) =>
      (b.event ? totalScore(b.event.score) : 0) - (a.event ? totalScore(a.event.score) : 0),
  );

  // Open pipeline = ACTIVE only — DRAFT is not commercial pipeline yet.
  const open = rows.filter((r) => r.opportunity.status === "ACTIVE");
  return {
    rows,
    openCount: open.length,
    atRiskCount: rows.filter((r) => r.atRisk).length,
    pipelineValue: open.reduce((s, r) => s + r.opportunity.expectedRevenue, 0),
    weightedGP: open.reduce(
      (s, r) => s + r.opportunity.expectedRevenue * r.opportunity.expectedGP,
      0,
    ),
    inProposalOrNegotiation: rows.filter(
      (r) =>
        r.opportunity.salesStage !== null &&
        ["PROPOSAL", "NEGOTIATION"].includes(r.opportunity.salesStage),
    ).length,
  };
}
