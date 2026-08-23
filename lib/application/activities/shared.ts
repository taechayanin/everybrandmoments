import type { Repositories } from "@/lib/repositories";
import type { CreateCrmTaskInput } from "@/lib/repositories";
import type {
  AccountId,
  ContactId,
  InteractionNextState,
  MomentEventId,
  OpportunityId,
  UserId,
} from "@/lib/types";
import { DEFAULT_TASK_PRIORITY } from "@/lib/domain/activity";

/** Business-rule violation surfaced to the UI as a readable message. */
export class CrmError extends Error {}

export interface InteractionRefs {
  contactId?: string;
  opportunityId?: string;
  momentEventId?: string;
  /** Second contact reference used by Log Meeting. */
  decisionMakerContactId?: string;
}

/**
 * Cross-entity ownership (review req 2): every referenced entity must exist
 * inside this organization (repositories are org-scoped, so a foreign-org id
 * simply resolves to null) AND belong to the same account as the interaction.
 */
export async function assertInteractionOwnership(
  repos: Repositories,
  accountId: AccountId,
  refs: InteractionRefs,
): Promise<void> {
  const account = await repos.accounts.getById(accountId);
  if (!account) throw new CrmError("ไม่พบ Account นี้ในองค์กร");

  const contactIds = [refs.contactId, refs.decisionMakerContactId].filter(
    (v): v is string => Boolean(v),
  );
  for (const id of contactIds) {
    const contact = await repos.contacts.getById(id as ContactId);
    if (!contact || contact.accountId !== accountId) {
      throw new CrmError("Contact ที่อ้างถึงไม่อยู่ใน Account นี้");
    }
  }
  if (refs.opportunityId) {
    const opp = await repos.opportunities.getById(refs.opportunityId as OpportunityId);
    if (!opp || opp.accountId !== accountId) {
      throw new CrmError("Opportunity ที่อ้างถึงไม่อยู่ใน Account นี้");
    }
  }
  if (refs.momentEventId) {
    const event = await repos.moments.getById(refs.momentEventId as MomentEventId);
    if (!event || event.accountId !== accountId) {
      throw new CrmError("Moment ที่อ้างถึงไม่อยู่ใน Account นี้");
    }
  }
}

export interface FollowUpIntent {
  createFollowUp?: boolean;
  nextAction?: string;
  nextActionAt?: string;
  nextState?: InteractionNextState;
}

/** FOLLOW_UP next-state and "Save + Create Follow-up" both need a next action
 * AND a scheduled date — otherwise the follow-up can never surface in
 * My Work Today bands (Step-3 review item 2). */
export function validateNextState(input: FollowUpIntent): void {
  if (input.nextState === "FOLLOW_UP" || input.createFollowUp) {
    if (!input.nextAction || !input.nextActionAt) {
      throw new CrmError(
        "Follow-up ต้องระบุทั้ง Next Action และวันเวลานัดติดตาม (nextActionAt)",
      );
    }
  }
}

/** Build the follow-up task for the interaction unit-of-work (key derives
 * from the activity's clientRequestId inside the repository). */
export function buildFollowUpTask(
  input: FollowUpIntent & {
    accountId: AccountId;
    contactId?: string;
    opportunityId?: string;
    momentEventId?: string;
  },
  actor: UserId,
): Omit<CreateCrmTaskInput, "clientRequestId"> | undefined {
  if (!input.createFollowUp) return undefined;
  if (!input.nextAction || !input.nextActionAt) {
    throw new CrmError(
      "Follow-up ต้องระบุทั้ง Next Action และวันเวลานัดติดตาม (nextActionAt)",
    );
  }
  return {
    accountId: input.accountId,
    contactId: input.contactId as ContactId | undefined,
    opportunityId: input.opportunityId as OpportunityId | undefined,
    momentEventId: input.momentEventId as MomentEventId | undefined,
    title: input.nextAction,
    dueDate: input.nextActionAt.slice(0, 10),
    assigneeId: actor,
    createdBy: actor,
    priority: DEFAULT_TASK_PRIORITY,
  };
}
