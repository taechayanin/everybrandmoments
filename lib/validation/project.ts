import { z } from "zod";
import {
  PROJECT_CONTACT_ROLES,
  SALES_STAGES,
} from "@/lib/domain/opportunity";

// Step 3 — runtime contracts for every project write crossing the server
// boundary. All `.strict()`: unknown keys are rejected, never ignored.

const accountId = z.string().regex(/^ACC-/, "Invalid account id") as unknown as z.ZodType<`ACC-${string}`>;
const momentEventId = z.string().regex(/^ME-/, "Invalid moment event id") as unknown as z.ZodType<`ME-${string}`>;
const opportunityId = z.string().regex(/^OPP-/, "Invalid project id") as unknown as z.ZodType<`OPP-${string}`>;
const solutionId = z.string().regex(/^SOL-/, "Invalid solution id") as unknown as z.ZodType<`SOL-${string}`>;
const userId = z.string().regex(/^USR-/, "Invalid user id") as unknown as z.ZodType<`USR-${string}`>;
const industryId = z.string().regex(/^IND-/, "Invalid industry id") as unknown as z.ZodType<`IND-${string}`>;
const projectTypeId = z.string().regex(/^PT-/, "Invalid project type id") as unknown as z.ZodType<`PT-${string}`>;
const contactId = z.string().regex(/^CT-/, "Invalid contact id") as unknown as z.ZodType<`CT-${string}`>;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ต้องเป็นวันที่ (YYYY-MM-DD)");
const requestId = z.string().min(8).max(120);

export const CreateProjectSchema = z
  .object({
    accountId,
    momentEventId,
    name: z.string().trim().min(3).max(200),
    brief: z.string().trim().max(4000).optional(),
    industryId: industryId.optional(),
    subIndustryId: industryId.optional(),
    projectTypeId: projectTypeId.optional(),
    expectedRevenue: z.number().nonnegative(),
    expectedGP: z.number().min(0).max(1),
    closeDate: isoDate,
    expectedDeliveryDate: isoDate.optional(),
    ownerId: userId,
    nextAction: z.string().trim().min(1).max(300),
    nextActionDate: isoDate.optional(),
    solutionIds: z.array(solutionId).max(20).optional(),
    clientRequestId: requestId,
    actorId: userId,
  })
  .strict();
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;

export const ActivateProjectSchema = z
  .object({
    opportunityId,
    // Context may be completed at activation time (DRAFT was incomplete).
    industryId: industryId.optional(),
    subIndustryId: industryId.optional(),
    projectTypeId: projectTypeId.optional(),
    nextAction: z.string().trim().min(1).max(300).optional(),
    nextActionDate: isoDate.optional(),
    expectedRevenue: z.number().nonnegative().optional(),
    clientRequestId: requestId,
    actorId: userId,
  })
  .strict();
export type ActivateProjectInput = z.input<typeof ActivateProjectSchema>;

export const UpdateProjectSchema = z
  .object({
    opportunityId,
    name: z.string().trim().min(3).max(200).optional(),
    brief: z.string().trim().max(4000).nullable().optional(),
    expectedRevenue: z.number().nonnegative().optional(),
    expectedGP: z.number().min(0).max(1).optional(),
    closeDate: isoDate.optional(),
    expectedDeliveryDate: isoDate.nullable().optional(),
    industryId: industryId.optional(),
    subIndustryId: industryId.nullable().optional(),
    projectTypeId: projectTypeId.optional(),
    actorId: userId,
  })
  .strict();
export type UpdateProjectInput = z.input<typeof UpdateProjectSchema>;

export const UpdateProjectStageSchema = z
  .object({
    opportunityId,
    toStage: z.enum(SALES_STAGES as [string, ...string[]]) as unknown as z.ZodType<
      (typeof SALES_STAGES)[number]
    >,
    reason: z.string().trim().max(500).optional(),
    clientRequestId: requestId,
    actorId: userId,
  })
  .strict();
export type UpdateProjectStageInput = z.input<typeof UpdateProjectStageSchema>;

export const CloseProjectWonSchema = z
  .object({
    opportunityId,
    reason: z.string().trim().max(500).optional(),
    clientRequestId: requestId,
    actorId: userId,
  })
  .strict();
export type CloseProjectWonInput = z.input<typeof CloseProjectWonSchema>;

export const CloseProjectLostSchema = z
  .object({
    opportunityId,
    lostReason: z.string().trim().min(3, "ต้องระบุเหตุผลที่ไม่สำเร็จ").max(500),
    clientRequestId: requestId,
    actorId: userId,
  })
  .strict();
export type CloseProjectLostInput = z.input<typeof CloseProjectLostSchema>;

export const CancelProjectSchema = z
  .object({
    opportunityId,
    cancelReason: z.string().trim().min(3, "ต้องระบุเหตุผลที่ยกเลิก").max(500),
    clientRequestId: requestId,
    actorId: userId,
  })
  .strict();
export type CancelProjectInput = z.input<typeof CancelProjectSchema>;

export const UpdateProjectNextActionSchema = z
  .object({
    opportunityId,
    nextAction: z.string().trim().min(1).max(300),
    nextActionDate: isoDate,
    actorId: userId,
  })
  .strict();
export type UpdateProjectNextActionInput = z.input<typeof UpdateProjectNextActionSchema>;

export const AddProjectContactSchema = z
  .object({
    opportunityId,
    contactId,
    role: z.enum(PROJECT_CONTACT_ROLES as [string, ...string[]]) as unknown as z.ZodType<
      (typeof PROJECT_CONTACT_ROLES)[number]
    >,
    actorId: userId,
  })
  .strict();
export type AddProjectContactUseCaseInput = z.input<typeof AddProjectContactSchema>;
