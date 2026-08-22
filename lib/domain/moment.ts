import type { AccountId, MomentEventId, SolutionId, UserId } from "./ids";
import type { ScoreBreakdown } from "./score";

/** The 20 master moment codes — the only valid values across the system. */
export type MomentCode =
  | "EBM Start"
  | "EBM Build"
  | "EBM Hire"
  | "EBM Welcome"
  | "EBM Launch"
  | "EBM Sell"
  | "EBM Deliver"
  | "EBM Thanks"
  | "EBM Repeat"
  | "EBM Engage"
  | "EBM Grow"
  | "EBM Milestone"
  | "EBM Celebrate"
  | "EBM Season"
  | "EBM Expand"
  | "EBM Change"
  | "EBM Recover"
  | "EBM Return"
  | "EBM Farewell"
  | "EBM Close";

export const MOMENT_CODES: readonly MomentCode[] = [
  "EBM Start", "EBM Build", "EBM Hire", "EBM Welcome", "EBM Launch",
  "EBM Sell", "EBM Deliver", "EBM Thanks", "EBM Repeat", "EBM Engage",
  "EBM Grow", "EBM Milestone", "EBM Celebrate", "EBM Season", "EBM Expand",
  "EBM Change", "EBM Recover", "EBM Return", "EBM Farewell", "EBM Close",
];

export function isMomentCode(v: string): v is MomentCode {
  return (MOMENT_CODES as readonly string[]).includes(v);
}

export type LifecyclePhase =
  | "START"
  | "BUILD"
  | "LAUNCH"
  | "OPERATE"
  | "GROW"
  | "CHANGE"
  | "EXIT";

export type Stakeholder = "Business" | "Employee" | "Customer" | "Partner";

/** Moment event lifecycle — operational state, NOT the commercial pipeline. */
export type MomentEventStatus =
  | "Detected"
  | "Review"
  | "Contacted"
  | "Qualified"
  | "Meeting Booked"
  | "Discovery Completed"
  | "Solution Design"
  | "Proposal"
  | "Negotiation"
  | "Won"
  | "Lost"
  | "Delivery"
  | "Next Moment";

export type TriggerSource =
  | "Social Signal"
  | "CRM Note"
  | "Lead Form"
  | "Meeting Note"
  | "Order History"
  | "Complaint"
  | "Job Posting"
  | "Website"
  | "News"
  | "Manual"
  | "Rule Engine";

/** Physical / virtual consultation channel. */
export type Channel =
  | "EBM Business Center"
  | "EBM Studio"
  | "EBM Partner Point"
  | "Video Consultation"
  | "Inside Sales";

/** High-level routing mode — distinct from the concrete Channel. */
export type ChannelMode = "ONLINE" | "OFFLINE";

export interface MasterMoment {
  code: MomentCode;
  no: number; // 1..20
  phase: LifecyclePhase;
  description: string;
  color: string;
  discoveryQuestions: string[];
  nextMoments: MomentCode[];
}

export interface MomentEvent {
  id: MomentEventId;
  accountId: AccountId;
  momentType: MomentCode;
  subMoment: string;
  stakeholders: Stakeholder[];
  triggerSource: TriggerSource;
  triggerDetail: string;
  detectedAt: string; // ISO date
  expectedEventDate: string; // ISO date
  score: ScoreBreakdown;
  potentialWalletMin: number;
  potentialWalletMax: number;
  recommendedSolutionIds: SolutionId[];
  recommendedAction: string;
  ownerId: UserId;
  status: MomentEventStatus;
  nextExpectedMoment: MomentCode;
  channel?: Channel;
  // Detection provenance (refactor plan §41) — who/what detected this and
  // whether a human has confirmed it. Manual moments carry none of these.
  detectionConfidence?: number; // 0..1
  detectedBy?: string; // e.g. "RULE-KEYWORD-L2@1.0.0", "claude-opus-5"
  verifiedBy?: UserId;
  verifiedAt?: string; // ISO datetime
}

/** A raw signal observed for an account — the evidence behind a detection. */
export interface MomentSignal {
  id: string; // SIG-...
  accountId: AccountId;
  momentEventId: MomentEventId | null;
  sourceType: TriggerSource;
  sourceRef?: string;
  sourceUrl?: string;
  rawText: string;
  confidence?: number; // 0..1 — set once a detector processes the signal
  detectedAt: string; // ISO datetime
  modelName?: string;
  modelVersion?: string;
}

/** Statuses that mean the moment is still being worked. */
export const ACTIVE_MOMENT_STATUSES: readonly MomentEventStatus[] = [
  "Detected", "Review", "Contacted", "Qualified", "Meeting Booked",
  "Discovery Completed", "Solution Design", "Proposal", "Negotiation",
];

export function isActiveMomentStatus(status: MomentEventStatus): boolean {
  return ACTIVE_MOMENT_STATUSES.includes(status);
}
