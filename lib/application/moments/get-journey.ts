import type { Account, AccountId, MasterMoment, MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { isActiveMomentStatus } from "@/lib/domain/moment";
import { totalScore } from "@/lib/domain/score";

export interface JourneyView {
  masterMoments: MasterMoment[];
  accountOptions: { id: AccountId; name: string }[];
}

export async function getJourneyView(): Promise<JourneyView> {
  const repos = await getRepositories();
  const [masterMoments, accountsPage] = await Promise.all([
    repos.masterMoments.listAll(),
    repos.accounts.search({ limit: 100 }),
  ]);
  return {
    masterMoments,
    accountOptions: accountsPage.items.map((a) => ({ id: a.id, name: a.name })),
  };
}

export interface AccountJourneyView {
  account: Account;
  events: MomentEvent[];
}

export async function getAccountJourney(
  accountId: AccountId,
): Promise<AccountJourneyView | null> {
  const repos = await getRepositories();
  const account = await repos.accounts.getById(accountId);
  if (!account) return null;
  return { account, events: await repos.moments.listByAccount(accountId) };
}

export interface RevenueJourneyRow {
  event: MomentEvent;
  accountName: string;
}

export async function getRevenueJourney(): Promise<RevenueJourneyRow[]> {
  const repos = await getRepositories();
  const [events, accountsPage] = await Promise.all([
    repos.moments.listAll(),
    repos.accounts.search({ limit: 1000 }),
  ]);
  const nameById = new Map(accountsPage.items.map((a) => [a.id, a.name]));
  return events
    .filter(
      (e) =>
        isActiveMomentStatus(e.status)
          ? ["Qualified", "Meeting Booked", "Discovery Completed", "Solution Design", "Proposal", "Negotiation"].includes(e.status)
          : ["Won", "Delivery"].includes(e.status),
    )
    .sort((a, b) => totalScore(b.score) - totalScore(a.score))
    .map((event) => ({
      event,
      accountName: nameById.get(event.accountId) ?? event.accountId,
    }));
}
