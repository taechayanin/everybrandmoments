import type { Account, Appointment, MomentEvent, Opportunity } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { isActiveMomentStatus } from "@/lib/domain/moment";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { getClock } from "@/lib/services/clock";

export interface FeedRow {
  event: MomentEvent;
  account: Account;
  ownerName: string;
}

export interface CommandCenterView {
  today: string; // ISO date
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
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000,
  );
}

export async function getCommandCenter(): Promise<CommandCenterView> {
  const repos = await getRepositories();
  const today = getClock().now().toISOString().slice(0, 10);

  const [events, opportunitiesPage, appointments, accountsPage] = await Promise.all([
    repos.moments.listAll(),
    repos.opportunities.list({ limit: 100 }),
    repos.appointments.listUpcoming(),
    repos.accounts.search({ limit: 1000 }),
  ]);
  const opportunities = opportunitiesPage.items;
  const accountById = new Map(accountsPage.items.map((a) => [a.id, a]));
  const users = await repos.users.listAll();
  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.nickname} (${u.name.split(" ")[0]})` : id;
  };

  const active = events.filter((e) => isActiveMomentStatus(e.status));
  const feed = [...active]
    .sort((a, b) => totalScore(b.score) - totalScore(a.score))
    .slice(0, 8)
    .flatMap((event) => {
      const account = accountById.get(event.accountId);
      return account ? [{ event, account, ownerName: userName(event.ownerId) }] : [];
    });

  const next30 = active
    .map((event) => ({
      event,
      account: accountById.get(event.accountId),
      daysUntil: daysBetween(today, event.expectedEventDate),
    }))
    .filter(
      (x): x is { event: MomentEvent; account: Account; daysUntil: number } =>
        x.account !== undefined && x.daysUntil >= 0 && x.daysUntil <= 30,
    );

  return {
    today,
    hotCount: active.filter((e) => priorityOf(totalScore(e.score)) === "HOT").length,
    newThisWeek: events.filter((e) => {
      const d = daysBetween(e.detectedAt, today);
      return d >= 0 && d <= 7;
    }).length,
    newToday: events.filter((e) => e.detectedAt === today).length,
    qualifiedCount: active.filter((e) =>
      ["Qualified", "Meeting Booked", "Discovery Completed", "Solution Design"].includes(
        e.status,
      ),
    ).length,
    proposals: opportunities.filter((o) =>
      ["Proposal", "Negotiation"].includes(o.stage),
    ),
    wonThisMonth: events.filter(
      (e) => e.status === "Won" && e.expectedEventDate.slice(0, 7) === today.slice(0, 7),
    ).length,
    atRiskCount: accountsPage.items.filter((a) => a.health === "At Risk").length,
    feed,
    appointmentsToday: appointments
      .filter((a) => a.datetime.startsWith(today))
      .map((a) => ({
        ...a,
        accountName: accountById.get(a.accountId)?.name ?? a.accountId,
        consultantName: userName(a.consultantId),
      })),
    next30,
  };
}
