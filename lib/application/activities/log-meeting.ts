import { getRepositories } from "@/lib/infrastructure";
import { enqueueActivityAnalysis } from "@/lib/services/analysis-queue";
import type { LogMeetingInput } from "@/lib/contracts/crm";
import type { AccountId, ContactId, UserId } from "@/lib/types";
import type { CreatedInteraction } from "./create-note";
import {
  assertInteractionOwnership,
  buildFollowUpTask,
  normalizeInteractionTimes,
  validateNextState,
} from "./shared";

/** 📅 Log Meeting (spec §14) — key needs / budget / timeline live in typed
 * metadata; AI enrichment stays async (review req 4). */
export async function logMeeting(
  input: LogMeetingInput & { createdBy: UserId },
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
      activityType: "MEETING",
      title: `ประชุม — ${input.meetingType}`,
      body: input.body,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy,
      metadata: {
        kind: "MEETING",
        meetingType: input.meetingType,
        ...(input.locationOrChannel && { locationOrChannel: input.locationOrChannel }),
        ...(input.keyNeeds && input.keyNeeds.length > 0 && { keyNeeds: input.keyNeeds }),
        ...(input.budgetMin !== undefined && { budgetMin: input.budgetMin }),
        ...(input.budgetMax !== undefined && { budgetMax: input.budgetMax }),
        ...(input.expectedTimeline && { expectedTimeline: input.expectedTimeline }),
        ...(input.decisionMakerContactId && {
          decisionMakerContactId: input.decisionMakerContactId,
        }),
        ...(input.nextState && { nextState: input.nextState }),
      },
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
