import type { Account, MomentEvent, Priority, TriggerSource, UserId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

export interface RadarRow {
  event: MomentEvent;
  account: Account;
  ownerName: string;
}

export interface MomentRadarInput {
  priority?: Priority;
  triggerSources?: TriggerSource[];
  ownerId?: UserId;
  limit?: number;
  cursor?: string;
}

export interface MomentRadarView {
  rows: RadarRow[];
  nextCursor?: string;
}

export async function getMomentRadar(input: MomentRadarInput): Promise<MomentRadarView> {
  const repos = await getRepositories();
  const page = await repos.moments.radar({
    priority: input.priority,
    triggerSources: input.triggerSources,
    ownerId: input.ownerId,
    activeOnly: true,
    limit: input.limit ?? 50,
    cursor: input.cursor,
  });

  // Batch read model (review perf §9): collect ids once, two bulk queries,
  // hydrate via Maps — never one query per row.
  const accountIds = [...new Set(page.items.map((e) => e.accountId))];
  const ownerIds = [...new Set(page.items.map((e) => e.ownerId))];
  const [accounts, owners] = await Promise.all([
    repos.accounts.getByIds(accountIds),
    repos.users.getByIds(ownerIds),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const ownerMap = new Map(owners.map((u) => [u.id, u]));

  const rows: RadarRow[] = [];
  for (const event of page.items) {
    const account = accountMap.get(event.accountId);
    if (!account) continue; // broken reference — skip rather than crash
    const owner = ownerMap.get(event.ownerId);
    rows.push({
      event,
      account,
      ownerName: owner ? `${owner.nickname} (${owner.name.split(" ")[0]})` : event.ownerId,
    });
  }
  return { rows, nextCursor: page.nextCursor };
}
