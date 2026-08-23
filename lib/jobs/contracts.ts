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
  "ANALYZE_ACTIVITY",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

const organizationId = z.string().regex(/^ORG-/);
const accountId = z.string().regex(/^ACC-/);
const signalId = z.string().regex(/^SIG-/);
const momentEventId = z.string().regex(/^ME-/);
const activityId = z.string().regex(/^ACT-/);

export const DetectMomentJobSchema = z.object({
  jobType: z.literal("DETECT_MOMENT"),
  organizationId,
  accountId,
  // Bounded + unique: the consumer builds an IN (...) clause from these, and
  // D1 has a bind-parameter limit — never let queue payload size the SQL.
  signalIds: z
    .array(signalId)
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, "signalIds must be unique"),
});

/** CRM Activity → async AI enrichment (sprint Step 6; spec §20). */
export const AnalyzeActivityJobSchema = z.object({
  jobType: z.literal("ANALYZE_ACTIVITY"),
  organizationId,
  accountId,
  activityId,
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
  AnalyzeActivityJobSchema,
]);

export type Job = z.infer<typeof JobSchema>;
export type DetectMomentJob = z.infer<typeof DetectMomentJobSchema>;
export type AnalyzeActivityJob = z.infer<typeof AnalyzeActivityJobSchema>;

// ---------- AI / rule detection output (§40) ----------
// Validated before any D1 insert; stores evidence, never a bare moment code.

export const DetectionResultSchema = z.object({
  momentCode: z.enum(MOMENT_CODES as [string, ...string[]]),
  subMoment: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  // Must be a real calendar date, not just YYYY-MM-DD-shaped (2026-99-99).
  expectedEventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "expectedEventDate must be a valid calendar date"),
  reason: z.string().min(1).max(1000),
  recommendedSolutionIds: z.array(z.string().regex(/^SOL-/)).max(10).default([]),
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
  /**
   * Caller-supplied idempotency key. Retrying the same ingest (e.g. after a
   * 500) with the same key returns the original signal instead of inserting a
   * duplicate. Defaults to a hash of (accountId, sourceType, rawText).
   */
  ingestKey: z.string().min(8).max(128).optional(),
});

export type IngestSignalInput = z.input<typeof IngestSignalSchema>;
