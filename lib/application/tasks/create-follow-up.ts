import { getRepositories } from "@/lib/infrastructure";
import type { CreateTaskInput } from "@/lib/contracts/crm";
import { DEFAULT_TASK_PRIORITY } from "@/lib/domain/activity";
import type { AccountId, CrmTask, TaskId, UserId } from "@/lib/types";
import { CrmError, assertInteractionOwnership } from "../activities/shared";

/**
 * ✅ Create Task / Follow-up (spec §17). If accountId is absent it is derived
 * from the referenced opportunity/moment/contact so a task can never point at
 * entities of two different accounts.
 */
export async function createFollowUp(
  input: CreateTaskInput & { createdBy: UserId },
): Promise<{ task: CrmTask; created: boolean }> {
  const repos = await getRepositories();

  let accountId = input.accountId as AccountId | undefined;
  if (!accountId) {
    if (input.opportunityId) {
      const opp = await repos.opportunities.getById(input.opportunityId as never);
      if (!opp) throw new CrmError("ไม่พบ Opportunity นี้ในองค์กร");
      accountId = opp.accountId;
    } else if (input.momentEventId) {
      const event = await repos.moments.getById(input.momentEventId as never);
      if (!event) throw new CrmError("ไม่พบ Moment นี้ในองค์กร");
      accountId = event.accountId;
    } else if (input.contactId) {
      const contact = await repos.contacts.getById(input.contactId as never);
      if (!contact) throw new CrmError("ไม่พบ Contact นี้ในองค์กร");
      accountId = contact.accountId as AccountId;
    }
  }
  if (accountId) {
    await assertInteractionOwnership(repos, accountId, input);
  }

  return repos.tasks.create({
    accountId,
    contactId: input.contactId as never,
    momentEventId: input.momentEventId as never,
    opportunityId: input.opportunityId as never,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    assigneeId: (input.assigneeId as UserId | undefined) ?? input.createdBy,
    createdBy: input.createdBy,
    // Business default lives here, not in the adapter (review item 1).
    priority: input.priority ?? DEFAULT_TASK_PRIORITY,
    clientRequestId: input.clientRequestId,
  });
}

/** Idempotent completion; returns the task for revalidation targeting. */
export async function completeTask(
  taskId: TaskId,
): Promise<{ changed: boolean; task: CrmTask | null }> {
  const repos = await getRepositories();
  const changed = await repos.tasks.complete(taskId);
  const task = await repos.tasks.getById(taskId);
  return { changed, task };
}
