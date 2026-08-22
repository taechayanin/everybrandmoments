import { z } from "zod";
// Relative import so the jobs worker (bundled by wrangler outside the Next
// alias config) can share this contract file.
import { MOMENT_CODES } from "../domain/moment";

// Queue job contracts (refactor plan §40, Phase H) — every payload crossing
// the queue boundary is validated on BOTH sides (producer and consumer).

export const JOB_TYPES = [
  "DETECT_MOMENT",
  "SCORE_MOMENT",
  "RECOMMEND_SOLUTIONS",
  "CRM_SYNC",
  "ERP_SYNC",
  "NEXT_MOMENT",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

const organizationId = z.string().regex(/^ORG-/);
const accountId = z.string().regex(/^ACC-/);
const signalId = z.string().regex(/^SIG-/);
const momentEventId = z.string().regex(/^ME-/);

export const DetectMomentJobSchema = z.object({
  jobType: z.literal("DETECT_MOMENT"),
  organizationId,
  accountId,
  signalIds: z.array(signalId).min(1),
});

export const ScoreMomentJobSchema = z.object({
  jobType: z.literal("SCORE_MOMENT"),
  organizationId,
  momentEventId,
});

export const RecommendSolutionsJobSchema = z.object({
  jobType: z.literal("RECOMMEND_SOLUTIONS"),
  organizationId,
  momentEventId,
});

export const CrmSyncJobSchema = z.object({
  jobType: z.literal("CRM_SYNC"),
  organizationId,
  accountId: accountId.optional(),
  cursor: z.string().optional(),
});

export const ErpSyncJobSchema = z.object({
  jobType: z.literal("ERP_SYNC"),
  organizationId,
  accountId: accountId.optional(),
  cursor: z.string().optional(),
});

export const NextMomentJobSchema = z.object({
  jobType: z.literal("NEXT_MOMENT"),
  organizationId,
  momentEventId,
});

export const JobSchema = z.discriminatedUnion("jobType", [
  DetectMomentJobSchema,
  ScoreMomentJobSchema,
  RecommendSolutionsJobSchema,
  CrmSyncJobSchema,
  ErpSyncJobSchema,
  NextMomentJobSchema,
]);

export type Job = z.infer<typeof JobSchema>;
export type DetectMomentJob = z.infer<typeof DetectMomentJobSchema>;

// ---------- AI / rule detection output (§40) ----------
// Validated before any D1 insert; stores evidence, never a bare moment code.

export const DetectionResultSchema = z.object({
  momentCode: z.enum(MOMENT_CODES as [string, ...string[]]),
  subMoment: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  expectedEventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1),
  recommendedSolutionIds: z.array(z.string().regex(/^SOL-/)).default([]),
});

export type DetectionResult = z.infer<typeof DetectionResultSchema>;

// ---------- Signal ingestion (POST /api/signals) ----------

export const IngestSignalSchema = z.object({
  accountId,
  sourceType: z.enum([
    "Social Signal", "CRM Note", "Lead Form", "Meeting Note", "Order History",
    "Complaint", "Job Posting", "Website", "News", "Manual", "Rule Engine",
  ]),
  sourceRef: z.string().max(200).optional(),
  sourceUrl: z.string().url().max(500).optional(),
  rawText: z.string().min(1).max(5000),
});

export type IngestSignalInput = z.input<typeof IngestSignalSchema>;
