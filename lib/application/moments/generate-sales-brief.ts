import type { MomentEventId } from "@/lib/types";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { getClock } from "@/lib/services/clock";
import { getMomentEvidence } from "./get-moment-evidence";

// AI Sales Brief (PRD §46 / AI 5). Deterministic template over live data —
// answers Why Now / What Moment / Who / What to Ask / What to Sell before a
// call. An LLM narrative version can replace the template behind the same
// signature without touching callers.

export interface SalesBrief {
  accountName: string;
  momentLine: string;
  scoreLine: string;
  whyNow: string[];
  expectedDate: string;
  wallet: string;
  solutions: string[];
  discoveryQuestions: string[];
  action: string;
  nextMoment: string;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000,
  );
}

export async function generateSalesBrief(
  id: MomentEventId,
): Promise<SalesBrief | null> {
  const view = await getMomentEvidence(id);
  if (!view) return null;

  const { event, account, master, signals, solutions } = view;
  const score = totalScore(event.score);
  const today = getClock().now().toISOString().slice(0, 10);
  const days = daysBetween(today, event.expectedEventDate);

  const whyNow: string[] = [];
  whyNow.push(`${event.triggerSource}: ${event.triggerDetail}`);
  for (const s of signals) {
    whyNow.push(`${s.sourceType}: ${s.rawText.slice(0, 120)}${s.rawText.length > 120 ? "…" : ""}`);
  }
  if (account.notes) whyNow.push(`Account note: ${account.notes}`);

  const fmt = (n: number) =>
    n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : `฿${Math.round(n / 1000)}K`;

  return {
    accountName: account.name,
    momentLine: `${event.momentType} — ${event.subMoment}`,
    scoreLine: `${score} / ${priorityOf(score)}`,
    whyNow,
    expectedDate:
      days > 0 ? `${event.expectedEventDate} (อีก ${days} วัน)` : event.expectedEventDate,
    wallet: `${fmt(event.potentialWalletMin)}–${fmt(event.potentialWalletMax)}`,
    solutions: solutions.map((s) => s.name),
    discoveryQuestions: (master?.discoveryQuestions ?? []).slice(0, 5),
    action: event.recommendedAction,
    nextMoment: event.nextExpectedMoment,
  };
}
