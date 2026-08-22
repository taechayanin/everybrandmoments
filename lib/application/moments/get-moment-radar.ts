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

  const rows: RadarRow[] = [];
  for (const event of page.items) {
    const [account, owner] = await Promise.all([
      repos.accounts.getById(event.accountId),
      repos.users.getById(event.ownerId),
    ]);
    if (!account) continue; // broken reference — skip rather than crash
    rows.push({
      event,
      account,
      ownerName: owner ? `${owner.nickname} (${owner.name.split(" ")[0]})` : event.ownerId,
    });
  }
  return { rows, nextCursor: page.nextCursor };
}
