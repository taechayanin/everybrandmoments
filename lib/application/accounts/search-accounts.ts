import type { Account, MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

export interface AccountListRow {
  account: Account;
  currentMoment: MomentEvent | null;
}

export async function searchAccounts(query?: string): Promise<AccountListRow[]> {
  const repos = await getRepositories();
  const page = await repos.accounts.search({ query, limit: 100 });

  const rows: AccountListRow[] = [];
  for (const account of page.items) {
    const active = await repos.moments.findActiveByAccount(account.id);
    rows.push({ account, currentMoment: active[0] ?? null });
  }
  return rows;
}
