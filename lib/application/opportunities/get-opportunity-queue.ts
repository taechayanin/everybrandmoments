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

  const rows: OpportunityRow[] = [];
  for (const opportunity of opportunities) {
    const [account, event, owner] = await Promise.all([
      repos.accounts.getById(opportunity.accountId),
      repos.moments.getById(opportunity.momentEventId),
      repos.users.getById(opportunity.ownerId),
    ]);
    if (!account) continue;
    rows.push({
      opportunity,
      account,
      event,
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
