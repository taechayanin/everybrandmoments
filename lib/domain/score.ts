/** Moment Score — 100 points total (PRD §13). */
export interface ScoreBreakdown {
  businessFit: number; // /30
  intent: number; // /25
  timing: number; // /20
  wallet: number; // /15
  relationship: number; // /10
}

export const SCORE_MAX: Record<keyof ScoreBreakdown, number> = {
  businessFit: 30,
  intent: 25,
  timing: 20,
  wallet: 15,
  relationship: 10,
};

export type Priority = "HOT" | "WARM" | "NURTURE" | "WATCH";

export function totalScore(s: ScoreBreakdown): number {
  return s.businessFit + s.intent + s.timing + s.wallet + s.relationship;
}

export function priorityOf(score: number): Priority {
  if (score >= 85) return "HOT";
  if (score >= 70) return "WARM";
  if (score >= 50) return "NURTURE";
  return "WATCH";
}

export function isValidScore(s: ScoreBreakdown): boolean {
  return (
    (Object.keys(SCORE_MAX) as (keyof ScoreBreakdown)[]).every(
      (k) => s[k] >= 0 && s[k] <= SCORE_MAX[k],
    ) && totalScore(s) <= 100
  );
}
