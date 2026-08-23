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
import { validateProjectContextRelations } from "./validate-project-context";

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

  const account = await repos.accounts.getById(input.accountId);
  if (!account) throw new Error(`Account not found: ${input.accountId}`);

  // Industry prefills from the account but is SNAPSHOT onto the project.
  const industryId = input.industryId ?? account.industryId ?? undefined;

  // Canonical relationship validation (Step-3 fix P1-1): org/account-true
  // moment, sub belongs to industry, selectable type, owner in org.
  const relationErrors = await validateProjectContextRelations(repos, {
    accountId: account.id,
    momentEventId: input.momentEventId,
    industryId: industryId ?? null,
    subIndustryId: input.subIndustryId ?? null,
    projectTypeId: input.projectTypeId ?? null,
    ownerId: input.ownerId,
  });
  if (relationErrors.length > 0) {
    throw new Error(`project context invalid: ${relationErrors.join(", ")}`);
  }
  if (input.solutionIds?.length) {
    const solutions = await Promise.all(
      input.solutionIds.map((id) => repos.solutions.getById(id)),
    );
    if (solutions.some((s) => s === null)) {
      throw new Error("Unknown solution id in selection");
    }
  }

  const { opportunity, created } = await repos.opportunities.create({
    momentEventId: input.momentEventId,
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
    const storedSolutionIds = await repos.opportunities.listSolutionIds(
      opportunity.id,
    );
    const requested = projectCreateFingerprint({
      accountId: account.id,
      momentEventId: input.momentEventId,
      name: input.name,
      status: "DRAFT",
      expectedRevenue: input.expectedRevenue,
      expectedGP: input.expectedGP,
      closeDate: input.closeDate,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      industryId: industryId ?? null,
      subIndustryId: input.subIndustryId ?? null,
      projectTypeId: input.projectTypeId ?? null,
      ownerId: input.ownerId,
      brief: input.brief ?? null,
      nextAction: input.nextAction,
      nextActionDate: input.nextActionDate ?? null,
      solutionIds: input.solutionIds ?? [],
    });
    const stored = projectCreateFingerprint({
      accountId: opportunity.accountId,
      momentEventId: opportunity.momentEventId,
      name: opportunity.name,
      status: "DRAFT",
      expectedRevenue: opportunity.expectedRevenue,
      expectedGP: opportunity.expectedGP,
      closeDate: opportunity.closeDate,
      expectedDeliveryDate: opportunity.expectedDeliveryDate,
      industryId: opportunity.industryId,
      subIndustryId: opportunity.subIndustryId,
      projectTypeId: opportunity.projectTypeId,
      ownerId: opportunity.ownerId,
      brief: opportunity.brief,
      nextAction: opportunity.nextAction,
      nextActionDate: opportunity.nextActionDate,
      solutionIds: storedSolutionIds,
    });
    if (requested !== stored) {
      throw new IdempotencyConflictError(input.clientRequestId);
    }
  }

  return { project: opportunity, created };
}
