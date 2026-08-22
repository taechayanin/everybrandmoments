import type { Priority, ScoreBreakdown } from "@/lib/types";
import { isValidScore, priorityOf, totalScore } from "@/lib/domain/score";

export interface ScoredMoment {
  total: number;
  priority: Priority;
  valid: boolean;
}

/** Scores a breakdown against the 30/25/20/15/10 formula (PRD §13). */
export function scoreMoment(breakdown: ScoreBreakdown): ScoredMoment {
  const total = totalScore(breakdown);
  return { total, priority: priorityOf(total), valid: isValidScore(breakdown) };
}
