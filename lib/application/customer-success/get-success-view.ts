import type { Account, MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { isActiveMomentStatus } from "@/lib/domain/moment";

export interface SuccessRow {
  event: MomentEvent;
  account: Account;
}

export interface CustomerSuccessView {
  healthyCount: number;
  atRisk: Account[];
  delivered: SuccessRow[];
  recover: SuccessRow[];
  winback: SuccessRow[];
  renewals: SuccessRow[];
}

export async function getCustomerSuccessView(): Promise<CustomerSuccessView> {
  const repos = await getRepositories();
  const [events, accountsPage] = await Promise.all([
    repos.moments.listAll(),
    repos.accounts.search({ limit: 1000 }),
  ]);
  const accountById = new Map(accountsPage.items.map((a) => [a.id, a]));

  const withAccount = (list: MomentEvent[]): SuccessRow[] =>
    list.flatMap((event) => {
      const account = accountById.get(event.accountId);
      return account ? [{ event, account }] : [];
    });

  return {
    healthyCount: accountsPage.items.filter((a) => a.health === "Healthy").length,
    atRisk: accountsPage.items.filter((a) => a.health === "At Risk"),
    delivered: withAccount(
      events
        .filter((e) => ["Won", "Delivery"].includes(e.status))
        .sort((a, b) => b.expectedEventDate.localeCompare(a.expectedEventDate))
        .slice(0, 8),
    ),
    recover: withAccount(
      events.filter((e) => e.momentType === "EBM Recover" && isActiveMomentStatus(e.status)),
    ),
    winback: withAccount(
      events.filter((e) => e.momentType === "EBM Return" && isActiveMomentStatus(e.status)),
    ),
    renewals: withAccount(
      events.filter(
        (e) =>
          ["EBM Repeat", "EBM Season"].includes(e.momentType) &&
          isActiveMomentStatus(e.status),
      ),
    ),
  };
}
