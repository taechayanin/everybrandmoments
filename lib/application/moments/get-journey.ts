import type { Account, AccountId, MasterMoment, MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
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
  // Bounded, filtered read (Step 7 closes the last production listAll):
  // exactly the statuses this view shows, capped, then one batched
  // account-name hydration.
  const events = await repos.moments.listFiltered({
    statuses: [
      "Qualified", "Meeting Booked", "Discovery Completed", "Solution Design",
      "Proposal", "Negotiation", "Won", "Delivery",
    ],
    limit: 100,
  });
  const accounts = await repos.accounts.getByIds([
    ...new Set(events.map((e) => e.accountId)),
  ]);
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));
  return [...events]
    .sort((a, b) => totalScore(b.score) - totalScore(a.score))
    .map((event) => ({
      event,
      accountName: nameById.get(event.accountId) ?? event.accountId,
    }));
}
