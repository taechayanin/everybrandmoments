import { getRepositories } from "@/lib/infrastructure";
import { enqueueActivityAnalysis } from "@/lib/services/analysis-queue";
import type { CreateNoteInput } from "@/lib/contracts/crm";
import type { Activity, AccountId, ContactId, CrmTask, UserId } from "@/lib/types";
import {
  assertInteractionOwnership,
  buildFollowUpTask,
  normalizeInteractionTimes,
  validateNextState,
} from "./shared";

export interface CreatedInteraction {
  activity: Activity;
  task?: CrmTask;
  deduped: boolean;
}

/**
 * + Note (spec §12). Pure CRM write — saves first, never touches AI
 * (enrichment is an async Step-6 job; review req 4).
 */
export async function createNote(
  input: CreateNoteInput & { createdBy: UserId },
): Promise<CreatedInteraction> {
  const repos = await getRepositories();
  const accountId = input.accountId as AccountId;
  await assertInteractionOwnership(repos, accountId, input);
  validateNextState(input);
  // Org-local wall time -> UTC ISO before anything is persisted (fix 1).
  input = normalizeInteractionTimes(input);

  const result = await repos.interactions.logInteraction({
    activity: {
      accountId,
      contactId: input.contactId as ContactId | undefined,
      opportunityId: input.opportunityId as never,
      momentEventId: input.momentEventId as never,
      activityType: "NOTE",
      body: input.body,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      createdBy: input.createdBy,
      metadata: input.nextState ? { nextState: input.nextState } : undefined,
      clientRequestId: input.clientRequestId,
    },
    followUpTask: buildFollowUpTask({ ...input, accountId }, input.createdBy),
  });
  // Async AI enrichment (Step 6): fire-and-forget after the committed
  // write — enqueue failure can never fail the save (spec §55).
  if (!result.deduped) {
    await enqueueActivityAnalysis({
      accountId,
      activityId: result.activity.id,
    });
  }
  return result;
}
