import type { Opportunity } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import {
  IdempotencyConflictError,
  projectCreateFingerprint,
} from "@/lib/domain/opportunity";
import {
  CreateProjectSchema,
  type CreateProjectInput,
} from "@/lib/validation/project";

/**
 * Step 3 — createProject: always lands as DRAFT (stage NULL). Activation is
 * a separate, explicit use case — creation never auto-activates.
 * Atomic + idempotent via the Step-2 repository batch (project + solution
 * relations + first history + audit in one write).
 */
export async function createProject(
  raw: CreateProjectInput,
): Promise<{ project: Opportunity; created: boolean }> {
  const input = CreateProjectSchema.parse(raw);
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
  if (input.solutionIds?.length) {
    const solutions = await Promise.all(
      input.solutionIds.map((id) => repos.solutions.getById(id)),
    );
    if (solutions.some((s) => s === null)) {
      throw new Error("Unknown solution id in selection");
    }
  }

  // Industry prefills from the account but is SNAPSHOT onto the project.
  const industryId = input.industryId ?? account.industryId ?? undefined;

  const { opportunity, created } = await repos.opportunities.create({
    momentEventId: event.id,
    accountId: account.id,
    name: input.name,
    status: "DRAFT",
    salesStage: null,
    industryId,
    subIndustryId: input.subIndustryId,
    projectTypeId: input.projectTypeId,
    brief: input.brief ?? null,
    expectedRevenue: input.expectedRevenue,
    expectedGP: input.expectedGP,
    closeDate: input.closeDate,
    expectedDeliveryDate: input.expectedDeliveryDate ?? null,
    ownerId: input.ownerId,
    nextAction: input.nextAction,
    nextActionDate: input.nextActionDate ?? null,
    clientRequestId: input.clientRequestId,
    solutionIds: input.solutionIds,
    createdBy: input.actorId,
  });

  // Idempotency conflict (reviewer §4): the same key with a materially
  // different payload is an error — never silently the original project.
  if (!created) {
    const requested = projectCreateFingerprint({
      accountId: account.id,
      momentEventId: event.id,
      name: input.name,
      status: "DRAFT",
      expectedRevenue: input.expectedRevenue,
      industryId: industryId ?? null,
      projectTypeId: input.projectTypeId ?? null,
      ownerId: input.ownerId,
    });
    const stored = projectCreateFingerprint({
      accountId: opportunity.accountId,
      momentEventId: opportunity.momentEventId,
      name: opportunity.name,
      status: "DRAFT",
      expectedRevenue: opportunity.expectedRevenue,
      industryId: opportunity.industryId,
      projectTypeId: opportunity.projectTypeId,
      ownerId: opportunity.ownerId,
    });
    if (requested !== stored) {
      throw new IdempotencyConflictError(input.clientRequestId);
    }
  }

  return { project: opportunity, created };
}
