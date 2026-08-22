import type {
  Account,
  AccountId,
  MasterMoment,
  MomentEvent,
  Solution,
} from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

export interface WorkspaceEventView {
  event: MomentEvent;
  master: MasterMoment | null;
  /** Explicitly recommended solutions first, then other moment solutions. */
  solutions: Solution[];
}

export interface WorkspaceView {
  accountOptions: { id: AccountId; name: string }[];
  account: Account;
  events: WorkspaceEventView[];
  previousMoments: MomentEvent[];
  currentUserId: string;
}

export async function getWorkspaceView(
  accountId: AccountId,
): Promise<WorkspaceView | null> {
  const repos = await getRepositories();
  const account = await repos.accounts.getById(accountId);
  if (!account) return null;

  const [accountsPage, activeEvents, allAccountEvents] = await Promise.all([
    repos.accounts.search({ limit: 100 }),
    repos.moments.findActiveByAccount(accountId),
    repos.moments.listByAccount(accountId),
  ]);

  const events: WorkspaceEventView[] = [];
  for (const event of activeEvents) {
    const master = await repos.masterMoments.getByCode(event.momentType);
    const recommended: Solution[] = [];
    const seen = new Set<string>();
    for (const id of event.recommendedSolutionIds) {
      const s = await repos.solutions.getById(id);
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        recommended.push(s);
      }
    }
    for (const s of await repos.solutions.listByMoment(event.momentType)) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        recommended.push(s);
      }
    }
    events.push({ event, master, solutions: recommended.slice(0, 5) });
  }

  return {
    accountOptions: accountsPage.items.map((a) => ({ id: a.id, name: a.name })),
    account,
    events,
    previousMoments: allAccountEvents.filter((e) =>
      ["Won", "Delivery"].includes(e.status),
    ),
    // Auth arrives in Phase 2 Sprint 7 — until then the demo persona owns writes.
    currentUserId: "USR-010",
  };
}
