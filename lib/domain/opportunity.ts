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
