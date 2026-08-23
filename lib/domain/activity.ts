// CRM Activity Layer domain (sprint spec §8–§17, plan rev 4 Step 1).
// Single source of truth for every CRM enum — the zod contracts
// (lib/contracts/crm.ts) and the CHECK constraints in migration
// 0004_crm_activity_layer.sql derive from these arrays; a drift test pins
// the migration file to them (tests/crm-contracts.test.ts).

import type { UserId } from "./ids";

// ---------- branded ids ----------

export type ActivityId = `ACT-${string}`;
export type TaskId = `TSK-${string}`;
export type ContactId = `CT-${string}`;
export type SuggestionId = `SUG-${string}`;

export function isActivityId(v: string): v is ActivityId {
  return v.startsWith("ACT-");
}

export function isTaskId(v: string): v is TaskId {
  return v.startsWith("TSK-");
}

export function isContactId(v: string): v is ContactId {
  return v.startsWith("CT-");
}

export function isSuggestionId(v: string): v is SuggestionId {
  return v.startsWith("SUG-");
}

// ---------- enums (spec §10, §13, §14, §16, §17) ----------

export const ACTIVITY_TYPES = [
  "NOTE", "CALL", "MEETING", "EMAIL", "LINE", "VISIT",
  "TASK", "TASK_COMPLETED",
  "MOMENT_DETECTED", "MOMENT_VERIFIED", "MOMENT_REJECTED",
  "OPPORTUNITY_CREATED", "OPPORTUNITY_STAGE_CHANGED",
  "OPPORTUNITY_WON", "OPPORTUNITY_LOST",
  "SYSTEM",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const CALL_OUTCOMES = [
  "CONNECTED", "NO_ANSWER", "CALL_BACK", "INTERESTED",
  "NOT_INTERESTED", "QUALIFIED", "FOLLOW_UP",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const MEETING_TYPES = [
  "ONLINE", "OFFLINE", "EBM_CENTER", "CUSTOMER_OFFICE", "PHONE", "EVENT",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const CONTACT_ROLES = [
  "DECISION_MAKER", "INFLUENCER", "CHAMPION", "PROCUREMENT",
  "USER", "FINANCE", "GATEKEEPER", "OTHER",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const INFLUENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number];

export const CONTACT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Business default — applied at the application boundary, never inside a
 * repository adapter (Step-3 review item 1). */
export const DEFAULT_TASK_PRIORITY: TaskPriority = "NORMAL";

export const SUGGESTION_STATUSES = ["PENDING", "ACCEPTED", "IGNORED"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/**
 * "No Activity Without Next State" (spec §46): every logged interaction can
 * declare where the relationship goes next. An application/domain concept —
 * persisted in activity metadata, not a workflow engine.
 */
export const INTERACTION_NEXT_STATES = [
  "FOLLOW_UP", "WAITING_CUSTOMER", "PROPOSAL", "NURTURE", "CLOSED", "NO_ACTION",
] as const;
export type InteractionNextState = (typeof INTERACTION_NEXT_STATES)[number];

// ---------- stable idempotency keys (plan rev 4) ----------

/** Follow-up task created together with a logged interaction. */
export function followUpTaskKey(activityClientRequestId: string): string {
  return `ACTIVITY:${activityClientRequestId}:FOLLOWUP`;
}

/** Follow-up task created by accepting an AI suggestion (Step 6). */
export function suggestionTaskKey(suggestionId: SuggestionId): string {
  return `SUG:${suggestionId}`;
}

/**
 * System moment-lifecycle activity (Step 5): one timeline row per moment
 * event per lifecycle change — queue redelivery / repeated verification
 * collides on this key and writes nothing.
 */
export function momentActivityKey(
  kind: "DETECTED" | "VERIFIED" | "REJECTED",
  momentEventId: string,
): string {
  return `MOMENT-${kind}:${momentEventId}`;
}

// ---------- entities ----------

/** One row in the unified Account Timeline (spec §8–§9). */
export interface Activity {
  id: ActivityId;
  accountId: string;
  contactId: ContactId | null;
  opportunityId: string | null;
  momentEventId: string | null;
  activityType: ActivityType;
  title: string | null;
  body: string | null;
  outcome: string | null;
  nextAction: string | null;
  nextActionAt: string | null; // ISO datetime
  occurredAt: string; // ISO datetime
  /** null = written by the system (moment lifecycle), not a person. */
  createdBy: UserId | null;
  createdAt: string;
  updatedAt: string;
  /** Type-specific extras (call duration, meeting type, budget…) — validated before write. */
  metadata: Record<string, unknown> | null;
  deletedAt: string | null;
}

/** CRM follow-up task (spec §17) — canonical uppercase status everywhere. */
export interface CrmTask {
  id: TaskId;
  accountId: string | null;
  contactId: ContactId | null;
  momentEventId: string | null;
  opportunityId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null; // ISO date
  assigneeId: UserId | null;
  createdBy: UserId | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** First-class CRM contact (spec §15–§16) — the persisted shape behind
 * ContactRepository; the legacy embedded Account.contacts snapshot stays for
 * existing UI until Step 4 rewires it. */
export interface CrmContact {
  id: ContactId;
  accountId: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  buyingRole: ContactRole | null;
  influenceLevel: InfluenceLevel | null;
  isPrimary: boolean;
  status: ContactStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AI analysis persisted for human decision (spec §22). */
export interface ActivitySuggestion {
  id: SuggestionId;
  activityId: ActivityId;
  payload: ActivityAnalysis;
  confidence: number | null;
  status: SuggestionStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: UserId | null;
}

/** Structured output of AI activity analysis (spec §20) — suggestions only,
 * never a direct mutation; a human accepts/ignores (spec §22). */
export interface ActivityAnalysis {
  summary: string;
  detectedMomentCodes: string[];
  needs: string[];
  budgetMin?: number;
  budgetMax?: number;
  expectedDate?: string;
  decisionMakerDetected?: boolean;
  nextAction?: string;
  nextActionDate?: string;
  recommendedSolutionIds: string[];
  confidence: number;
}
