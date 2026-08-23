import { z } from "zod";
// Relative imports so the jobs worker (bundled by wrangler outside the Next
// alias config) can share these contracts in Step 6.
import {
  ACTIVITY_TYPES,
  CALL_OUTCOMES,
  CONTACT_ROLES,
  CONTACT_STATUSES,
  INFLUENCE_LEVELS,
  INTERACTION_NEXT_STATES,
  MEETING_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../domain/activity";
import { MOMENT_CODES } from "../domain/moment";

// CRM write contracts (sprint spec §42) — every server action parses its
// input with the matching .strict() schema before touching a use case.
// All strings and arrays carry explicit maximums.

const accountId = z.string().regex(/^ACC-/);
const contactId = z.string().regex(/^CT-/);
const momentEventId = z.string().regex(/^ME-/);
const opportunityId = z.string().regex(/^OPP-/);
const userId = z.string().regex(/^USR-/);
const solutionId = z.string().regex(/^SOL-/);
const suggestionId = z.string().regex(/^SUG-/);

/** Real calendar date (not just YYYY-MM-DD-shaped — rejects 2026-99-99). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "must be a valid calendar date");

/** ISO datetime accepted from the composer (date-only also allowed). */
const isoDateTime = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "must be a valid datetime");

/** Client-generated idempotency key (crypto.randomUUID at form mount). */
const clientRequestId = z.string().min(8).max(80);

const followUpFields = {
  nextAction: z.string().trim().max(500).optional(),
  nextActionAt: isoDateTime.optional(),
  /** "Save + Create Follow-up" (spec §12) — requires nextAction. */
  createFollowUp: z.boolean().optional(),
  /** No Activity Without Next State (spec §46). */
  nextState: z.enum(INTERACTION_NEXT_STATES).optional(),
};

const relationFields = {
  contactId: contactId.optional(),
  momentEventId: momentEventId.optional(),
  opportunityId: opportunityId.optional(),
};

// ---------- Activity composer (spec §12–§14) ----------

export const CreateNoteSchema = z
  .object({
    accountId,
    body: z.string().trim().min(1).max(10_000),
    occurredAt: isoDateTime.optional(), // default now() in use case
    clientRequestId,
    ...relationFields,
    ...followUpFields,
  })
  .strict();

export const LogCallSchema = z
  .object({
    accountId,
    occurredAt: isoDateTime,
    durationMinutes: z.number().int().min(0).max(24 * 60).optional(),
    outcome: z.enum(CALL_OUTCOMES),
    body: z.string().trim().max(10_000).optional(),
    clientRequestId,
    ...relationFields,
    ...followUpFields,
  })
  .strict();

export const LogMeetingSchema = z
  .object({
    accountId,
    occurredAt: isoDateTime,
    meetingType: z.enum(MEETING_TYPES),
    locationOrChannel: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1).max(10_000),
    keyNeeds: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    budgetMin: z.number().min(0).max(1_000_000_000).optional(),
    budgetMax: z.number().min(0).max(1_000_000_000).optional(),
    expectedTimeline: isoDate.optional(),
    decisionMakerContactId: contactId.optional(),
    clientRequestId,
    ...relationFields,
    ...followUpFields,
  })
  .strict()
  .refine(
    (v) => v.budgetMin === undefined || v.budgetMax === undefined || v.budgetMin <= v.budgetMax,
    { message: "budgetMin must be <= budgetMax", path: ["budgetMax"] },
  );

export const UpdateActivitySchema = z
  .object({
    activityId: z.string().regex(/^ACT-/),
    body: z.string().trim().min(1).max(10_000).optional(),
    outcome: z.string().trim().max(300).optional(),
    ...followUpFields,
  })
  .strict();

// ---------- Tasks (spec §17) ----------

export const CreateTaskSchema = z
  .object({
    accountId: accountId.optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(2_000).optional(),
    dueDate: isoDate.optional(),
    assigneeId: userId.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(), // repository defaults NORMAL
    clientRequestId,
    ...relationFields,
  })
  .strict();

export const CompleteTaskSchema = z
  .object({ taskId: z.string().regex(/^TSK-/) })
  .strict();

export const TaskStatusSchema = z.enum(TASK_STATUSES);

// ---------- Contacts (spec §15–§16) ----------

const contactFields = {
  name: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().max(200).optional(),
  department: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().max(50).optional(),
  lineId: z.string().trim().max(100).optional(),
  buyingRole: z.enum(CONTACT_ROLES).optional(),
  influenceLevel: z.enum(INFLUENCE_LEVELS).optional(),
  isPrimary: z.boolean().default(false),
  status: z.enum(CONTACT_STATUSES).default("ACTIVE"),
  notes: z.string().trim().max(2_000).optional(),
};

export const CreateContactSchema = z
  .object({ accountId, clientRequestId, ...contactFields })
  .strict();

export const UpdateContactSchema = z
  .object({ contactId, ...contactFields })
  .strict();

// ---------- AI activity analysis (spec §20–§21) ----------

export const ActivityAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
    detectedMomentCodes: z.array(z.enum(MOMENT_CODES)).max(5),
    needs: z.array(z.string().trim().min(1).max(300)).max(20),
    budgetMin: z.number().min(0).max(1_000_000_000).optional(),
    budgetMax: z.number().min(0).max(1_000_000_000).optional(),
    expectedDate: isoDate.optional(),
    decisionMakerDetected: z.boolean().optional(),
    nextAction: z.string().trim().max(500).optional(),
    nextActionDate: isoDate.optional(),
    recommendedSolutionIds: z.array(solutionId).max(10),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const DecideSuggestionSchema = z
  .object({ suggestionId })
  .strict();

/** Timeline load-more (read path) — keyset cursor from the previous page. */
export const LoadTimelineSchema = z
  .object({
    accountId,
    cursor: z.string().max(120).optional(),
    types: z.array(z.enum(ACTIVITY_TYPES)).max(ACTIVITY_TYPES.length).optional(),
  })
  .strict();

// ---------- Activity metadata (typed, stored as metadata_json) ----------

export const CallMetadataSchema = z
  .object({
    kind: z.literal("CALL"),
    durationMinutes: z.number().int().min(0).max(24 * 60).optional(),
  })
  .strict();

export const MeetingMetadataSchema = z
  .object({
    kind: z.literal("MEETING"),
    meetingType: z.enum(MEETING_TYPES),
    locationOrChannel: z.string().max(300).optional(),
    keyNeeds: z.array(z.string().max(300)).max(20).optional(),
    budgetMin: z.number().optional(),
    budgetMax: z.number().optional(),
    expectedTimeline: z.string().optional(),
    decisionMakerContactId: z.string().optional(),
  })
  .strict();

export const ACTIVITY_TYPE_VALUES = ACTIVITY_TYPES;

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type LogCallInput = z.infer<typeof LogCallSchema>;
export type LogMeetingInput = z.infer<typeof LogMeetingSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export type ActivityAnalysisOutput = z.infer<typeof ActivityAnalysisSchema>;
