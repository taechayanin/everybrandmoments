import { getRepositories } from "@/lib/infrastructure";
import type { LogCallInput } from "@/lib/contracts/crm";
import type { AccountId, ContactId, UserId } from "@/lib/types";
import type { CreatedInteraction } from "./create-note";
import {
  assertInteractionOwnership,
  buildFollowUpTask,
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

  return repos.interactions.logInteraction({
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
}
