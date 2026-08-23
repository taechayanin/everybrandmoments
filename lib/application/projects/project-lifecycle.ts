import type { Opportunity } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import {
  ACTIVATION_STAGE,
  activationGateErrors,
  canChangeSalesStage,
  canTransitionStatus,
  isBackwardStageMove,
} from "@/lib/domain/opportunity";
import {
  ActivateProjectSchema,
  CancelProjectSchema,
  CloseProjectLostSchema,
  CloseProjectWonSchema,
  UpdateProjectNextActionSchema,
  UpdateProjectSchema,
  UpdateProjectStageSchema,
  type ActivateProjectInput,
  type CancelProjectInput,
  type CloseProjectLostInput,
  type CloseProjectWonInput,
  type UpdateProjectInput,
  type UpdateProjectNextActionInput,
  type UpdateProjectStageInput,
} from "@/lib/validation/project";
import { validateProjectContextRelations } from "./validate-project-context";

// Step 3 — lifecycle use cases. Every state change goes through ONE canonical
// rule set (domain/opportunity.ts) and ONE atomic repository primitive
// (applyTransition: project + stage history + audit in a single batch).
// The activation gate lives in activationGateErrors() alone — use cases and
// repository both call it; nothing re-implements it.

async function loadProject(id: string): Promise<Opportunity> {
  const repos = await getRepositories();
  const project = await repos.opportunities.getById(id as Opportunity["id"]);
  if (!project) throw new Error(`Project not found: ${id}`);
  return project;
}

/**
 * activateProject — DRAFT → ACTIVE at NEW_BRIEF. Missing context may be
 * completed in the same call; the canonical gate decides, and the fields land
 * atomically with the transition.
 */
export async function activateProject(
  raw: ActivateProjectInput,
): Promise<Opportunity> {
  const input = ActivateProjectSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (!canTransitionStatus(project.status, "ACTIVE")) {
    throw new Error(`Cannot activate a ${project.status} project`);
  }

  const merged = {
    accountId: project.accountId,
    industryId: input.industryId ?? project.industryId,
    subIndustryId: input.subIndustryId ?? project.subIndustryId,
    momentEventId: project.momentEventId,
    projectTypeId: input.projectTypeId ?? project.projectTypeId,
    ownerId: project.ownerId,
    expectedRevenue: input.expectedRevenue ?? project.expectedRevenue,
    nextAction: input.nextAction ?? project.nextAction,
    nextActionDate: input.nextActionDate ?? project.nextActionDate,
  };
  // Canonical completeness (domain gate) + canonical relationships (P1-1):
  // both must hold on the FINAL state before the funnel opens.
  const errors = activationGateErrors(merged);
  if (errors.length > 0) {
    throw new Error(`activation gate failed: ${errors.join(", ")}`);
  }
  const relationErrors = await validateProjectContextRelations(repos, merged);
  if (relationErrors.length > 0) {
    throw new Error(`project context invalid: ${relationErrors.join(", ")}`);
  }

  const { applied, opportunity } = await repos.opportunities.applyTransition({
    opportunityId: project.id,
    fromStatus: "DRAFT",
    toStatus: "ACTIVE",
    fromStage: null,
    toStage: ACTIVATION_STAGE,
    set: {
      industryId: merged.industryId ?? undefined,
      subIndustryId: input.subIndustryId,
      projectTypeId: merged.projectTypeId ?? undefined,
      expectedRevenue: merged.expectedRevenue,
      nextAction: merged.nextAction,
      nextActionDate: merged.nextActionDate,
    },
    reason: "activated",
    changedBy: input.actorId,
    clientRequestId: input.clientRequestId,
  });
  if (!applied || !opportunity) {
    throw new Error("Project state changed concurrently — activation not applied");
  }
  return opportunity;
}

/** updateProjectStage — ACTIVE only; forward freely, backward one step with a
 * reason; closing is never a stage (WON/LOST are status changes). */
export async function updateProjectStage(
  raw: UpdateProjectStageInput,
): Promise<Opportunity> {
  const input = UpdateProjectStageSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (project.status !== "ACTIVE" || project.salesStage === null) {
    throw new Error(`Only ACTIVE projects have sales stages (status: ${project.status})`);
  }
  if (!canChangeSalesStage(project.salesStage, input.toStage)) {
    throw new Error(
      `Stage move not allowed: ${project.salesStage} → ${input.toStage}`,
    );
  }
  if (isBackwardStageMove(project.salesStage, input.toStage) && !input.reason?.trim()) {
    throw new Error("การถอย stage ต้องระบุเหตุผล");
  }
  const { applied, opportunity } = await repos.opportunities.applyTransition({
    opportunityId: project.id,
    fromStatus: "ACTIVE",
    toStatus: "ACTIVE",
    fromStage: project.salesStage,
    toStage: input.toStage,
    reason: input.reason ?? null,
    changedBy: input.actorId,
    clientRequestId: input.clientRequestId,
  });
  if (!applied || !opportunity) {
    throw new Error("Project state changed concurrently — stage move not applied");
  }
  return opportunity;
}

/** closeProjectWon — ACTIVE → WON, stage clears to NULL. */
export async function closeProjectWon(
  raw: CloseProjectWonInput,
): Promise<Opportunity> {
  const input = CloseProjectWonSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (!canTransitionStatus(project.status, "WON")) {
    throw new Error(`Cannot close a ${project.status} project as WON`);
  }
  const { applied, opportunity } = await repos.opportunities.applyTransition({
    opportunityId: project.id,
    fromStatus: "ACTIVE",
    toStatus: "WON",
    fromStage: project.salesStage,
    toStage: null,
    reason: input.reason ?? "won",
    changedBy: input.actorId,
    clientRequestId: input.clientRequestId,
  });
  if (!applied || !opportunity) {
    throw new Error("Project state changed concurrently — close not applied");
  }
  return opportunity;
}

/** closeProjectLost — ACTIVE → LOST, stage NULL, lost_reason required. */
export async function closeProjectLost(
  raw: CloseProjectLostInput,
): Promise<Opportunity> {
  const input = CloseProjectLostSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (!canTransitionStatus(project.status, "LOST")) {
    throw new Error(`Cannot close a ${project.status} project as LOST`);
  }
  const { applied, opportunity } = await repos.opportunities.applyTransition({
    opportunityId: project.id,
    fromStatus: "ACTIVE",
    toStatus: "LOST",
    fromStage: project.salesStage,
    toStage: null,
    set: { lostReason: input.lostReason },
    reason: input.lostReason,
    changedBy: input.actorId,
    clientRequestId: input.clientRequestId,
  });
  if (!applied || !opportunity) {
    throw new Error("Project state changed concurrently — close not applied");
  }
  return opportunity;
}

/** cancelProject — DRAFT|ACTIVE → CANCELLED, cancel_reason + actor required. */
export async function cancelProject(
  raw: CancelProjectInput,
): Promise<Opportunity> {
  const input = CancelProjectSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (!canTransitionStatus(project.status, "CANCELLED")) {
    throw new Error(`Cannot cancel a ${project.status} project`);
  }
  const { applied, opportunity } = await repos.opportunities.applyTransition({
    opportunityId: project.id,
    fromStatus: project.status,
    toStatus: "CANCELLED",
    fromStage: project.salesStage,
    toStage: null,
    set: { cancelReason: input.cancelReason },
    reason: input.cancelReason,
    changedBy: input.actorId,
    clientRequestId: input.clientRequestId,
  });
  if (!applied || !opportunity) {
    throw new Error("Project state changed concurrently — cancel not applied");
  }
  return opportunity;
}

/**
 * updateProject — commercial field edits (no status/stage change). An ACTIVE
 * project cannot lose its context: industry/type may only be replaced with
 * valid values, never cleared, and a non-selectable type is rejected as the
 * new value (legacy rows keep theirs until enriched).
 */
export async function updateProject(
  raw: UpdateProjectInput,
): Promise<Opportunity> {
  const input = UpdateProjectSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (project.status === "WON" || project.status === "LOST" || project.status === "CANCELLED") {
    throw new Error(`Closed projects are immutable (status: ${project.status})`);
  }

  // Step-3 fix P1-2 — the invariant survives every context mutation: when
  // the patch touches industry/sub/type, the RESULTING state must pass the
  // same canonical validation used at activation. DRAFT may stay incomplete
  // (relations of what IS set must still hold); an ACTIVE project must
  // remain fully valid — legacy rows keep working until a context edit,
  // which then requires full enrichment in the same change.
  const touchesContext =
    input.industryId !== undefined ||
    input.subIndustryId !== undefined ||
    input.projectTypeId !== undefined;
  if (touchesContext) {
    const finalCtx = {
      accountId: project.accountId,
      momentEventId: project.momentEventId,
      industryId: input.industryId ?? project.industryId,
      subIndustryId:
        input.subIndustryId === undefined ? project.subIndustryId : input.subIndustryId,
      projectTypeId: input.projectTypeId ?? project.projectTypeId,
      ownerId: project.ownerId,
    };
    const relationErrors = await validateProjectContextRelations(repos, finalCtx);
    if (relationErrors.length > 0) {
      throw new Error(`project context invalid: ${relationErrors.join(", ")}`);
    }
    if (project.status === "ACTIVE") {
      const gateErrors = activationGateErrors({
        ...finalCtx,
        expectedRevenue: input.expectedRevenue ?? project.expectedRevenue,
        nextAction: project.nextAction,
        nextActionDate: project.nextActionDate,
      });
      if (gateErrors.length > 0) {
        throw new Error(
          `ACTIVE project must stay fully valid: ${gateErrors.join(", ")}`,
        );
      }
    }
  }
  const updated = await repos.opportunities.updateFields(
    project.id,
    {
      name: input.name,
      brief: input.brief,
      expectedRevenue: input.expectedRevenue,
      expectedGP: input.expectedGP,
      closeDate: input.closeDate,
      expectedDeliveryDate: input.expectedDeliveryDate,
      industryId: input.industryId,
      subIndustryId: input.subIndustryId,
      projectTypeId: input.projectTypeId,
    },
    input.actorId,
  );
  if (!updated) throw new Error(`Project not found: ${input.opportunityId}`);
  return updated;
}

/** updateProjectNextAction — preserves the "no ACTIVE project without a next
 * action" invariant: both fields required, always together. */
export async function updateProjectNextAction(
  raw: UpdateProjectNextActionInput,
): Promise<Opportunity> {
  const input = UpdateProjectNextActionSchema.parse(raw);
  const repos = await getRepositories();
  const project = await loadProject(input.opportunityId);
  if (project.status === "WON" || project.status === "LOST" || project.status === "CANCELLED") {
    throw new Error(`Closed projects are immutable (status: ${project.status})`);
  }
  const updated = await repos.opportunities.updateFields(
    project.id,
    { nextAction: input.nextAction, nextActionDate: input.nextActionDate },
    input.actorId,
  );
  if (!updated) throw new Error(`Project not found: ${input.opportunityId}`);
  return updated;
}
