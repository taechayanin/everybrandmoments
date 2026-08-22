import type { Opportunity } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import {
  CreateOpportunitySchema,
  type CreateOpportunityFormInput,
} from "@/lib/validation/opportunity";

/**
 * Creates a commercial opportunity from a qualified moment and advances the
 * moment's operational status. Runtime-validates every write crossing the
 * server boundary (refactor plan §28–29).
 */
export async function createOpportunity(
  raw: CreateOpportunityFormInput,
): Promise<Opportunity> {
  const input = CreateOpportunitySchema.parse(raw);
  const repos = await getRepositories();

  const [account, event] = await Promise.all([
    repos.accounts.getById(input.accountId),
    repos.moments.getById(input.momentEventId),
  ]);
  if (!account) throw new Error(`Account not found: ${input.accountId}`);
  if (!event) throw new Error(`Moment event not found: ${input.momentEventId}`);
  if (event.accountId !== account.id) {
    throw new Error("Moment event does not belong to the given account");
  }

  const solutions = await Promise.all(
    input.solutionIds.map((id) => repos.solutions.getById(id)),
  );
  if (solutions.some((s) => s === null)) {
    throw new Error("Unknown solution id in selection");
  }

  const expectedRevenue =
    input.expectedRevenue ??
    solutions.reduce((sum, s) => sum + (s?.averageWallet ?? 0), 0);
  const expectedGP =
    solutions.reduce((sum, s) => sum + (s?.grossMarginTarget ?? 0), 0) /
    Math.max(solutions.length, 1);

  const opportunity = await repos.opportunities.create({
    momentEventId: event.id,
    accountId: account.id,
    name: `${account.name} — ${event.subMoment}`,
    expectedRevenue,
    expectedGP,
    closeDate: event.expectedEventDate,
    stage: "Discovery",
    ownerId: input.ownerId,
    nextAction: `เตรียม Solution Brief (${input.channelMode === "OFFLINE" ? "นัด Offline" : "Online"})`,
    channel: input.channel,
  });

  await repos.moments.updateStatus(event.id, "Discovery Completed");

  return opportunity;
}
