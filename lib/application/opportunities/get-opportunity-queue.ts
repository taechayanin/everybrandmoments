import type { Account, MomentEvent, Opportunity } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { totalScore } from "@/lib/domain/score";

export interface OpportunityRow {
  opportunity: Opportunity;
  account: Account;
  event: MomentEvent | null;
  ownerName: string;
}

export interface OpportunityQueueView {
  rows: OpportunityRow[];
  openCount: number;
  pipelineValue: number;
  weightedGP: number;
  inProposalOrNegotiation: number;
}

const CLOSED = new Set(["Won", "Lost"]);

export async function getOpportunityQueue(): Promise<OpportunityQueueView> {
  const repos = await getRepositories();
  const opportunities = await repos.opportunities.listAll();

  // Batch read model (review perf §9).
  const [accounts, events, owners] = await Promise.all([
    repos.accounts.getByIds([...new Set(opportunities.map((o) => o.accountId))]),
    repos.moments.getByIds([...new Set(opportunities.map((o) => o.momentEventId))]),
    repos.users.getByIds([...new Set(opportunities.map((o) => o.ownerId))]),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const ownerMap = new Map(owners.map((u) => [u.id, u]));

  const rows: OpportunityRow[] = [];
  for (const opportunity of opportunities) {
    const account = accountMap.get(opportunity.accountId);
    if (!account) continue;
    const owner = ownerMap.get(opportunity.ownerId);
    rows.push({
      opportunity,
      account,
      event: eventMap.get(opportunity.momentEventId) ?? null,
      ownerName: owner
        ? `${owner.nickname} (${owner.name.split(" ")[0]})`
        : opportunity.ownerId,
    });
  }

  rows.sort(
    (a, b) =>
      (b.event ? totalScore(b.event.score) : 0) - (a.event ? totalScore(a.event.score) : 0),
  );

  const open = rows.filter((r) => !CLOSED.has(r.opportunity.stage));
  return {
    rows,
    openCount: open.length,
    pipelineValue: open.reduce((s, r) => s + r.opportunity.expectedRevenue, 0),
    weightedGP: open.reduce(
      (s, r) => s + r.opportunity.expectedRevenue * r.opportunity.expectedGP,
      0,
    ),
    inProposalOrNegotiation: rows.filter((r) =>
      ["Proposal", "Negotiation"].includes(r.opportunity.stage),
    ).length,
  };
}
