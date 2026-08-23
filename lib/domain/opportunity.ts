import type { AccountId, MomentEventId, OpportunityId, UserId } from "./ids";
import type { Channel } from "./moment";

/**
 * Commercial pipeline stage — a separate state machine from
 * MomentEventStatus (refactor plan §10).
 */
export type OpportunityStage =
  | "Discovery"
  | "Solution Design"
  | "Proposal"
  | "Negotiation"
  | "Won"
  | "Lost";

export const OPPORTUNITY_STAGES: readonly OpportunityStage[] = [
  "Discovery", "Solution Design", "Proposal", "Negotiation", "Won", "Lost",
];

export interface Opportunity {
  id: OpportunityId;
  momentEventId: MomentEventId;
  accountId: AccountId;
  name: string;
  expectedRevenue: number;
  expectedGP: number; // 0..1
  closeDate: string;
  stage: OpportunityStage;
  ownerId: UserId;
  nextAction: string;
  slaHours?: number;
  channel?: Channel;
  /** ISO — the no-contact fallback reference when no activity exists yet. */
  createdAt: string;
}

export const CLOSED_OPPORTUNITY_STAGES: readonly OpportunityStage[] = ["Won", "Lost"];

/** No-contact risk threshold (spec §27) — one canonical rule for counters
 * and per-row display alike. */
export const NO_CONTACT_RISK_DAYS = 7;

/** Full days since last contact; an opportunity that has never had an
 * activity falls back to its creation time (COALESCE semantics —
 * Step-5 review fix 2). */
export function daysSinceOpportunityContact(
  lastActivityAt: string | null,
  createdAt: string,
  now: Date,
): number {
  const reference = lastActivityAt ?? createdAt;
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(reference).getTime()) / 86_400_000),
  );
}

export function isOpportunityAtRisk(
  stage: OpportunityStage,
  lastActivityAt: string | null,
  createdAt: string,
  now: Date,
): boolean {
  if (CLOSED_OPPORTUNITY_STAGES.includes(stage)) return false;
  return daysSinceOpportunityContact(lastActivityAt, createdAt, now) >= NO_CONTACT_RISK_DAYS;
}

export interface Appointment {
  id: string;
  accountId: AccountId;
  momentEventId: MomentEventId;
  center: Channel;
  datetime: string;
  consultantId: UserId;
  need: string;
  expectedWallet: number;
  samples: string[];
  status: "Booked" | "Visited" | "No-show" | "Completed";
}
