import type {
  Account,
  CrmTask,
  MomentEvent,
  UserId,
} from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { getClock } from "@/lib/services/clock";
import { orgLocalDate } from "@/lib/services/org-time";

// Step 7 — operational account list (spec §47–§48): the Accounts screen
// answers "ใครต้องถูกดูแลตอนนี้" from ONE bounded read model:
//   1 account page (cap) + 4 bulk queries (active moments, last activity,
//   next open task, open opportunities) — no per-account loops, no listAll.
// Derived filters (HOT / no-contact / due-today ...) are computed here in the
// application layer over that bounded set; org-local day semantics
// throughout. When the org outgrows the cap, the same filters push down to
// SQL — the UI contract stays identical.

export const ACCOUNT_LIST_FILTERS = [
  "ALL",
  "MY",
  "HOT",
  "NO_FOLLOWUP",
  "NO_CONTACT_7",
  "NO_CONTACT_14",
  "NO_CONTACT_30",
  "AT_RISK",
  "OPEN_OPP",
  "DUE_TODAY",
  "OVERDUE",
] as const;
export type AccountListFilter = (typeof ACCOUNT_LIST_FILTERS)[number];

export function isAccountListFilter(v: string): v is AccountListFilter {
  return (ACCOUNT_LIST_FILTERS as readonly string[]).includes(v);
}

export interface AccountListRow {
  account: Account;
  currentMoment: MomentEvent | null;
  momentScore: number | null;
  priority: "HOT" | "WARM" | "NURTURE" | "WATCH" | null;
  lastActivityAt: string | null;
  /** null = ไม่เคยมี activity เลย (นับเป็น no-contact ทุก threshold). */
  daysSinceLastActivity: number | null;
  nextFollowUp: CrmTask | null;
  openOpportunityCount: number;
  openPipelineValue: number;
}

export interface AccountListView {
  rows: AccountListRow[];
  totalBeforeFilter: number;
  today: string; // org-local
  filter: AccountListFilter;
}

/** Candidate cap — bounded read model, not a full scan (org pilot ≤100). */
const CANDIDATE_LIMIT = 100;
const PAGE_LIMIT = 50;

function matchesNoContact(days: number | null, threshold: number): boolean {
  // Never-contacted accounts are the worst case — always included.
  return days === null || days >= threshold;
}

export async function getAccountList(
  filter: AccountListFilter,
  currentUserId: UserId,
): Promise<AccountListView> {
  const repos = await getRepositories();
  const today = orgLocalDate(getClock().now());
  const now = getClock().now().getTime();

  const page = await repos.accounts.search({ limit: CANDIDATE_LIMIT });
  const ids = page.items.map((a) => a.id);

  // Four bulk queries — one per panel of information, chunked ≤50 inside.
  const [activeMoments, lastActivity, nextTasks, oppPage] = await Promise.all([
    repos.moments.findActiveByAccounts(ids),
    repos.activities.lastActivityByAccounts(ids),
    repos.tasks.nextOpenTaskByAccounts(ids),
    repos.opportunities.list({ limit: 100 }),
  ]);

  const topMoment = new Map<string, MomentEvent>();
  for (const event of activeMoments) {
    if (!topMoment.has(event.accountId)) topMoment.set(event.accountId, event);
  }
  const openOpps = new Map<string, { count: number; value: number }>();
  for (const o of oppPage.items) {
    if (o.status !== "ACTIVE") continue;
    const entry = openOpps.get(o.accountId) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += o.expectedRevenue;
    openOpps.set(o.accountId, entry);
  }

  const rows: AccountListRow[] = page.items.map((account) => {
    const moment = topMoment.get(account.id) ?? null;
    const score = moment ? totalScore(moment.score) : null;
    const lastAt = lastActivity.get(account.id) ?? null;
    return {
      account,
      currentMoment: moment,
      momentScore: score,
      priority: score !== null ? priorityOf(score) : null,
      lastActivityAt: lastAt,
      daysSinceLastActivity: lastAt
        ? Math.max(0, Math.floor((now - new Date(lastAt).getTime()) / 86_400_000))
        : null,
      nextFollowUp: nextTasks.get(account.id) ?? null,
      openOpportunityCount: openOpps.get(account.id)?.count ?? 0,
      openPipelineValue: openOpps.get(account.id)?.value ?? 0,
    };
  });

  const filtered = rows.filter((row) => {
    switch (filter) {
      case "ALL":
        return true;
      case "MY":
        return row.account.ownerId === currentUserId;
      case "HOT":
        return row.priority === "HOT";
      case "NO_FOLLOWUP":
        return row.nextFollowUp === null;
      case "NO_CONTACT_7":
        return matchesNoContact(row.daysSinceLastActivity, 7);
      case "NO_CONTACT_14":
        return matchesNoContact(row.daysSinceLastActivity, 14);
      case "NO_CONTACT_30":
        return matchesNoContact(row.daysSinceLastActivity, 30);
      case "AT_RISK":
        return row.account.health === "At Risk";
      case "OPEN_OPP":
        return row.openOpportunityCount > 0;
      case "DUE_TODAY":
        return row.nextFollowUp?.dueDate === today;
      case "OVERDUE":
        return (
          row.nextFollowUp?.dueDate !== undefined &&
          row.nextFollowUp !== null &&
          row.nextFollowUp.dueDate !== null &&
          row.nextFollowUp.dueDate < today
        );
    }
  });

  // Operational sort: moment score first (HOT on top), then account score.
  filtered.sort(
    (a, b) =>
      (b.momentScore ?? -1) - (a.momentScore ?? -1) ||
      b.account.accountScore - a.account.accountScore,
  );

  return {
    rows: filtered.slice(0, PAGE_LIMIT),
    totalBeforeFilter: rows.length,
    today,
    filter,
  };
}
