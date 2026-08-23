import type { Account, Appointment, MomentEvent, Opportunity, UserId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { getClock } from "@/lib/services/clock";
import { orgLocalDate } from "@/lib/services/org-time";
import {
  getMyWorkToday,
  type MyWorkTodayView,
} from "@/lib/application/tasks/get-my-work-today";

export interface FeedRow {
  event: MomentEvent;
  account: Account;
  ownerName: string;
}

export interface CommandCenterView {
  today: string; // org-local ISO date
  hotCount: number;
  newThisWeek: number;
  newToday: number;
  qualifiedCount: number;
  proposals: Opportunity[];
  wonThisMonth: number;
  atRiskCount: number;
  feed: FeedRow[];
  appointmentsToday: (Appointment & { accountName: string; consultantName: string })[];
  next30: { event: MomentEvent; account: Account; daysUntil: number }[];
  /** My Work Today (spec §18) — the current user's bands + account names. */
  myWork: MyWorkTodayView;
  taskAccountNames: Record<string, string>;
}

const FEED_LIMIT = 8;
const NEXT30_LIMIT = 20;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000,
  );
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Command Center read model — bounded queries only (Step 5 closes the last
 * listAll debt here): counters come from workStats/stats aggregates, the feed
 * and next-30 lists are bounded filtered reads, and accounts hydrate via one
 * batched getByIds.
 */
export async function getCommandCenter(userId: UserId): Promise<CommandCenterView> {
  const repos = await getRepositories();
  const today = orgLocalDate(getClock().now());

  const [workStats, accountStats, feedPage, next30Events, opportunitiesPage, appointments, myWork] =
    await Promise.all([
      repos.moments.workStats(today),
      repos.accounts.stats(),
      repos.moments.radar({ limit: FEED_LIMIT, activeOnly: true }),
      repos.moments.listFiltered({
        activeOnly: true,
        expectedFrom: today,
        expectedTo: addDays(today, 30),
        limit: NEXT30_LIMIT,
      }),
      repos.opportunities.list({ limit: 100 }),
      repos.appointments.listUpcoming(),
      getMyWorkToday(userId),
    ]);

  // One batched account hydration across every panel that needs names.
  const accountIds = [
    ...new Set([
      ...feedPage.items.map((e) => e.accountId as string),
      ...next30Events.map((e) => e.accountId as string),
      ...appointments.map((a) => a.accountId as string),
      ...[...myWork.overdue, ...myWork.dueToday, ...myWork.upcoming]
        .map((t) => t.accountId)
        .filter((id): id is string => id !== null),
    ]),
  ];
  const [accounts, users] = await Promise.all([
    repos.accounts.getByIds(accountIds as never[]),
    repos.users.listAll(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id as string, a]));
  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.nickname} (${u.name.split(" ")[0]})` : id;
  };

  const feed: FeedRow[] = feedPage.items.flatMap((event) => {
    const account = accountById.get(event.accountId);
    return account ? [{ event, account, ownerName: userName(event.ownerId) }] : [];
  });

  const next30 = next30Events
    .map((event) => ({
      event,
      account: accountById.get(event.accountId),
      daysUntil: daysBetween(today, event.expectedEventDate),
    }))
    .filter(
      (x): x is { event: MomentEvent; account: Account; daysUntil: number } =>
        x.account !== undefined,
    )
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const taskAccountNames: Record<string, string> = {};
  for (const [id, account] of accountById) taskAccountNames[id] = account.name;

  return {
    today,
    hotCount: workStats.activeHot,
    newThisWeek: workStats.newThisWeek,
    newToday: workStats.newToday,
    qualifiedCount: workStats.qualifiedActive,
    proposals: opportunitiesPage.items.filter((o) =>
      ["Proposal", "Negotiation"].includes(o.stage),
    ),
    wonThisMonth: workStats.wonThisMonth,
    atRiskCount: accountStats.atRiskCount,
    feed,
    appointmentsToday: appointments
      .filter((a) => a.datetime.startsWith(today))
      .map((a) => ({
        ...a,
        accountName: accountById.get(a.accountId)?.name ?? a.accountId,
        consultantName: userName(a.consultantId),
      })),
    next30,
    myWork,
    taskAccountNames,
  };
}
