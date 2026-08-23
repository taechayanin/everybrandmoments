import { getRepositories } from "@/lib/infrastructure";

export interface AnalyticsView {
  activeAccounts: number;
  totalLtv: number;
  totalGp: number;
  momentsDetected: number;
  hotMoments: number;
  momentsWon: number;
}

export async function getAnalyticsView(): Promise<AnalyticsView> {
  const repos = await getRepositories();
  // Aggregates computed in the store — 2 bounded queries, independent of row count.
  const [accountStats, momentStats] = await Promise.all([
    repos.accounts.stats(),
    repos.moments.stats(),
  ]);
  return {
    activeAccounts: accountStats.activeAccounts,
    totalLtv: accountStats.totalLtv,
    totalGp: accountStats.totalGp,
    momentsDetected: momentStats.detected,
    hotMoments: momentStats.hot,
    momentsWon: momentStats.won,
  };
}
