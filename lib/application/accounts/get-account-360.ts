import type {
  Account,
  AccountId,
  MomentEvent,
  Solution,
  WhitespaceCategory,
} from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { recommendSolutions } from "@/lib/application/solutions/recommend-solutions";

export interface Account360View {
  account: Account;
  activeMoments: MomentEvent[];
  timeline: MomentEvent[];
  whitespaceGaps: WhitespaceCategory[];
  recommendedSolutions: Solution[];
  ownerName: string;
}

export async function getAccount360(id: AccountId): Promise<Account360View | null> {
  const repos = await getRepositories();
  const account = await repos.accounts.getById(id);
  if (!account) return null;

  const [activeMoments, timeline, owner] = await Promise.all([
    repos.moments.findActiveByAccount(id),
    repos.moments.listByAccount(id),
    repos.users.getById(account.ownerId),
  ]);

  const whitespaceGaps = (
    Object.entries(account.whitespace) as [WhitespaceCategory, boolean][]
  )
    .filter(([, bought]) => !bought)
    .map(([cat]) => cat);

  const recommendedSolutions = await recommendSolutions({
    account,
    currentMoment: activeMoments[0] ?? null,
    limit: 3,
  });

  return {
    account,
    activeMoments,
    timeline,
    whitespaceGaps,
    recommendedSolutions,
    ownerName: owner ? `${owner.nickname} (${owner.name.split(" ")[0]})` : account.ownerId,
  };
}
