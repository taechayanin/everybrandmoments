import type { Account, MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

export interface AccountListRow {
  account: Account;
  currentMoment: MomentEvent | null;
}

export async function searchAccounts(query?: string): Promise<AccountListRow[]> {
  const repos = await getRepositories();
  const page = await repos.accounts.search({ query, limit: 100 });

  // One batched query for every account's active moments (review perf §9).
  const active = await repos.moments.findActiveByAccounts(
    page.items.map((a) => a.id),
  );
  const topByAccount = new Map<string, (typeof active)[number]>();
  for (const event of active) {
    if (!topByAccount.has(event.accountId)) topByAccount.set(event.accountId, event);
  }
  return page.items.map((account) => ({
    account,
    currentMoment: topByAccount.get(account.id) ?? null,
  }));
}
