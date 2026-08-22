import type {
  Account,
  MasterMoment,
  MomentEvent,
  MomentEventId,
  MomentSignal,
  Solution,
} from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

// Sprint 6 acceptance (refactor plan §59): Customer Solution must see
// Moment / Score / Why detected / Evidence / Recommended Solution / Next Action.

export interface MomentEvidenceView {
  event: MomentEvent;
  account: Account;
  master: MasterMoment | null;
  signals: MomentSignal[];
  solutions: Solution[];
  ownerName: string;
  verifierName: string | null;
}

export async function getMomentEvidence(
  id: MomentEventId,
): Promise<MomentEvidenceView | null> {
  const repos = await getRepositories();
  const event = await repos.moments.getById(id);
  if (!event) return null;

  const [account, master, signals, owner] = await Promise.all([
    repos.accounts.getById(event.accountId),
    repos.masterMoments.getByCode(event.momentType),
    repos.signals.listByEvent(event.id),
    repos.users.getById(event.ownerId),
  ]);
  if (!account) return null;

  const solutions: Solution[] = [];
  for (const sid of event.recommendedSolutionIds) {
    const s = await repos.solutions.getById(sid);
    if (s) solutions.push(s);
  }

  let verifierName: string | null = null;
  if (event.verifiedBy) {
    const verifier = await repos.users.getById(event.verifiedBy);
    verifierName = verifier ? `${verifier.nickname} (${verifier.name.split(" ")[0]})` : event.verifiedBy;
  }

  return {
    event,
    account,
    master,
    signals,
    solutions,
    ownerName: owner ? `${owner.nickname} (${owner.name.split(" ")[0]})` : event.ownerId,
    verifierName,
  };
}
