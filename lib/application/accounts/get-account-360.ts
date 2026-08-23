import type {
  Account,
  AccountId,
  Activity,
  ActivitySuggestion,
  CrmContact,
  CrmTask,
  MomentEvent,
  Opportunity,
  Solution,
  WhitespaceCategory,
} from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { recommendSolutions } from "@/lib/application/solutions/recommend-solutions";
import { getAccountTimeline } from "@/lib/application/activities/get-account-timeline";
import { getClock } from "@/lib/services/clock";
import { orgLocalDate } from "@/lib/services/org-time";

/** Serializable contact summary for client components. */
export interface ContactRef {
  name: string;
  jobTitle: string | null;
}

export interface AccountTaskBands {
  today: string; // org-local ISO date
  overdue: CrmTask[];
  dueToday: CrmTask[];
  upcoming: CrmTask[];
  /** Active tasks without a due date — visible so nothing silently hides. */
  unscheduled: CrmTask[];
}

export interface Account360View {
  account: Account;
  activeMoments: MomentEvent[];
  timeline: MomentEvent[];
  whitespaceGaps: WhitespaceCategory[];
  recommendedSolutions: Solution[];
  ownerName: string;
  // ---- CRM Activity Layer (Step 4) ----
  crmTimeline: { items: Activity[]; nextCursor?: string };
  /** contactId -> summary for timeline attribution (plain object — serializable). */
  timelineContacts: Record<string, ContactRef>;
  contacts: CrmContact[];
  taskBands: AccountTaskBands;
  openOpportunities: Opportunity[];
  /** PENDING AI suggestions awaiting human decision (Step 6). */
  pendingSuggestions: ActivitySuggestion[];
}

const ACCOUNT_TASK_LIMIT = 50;

export async function getAccount360(id: AccountId): Promise<Account360View | null> {
  const repos = await getRepositories();
  const account = await repos.accounts.getById(id);
  if (!account) return null;

  // Bounded reads only — one query per panel, batched hydration inside
  // (spec §53; no listAll on any path).
  const [activeMoments, timeline, owner, crmPage, contacts, accountTasks, oppPage, pendingSuggestions] =
    await Promise.all([
      repos.moments.findActiveByAccount(id),
      repos.moments.listByAccount(id),
      repos.users.getById(account.ownerId),
      getAccountTimeline(id, { limit: 20 }),
      repos.contacts.listByAccount(id),
      repos.tasks.listByAccount(id, ACCOUNT_TASK_LIMIT),
      repos.opportunities.list({ limit: 100 }),
      repos.suggestions.listPendingByAccount(id, 5),
    ]);

  const whitespaceGaps = (
    Object.entries(account.whitespace) as [WhitespaceCategory, boolean][]
  )
    .filter(([, bought]) => !bought)
    .map(([cat]) => cat);

  const recommendedSolutions = await recommendSolutions({
    account,
    currentMoment: activeMoments[0] ?? null,
    limit: 3,
  });

  // Work-day boundaries in the organization's timezone (Step-3 review item 3).
  const today = orgLocalDate(getClock().now());
  const active = accountTasks.filter(
    (t) => t.status === "OPEN" || t.status === "IN_PROGRESS",
  );
  const taskBands: AccountTaskBands = {
    today,
    overdue: active.filter((t) => t.dueDate !== null && t.dueDate < today),
    dueToday: active.filter((t) => t.dueDate === today),
    upcoming: active.filter((t) => t.dueDate !== null && t.dueDate > today),
    unscheduled: active.filter((t) => t.dueDate === null),
  };

  const timelineContacts: Record<string, ContactRef> = {};
  for (const [cid, c] of crmPage.contactsById) {
    timelineContacts[cid] = { name: c.name, jobTitle: c.jobTitle };
  }

  return {
    account,
    activeMoments,
    timeline,
    whitespaceGaps,
    recommendedSolutions,
    ownerName: owner ? `${owner.nickname} (${owner.name.split(" ")[0]})` : account.ownerId,
    crmTimeline: { items: crmPage.items, nextCursor: crmPage.nextCursor },
    timelineContacts,
    contacts,
    taskBands,
    pendingSuggestions,
    openOpportunities: oppPage.items.filter(
      (o) => o.accountId === id && !["Won", "Lost"].includes(o.stage),
    ),
  };
}
