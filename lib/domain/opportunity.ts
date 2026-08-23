import type {
  AccountId,
  IndustryId,
  MomentEventId,
  OpportunityId,
  ProjectTypeId,
  UserId,
} from "./ids";
import type { Channel } from "./moment";
import { isSelectableProjectType } from "./industry";

// Project Pipeline Step 2 — the Opportunity entity IS the "Project"
// (plan §1: evolution, not duplication). Two separate axes:
//   Project Status  (lifecycle):  DRAFT → ACTIVE → WON | LOST | CANCELLED
//   Sales Stage     (funnel, ACTIVE only): NEW_BRIEF → … → NEGOTIATION
// DRAFT/WON/LOST/CANCELLED never carry a stage — enforced here, by zod at the
// boundary, AND by paired CHECK constraints in migration 0010 (drift test).

export type ProjectStatus = "DRAFT" | "ACTIVE" | "WON" | "LOST" | "CANCELLED";

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "DRAFT", "ACTIVE", "WON", "LOST", "CANCELLED",
];

export type SalesStage =
  | "NEW_BRIEF"
  | "DISCOVERY"
  | "QUALIFIED"
  | "SOLUTION_DESIGN"
  | "PROPOSAL"
  | "NEGOTIATION";

export const SALES_STAGES: readonly SalesStage[] = [
  "NEW_BRIEF", "DISCOVERY", "QUALIFIED", "SOLUTION_DESIGN", "PROPOSAL", "NEGOTIATION",
];

export function isProjectStatus(v: string): v is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(v);
}

export function isSalesStage(v: string): v is SalesStage {
  return (SALES_STAGES as readonly string[]).includes(v);
}

/** Thai-first UI labels (handoff §18) — codes stay language-neutral. */
export const PROJECT_STATUS_TH: Record<ProjectStatus, string> = {
  DRAFT: "ฉบับร่าง",
  ACTIVE: "กำลังดำเนินการ",
  WON: "ปิดสำเร็จ",
  LOST: "ไม่สำเร็จ",
  CANCELLED: "ยกเลิก",
};

export const SALES_STAGE_TH: Record<SalesStage, string> = {
  NEW_BRIEF: "บรีฟใหม่",
  DISCOVERY: "ค้นหาความต้องการ",
  QUALIFIED: "ผ่านคุณสมบัติ",
  SOLUTION_DESIGN: "ออกแบบโซลูชัน",
  PROPOSAL: "ใบเสนอราคา",
  NEGOTIATION: "ต่อรอง",
};

export const CLOSED_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "WON", "LOST", "CANCELLED",
];

export interface Opportunity {
  id: OpportunityId;
  momentEventId: MomentEventId;
  accountId: AccountId;
  name: string;
  status: ProjectStatus;
  /** Non-null exactly when status = ACTIVE (paired CHECK in 0010). */
  salesStage: SalesStage | null;
  /** Commercial context snapshot on the project itself (plan P1 #1) —
   * null only while DRAFT / on unmapped legacy rows. */
  industryId: IndustryId | null;
  subIndustryId: IndustryId | null;
  /** Master reference only — PT-UNSPECIFIED marks migrated legacy rows and
   * never satisfies activation for new projects. Null only while DRAFT. */
  projectTypeId: ProjectTypeId | null;
  brief: string | null;
  expectedRevenue: number;
  expectedGP: number; // 0..1
  closeDate: string; // expected close (ISO date)
  expectedDeliveryDate: string | null;
  ownerId: UserId;
  nextAction: string;
  nextActionDate: string | null; // org-local ISO date
  lostReason: string | null;
  cancelReason: string | null;
  clientRequestId: string | null;
  slaHours?: number;
  channel?: Channel;
  /** ISO — the no-contact fallback reference when no activity exists yet. */
  createdAt: string;
  updatedAt: string;
}

/** status ↔ stage pairing — the one rule every row must satisfy. */
export function isValidStatusStagePair(
  status: ProjectStatus,
  salesStage: SalesStage | null,
): boolean {
  return status === "ACTIVE" ? salesStage !== null : salesStage === null;
}

/**
 * Activation gate (DRAFT → ACTIVE, reviewer §17): every required context
 * field, and the project type must be a REAL selectable master entry —
 * PT-UNSPECIFIED never satisfies activation for new projects.
 * Returns the list of missing/invalid fields (empty = may activate).
 */
export interface ActivationGateInput {
  accountId: AccountId | null;
  industryId: IndustryId | null;
  momentEventId: MomentEventId | null;
  projectTypeId: ProjectTypeId | null;
  ownerId: UserId | null;
  expectedRevenue: number | null;
  nextAction: string | null;
  nextActionDate: string | null;
}

export function activationGateErrors(input: ActivationGateInput): string[] {
  const errors: string[] = [];
  if (!input.accountId) errors.push("account");
  if (!input.industryId) errors.push("industry");
  if (!input.momentEventId) errors.push("moment");
  if (!input.projectTypeId || !isSelectableProjectType(input.projectTypeId)) {
    errors.push("project_type");
  }
  if (!input.ownerId) errors.push("owner");
  if (input.expectedRevenue === null || input.expectedRevenue < 0) {
    errors.push("estimated_revenue");
  }
  if (!input.nextAction?.trim()) errors.push("next_action");
  if (!input.nextActionDate) errors.push("next_action_date");
  return errors;
}

/**
 * Legacy stage → status × salesStage (migration 0010 mapping, plan §1).
 * Closed rows keep NO synthetic closing stage (reviewer decision #2).
 * The same mapping drives the mock fixtures and the 0010 CASE SQL.
 */
export function legacyStageToStatusStage(legacy: string): {
  status: ProjectStatus;
  salesStage: SalesStage | null;
} {
  switch (legacy) {
    case "Discovery":
      return { status: "ACTIVE", salesStage: "DISCOVERY" };
    case "Solution Design":
      return { status: "ACTIVE", salesStage: "SOLUTION_DESIGN" };
    case "Proposal":
      return { status: "ACTIVE", salesStage: "PROPOSAL" };
    case "Negotiation":
      return { status: "ACTIVE", salesStage: "NEGOTIATION" };
    case "Won":
      return { status: "WON", salesStage: null };
    case "Lost":
      return { status: "LOST", salesStage: null };
    default:
      throw new Error(`Unknown legacy opportunity stage: ${legacy}`);
  }
}

/** lost_reason backfill for legacy Lost rows (0010) — historical truth is
 * "no reason recorded", never a fabricated business reason. */
export const LEGACY_LOST_REASON = "legacy: ไม่ได้บันทึกเหตุผล (ข้อมูลเก่า)";

// ---------- Lifecycle transitions (Step 3 — canonical, single source) ----------

/** Status transitions (plan §1): DRAFT→ACTIVE via the activation gate;
 * ACTIVE closes to WON/LOST; CANCELLED from DRAFT or ACTIVE; terminals stay. */
export function canTransitionStatus(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  switch (from) {
    case "DRAFT":
      return to === "ACTIVE" || to === "CANCELLED";
    case "ACTIVE":
      return to === "WON" || to === "LOST" || to === "CANCELLED";
    default:
      return false; // WON / LOST / CANCELLED are terminal
  }
}

/** Newly activated projects always enter the funnel here. */
export const ACTIVATION_STAGE: SalesStage = "NEW_BRIEF";

/**
 * Sales-stage moves within ACTIVE (canonical rule): forward any number of
 * steps; backward exactly one step (use case requires a reason for it).
 * No synthetic Won/Lost stages exist — closing is a STATUS change.
 */
export function canChangeSalesStage(from: SalesStage, to: SalesStage): boolean {
  const fromIdx = SALES_STAGES.indexOf(from);
  const toIdx = SALES_STAGES.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return false;
  return toIdx > fromIdx || fromIdx - toIdx === 1;
}

export function isBackwardStageMove(from: SalesStage, to: SalesStage): boolean {
  return SALES_STAGES.indexOf(to) < SALES_STAGES.indexOf(from);
}

/**
 * Legacy migrated rows may sit ACTIVE with PT-UNSPECIFIED / missing context.
 * They stay readable and stage-operable; this flag lets the UI surface
 * "enrich me" without blocking normal work (reviewer §2).
 */
export function hasIncompleteContext(o: {
  status: ProjectStatus;
  industryId: IndustryId | null;
  projectTypeId: ProjectTypeId | null;
  nextActionDate: string | null;
}): boolean {
  if (o.status !== "ACTIVE") return false;
  return (
    o.industryId === null ||
    o.projectTypeId === null ||
    !isSelectableProjectType(o.projectTypeId) ||
    o.nextActionDate === null
  );
}

// ---------- Idempotency fingerprint (Step 3 — conflict detection) ----------

/**
 * Stable fingerprint of the fields that make two create requests "the same
 * logical request". A retry matches; a materially different payload under the
 * same client_request_id is an IDEMPOTENCY_CONFLICT and must be rejected,
 * never silently resolved to the original row.
 */
export interface ProjectCreateFingerprintInput {
  accountId: AccountId;
  momentEventId: MomentEventId;
  name: string;
  status: ProjectStatus;
  expectedRevenue: number;
  expectedGP: number;
  closeDate: string;
  expectedDeliveryDate: string | null;
  industryId: IndustryId | null;
  subIndustryId: IndustryId | null;
  projectTypeId: ProjectTypeId | null;
  ownerId: UserId;
  brief: string | null;
  nextAction: string;
  nextActionDate: string | null;
  /** Deterministic: compared as a SORTED set — order never matters. */
  solutionIds: readonly string[];
}

export function projectCreateFingerprint(
  input: ProjectCreateFingerprintInput,
): string {
  return [
    input.accountId, input.momentEventId, input.name.trim(), input.status,
    String(input.expectedRevenue), String(input.expectedGP),
    input.closeDate, input.expectedDeliveryDate ?? "-",
    input.industryId ?? "-", input.subIndustryId ?? "-",
    input.projectTypeId ?? "-", input.ownerId,
    (input.brief ?? "").trim() || "-",
    input.nextAction.trim(), input.nextActionDate ?? "-",
    [...input.solutionIds].sort().join(","),
  ].join("|");
}

export class IdempotencyConflictError extends Error {
  constructor(clientRequestId: string) {
    super(
      `IDEMPOTENCY_CONFLICT: client_request_id ${clientRequestId} was already used with a different payload`,
    );
    this.name = "IdempotencyConflictError";
  }
}

// ---------- Risk evaluation (reviewer §11 — rules only, no automation) ----------

export type ProjectRiskFlag =
  | "NO_NEXT_ACTION"
  | "OVERDUE_NEXT_ACTION"
  | "NO_RECENT_ACTIVITY"
  | "STUCK_IN_STAGE"
  | "INCOMPLETE_CONTEXT";

/** Days a project may sit in one sales stage before it counts as stuck. */
export const STAGE_STUCK_DAYS = 14;

export interface ProjectRiskInput {
  status: ProjectStatus;
  industryId: IndustryId | null;
  projectTypeId: ProjectTypeId | null;
  nextAction: string | null;
  nextActionDate: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  /** changed_at of the latest stage-history entry (null = none recorded). */
  lastStageChangeAt: string | null;
  /** org-local date (YYYY-MM-DD) for "today". */
  today: string;
  now: Date;
}

/** Pure rule set — ACTIVE projects only; DRAFT and closed carry no risk. */
export function projectRiskFlags(input: ProjectRiskInput): ProjectRiskFlag[] {
  if (input.status !== "ACTIVE") return [];
  const flags: ProjectRiskFlag[] = [];
  if (!input.nextAction?.trim() || !input.nextActionDate) {
    flags.push("NO_NEXT_ACTION");
  } else if (input.nextActionDate < input.today) {
    flags.push("OVERDUE_NEXT_ACTION");
  }
  if (
    daysSinceOpportunityContact(input.lastActivityAt, input.createdAt, input.now) >=
    NO_CONTACT_RISK_DAYS
  ) {
    flags.push("NO_RECENT_ACTIVITY");
  }
  const stageRef = input.lastStageChangeAt ?? input.createdAt;
  if (
    Math.floor((input.now.getTime() - new Date(stageRef).getTime()) / 86_400_000) >=
    STAGE_STUCK_DAYS
  ) {
    flags.push("STUCK_IN_STAGE");
  }
  if (
    hasIncompleteContext({
      status: input.status,
      industryId: input.industryId,
      projectTypeId: input.projectTypeId,
      nextActionDate: input.nextActionDate,
    })
  ) {
    flags.push("INCOMPLETE_CONTEXT");
  }
  return flags;
}

// ---------- Project ↔ Contact roles (handoff §24 Step 3) ----------

export type ProjectContactRole =
  | "DECISION_MAKER"
  | "CHAMPION"
  | "PROCUREMENT"
  | "MAIN_CONTACT";

export const PROJECT_CONTACT_ROLES: readonly ProjectContactRole[] = [
  "DECISION_MAKER", "CHAMPION", "PROCUREMENT", "MAIN_CONTACT",
];

// ---------- Stage history (schema foundation for Step-3 atomic writes) ----------

export interface ProjectStageHistoryEntry {
  id: string;
  opportunityId: OpportunityId;
  fromStatus: ProjectStatus | null; // null = creation
  toStatus: ProjectStatus;
  fromStage: SalesStage | null;
  toStage: SalesStage | null;
  reason: string | null;
  changedBy: UserId | null;
  changedAt: string;
}

// ---------- Risk rule ----------

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

/** Only ACTIVE projects carry commercial risk — DRAFT and closed never do
 * (plan rev 2). */
export function isOpportunityAtRisk(
  status: ProjectStatus,
  lastActivityAt: string | null,
  createdAt: string,
  now: Date,
): boolean {
  if (status !== "ACTIVE") return false;
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
