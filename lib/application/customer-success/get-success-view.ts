import type { Account, MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

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

const SECTION_LIMIT = 20;

export async function getCustomerSuccessView(): Promise<CustomerSuccessView> {
  const repos = await getRepositories();
  // One bounded, filtered query per dashboard section — no listAll scans.
  const [accountStats, atRisk, delivered, recover, winback, renewals] =
    await Promise.all([
      repos.accounts.stats(),
      repos.accounts.listByHealth("At Risk", SECTION_LIMIT),
      repos.moments.listFiltered({
        statuses: ["Won", "Delivery"],
        orderByExpectedDateDesc: true,
        limit: 8,
      }),
      repos.moments.listFiltered({
        momentCodes: ["EBM Recover"],
        activeOnly: true,
        limit: SECTION_LIMIT,
      }),
      repos.moments.listFiltered({
        momentCodes: ["EBM Return"],
        activeOnly: true,
        limit: SECTION_LIMIT,
      }),
      repos.moments.listFiltered({
        momentCodes: ["EBM Repeat", "EBM Season"],
        activeOnly: true,
        limit: SECTION_LIMIT,
      }),
    ]);

  // Hydrate the referenced accounts in one batch lookup.
  const accountIds = [
    ...new Set(
      [...delivered, ...recover, ...winback, ...renewals].map((e) => e.accountId),
    ),
  ];
  const accounts = await repos.accounts.getByIds(accountIds);
  const accountById = new Map(accounts.map((a) => [a.id as string, a]));

  const withAccount = (list: MomentEvent[]): SuccessRow[] =>
    list.flatMap((event) => {
      const account = accountById.get(event.accountId);
      return account ? [{ event, account }] : [];
    });

  return {
    healthyCount: accountStats.healthyCount,
    atRisk,
    delivered: withAccount(delivered),
    recover: withAccount(recover),
    winback: withAccount(winback),
    renewals: withAccount(renewals),
  };
}
