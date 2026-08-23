import { getRepositories } from "@/lib/infrastructure";
import { enqueueActivityAnalysis } from "@/lib/services/analysis-queue";
import type { LogCallInput } from "@/lib/contracts/crm";
import type { AccountId, ContactId, UserId } from "@/lib/types";
import type { CreatedInteraction } from "./create-note";
import {
  assertInteractionOwnership,
  buildFollowUpTask,
  normalizeInteractionTimes,
  validateNextState,
} from "./shared";

/** 📞 Log Call (spec §13) — target <60s form-to-save; AI never in this path. */
export async function logCall(
  input: LogCallInput & { createdBy: UserId },
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
      activityType: "CALL",
      title: `โทร — ${input.outcome}`,
      body: input.body,
      outcome: input.outcome,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy,
      metadata: {
        kind: "CALL",
        ...(input.durationMinutes !== undefined && {
          durationMinutes: input.durationMinutes,
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
