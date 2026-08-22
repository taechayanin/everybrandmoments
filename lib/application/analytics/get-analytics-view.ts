import { getRepositories } from "@/lib/infrastructure";
import { priorityOf, totalScore } from "@/lib/domain/score";

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
  const [accountsPage, events] = await Promise.all([
    repos.accounts.search({ limit: 1000 }),
    repos.moments.listAll(),
  ]);
  const accounts = accountsPage.items;
  return {
    activeAccounts: accounts.filter((a) => a.customerSince).length,
    totalLtv: accounts.reduce((s, a) => s + a.ltv, 0),
    totalGp: accounts.reduce((s, a) => s + a.grossProfit, 0),
    momentsDetected: events.length,
    hotMoments: events.filter((e) => priorityOf(totalScore(e.score)) === "HOT").length,
    momentsWon: events.filter((e) => e.status === "Won").length,
  };
}
