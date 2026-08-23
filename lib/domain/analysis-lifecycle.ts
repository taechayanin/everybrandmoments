// AI-analysis outbox state machine (Step-6 review round 2).
//
//   PENDING  — dispatch record written with the CRM save (durable)
//   QUEUED   — enqueue confirmed / retry scheduled (nextRetryAt gates it)
//   PROCESSED— lifecycle INTENTIONALLY completed: suggestion stored, or an
//              explicitly approved terminal skip (deleted/unsupported input,
//              model refusal — recorded in lastError)
//   BLOCKED  — configuration failure (missing key, 401/403): observable,
//              never auto-retried, recoverable via explicit operator reset
//   FAILED   — retry budget exhausted: observable, never auto-retried,
//              recoverable via explicit operator reset
//
// Pure logic lives here so the worker and the tests share one truth.

import type { AnalysisStatus } from "./activity";

export const MAX_ANALYSIS_ATTEMPTS = 5;

/** Exponential backoff per consumed attempt, capped at 6 hours. */
export function analysisRetryDelayMs(attempt: number): number {
  return Math.min(6 * 3_600_000, 15 * 60_000 * 2 ** Math.max(0, attempt - 1));
}

export type AnalysisOutcomeKind =
  | "success"
  | "terminal_skip"   // deleted/unsupported input, model refusal
  | "soft_fail"       // invalid/empty model output — retry later, no DLQ noise
  | "transient_error" // 429/5xx/timeout — rethrow so the queue also retries
  | "config_error";   // missing key / 401 / 403 — block until operator fixes

export interface AnalysisTransition {
  status: AnalysisStatus;
  lastError: string | null;
  nextRetryAt: string | null;
  /** true = the worker should rethrow so queue retry/DLQ semantics apply. */
  rethrow: boolean;
}

/**
 * Decide the next outbox state after one consumed attempt.
 * `attempt` is the attempt number just consumed (1-based).
 */
export function decideAnalysisTransition(
  kind: AnalysisOutcomeKind,
  reason: string,
  attempt: number,
  now: Date,
): AnalysisTransition {
  switch (kind) {
    case "success":
      return { status: "PROCESSED", lastError: null, nextRetryAt: null, rethrow: false };
    case "terminal_skip":
      return { status: "PROCESSED", lastError: reason, nextRetryAt: null, rethrow: false };
    case "config_error":
      return { status: "BLOCKED", lastError: reason, nextRetryAt: null, rethrow: false };
    case "soft_fail":
    case "transient_error": {
      if (attempt >= MAX_ANALYSIS_ATTEMPTS) {
        return {
          status: "FAILED",
          lastError: `max_attempts_exceeded:${reason}`,
          nextRetryAt: null,
          rethrow: false, // terminal — ack, do not spin the queue further
        };
      }
      return {
        status: "QUEUED",
        lastError: reason,
        nextRetryAt: new Date(now.getTime() + analysisRetryDelayMs(attempt)).toISOString(),
        rethrow: kind === "transient_error",
      };
    }
  }
}

export interface AnalysisOutboxRow {
  status: AnalysisStatus | null;
  attemptCount: number;
  nextRetryAt: string | null;
  updatedAt: string;
}

/** Reconciler eligibility — mirrored 1:1 by the worker SQL. */
export function isAnalysisRetryEligible(
  row: AnalysisOutboxRow,
  nowIso: string,
  staleCutoffIso: string,
): boolean {
  if (row.status !== "PENDING" && row.status !== "QUEUED") return false;
  if (row.attemptCount >= MAX_ANALYSIS_ATTEMPTS) return false;
  if (row.updatedAt >= staleCutoffIso) return false;
  if (row.nextRetryAt !== null && row.nextRetryAt > nowIso) return false;
  return true;
}
