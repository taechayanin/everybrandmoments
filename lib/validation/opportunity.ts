import { z } from "zod";

const accountId = z.string().regex(/^ACC-/, "Invalid account id") as unknown as z.ZodType<`ACC-${string}`>;
const momentEventId = z.string().regex(/^ME-/, "Invalid moment event id") as unknown as z.ZodType<`ME-${string}`>;
const solutionId = z.string().regex(/^SOL-/, "Invalid solution id") as unknown as z.ZodType<`SOL-${string}`>;
const userId = z.string().regex(/^USR-/, "Invalid user id") as unknown as z.ZodType<`USR-${string}`>;

export const CreateOpportunitySchema = z.object({
  accountId,
  momentEventId,
  solutionIds: z.array(solutionId).min(1, "เลือก Solution อย่างน้อย 1 รายการ"),
  discoveryAnsweredCount: z
    .number()
    .int()
    .min(3, "ต้องทำ Discovery อย่างน้อย 3 ข้อก่อนสร้าง Opportunity"),
  channelMode: z.enum(["ONLINE", "OFFLINE"]),
  channel: z
    .enum([
      "EBM Business Center",
      "EBM Studio",
      "EBM Partner Point",
      "Video Consultation",
      "Inside Sales",
    ])
    .optional(),
  expectedRevenue: z.number().nonnegative().optional(),
  ownerId: userId,
});

export type CreateOpportunityFormInput = z.input<typeof CreateOpportunitySchema>;
