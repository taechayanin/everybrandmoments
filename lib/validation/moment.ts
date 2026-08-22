import { z } from "zod";
import { MOMENT_CODES } from "@/lib/domain/moment";

const accountId = z.string().regex(/^ACC-/, "Invalid account id") as unknown as z.ZodType<`ACC-${string}`>;
const userId = z.string().regex(/^USR-/, "Invalid user id") as unknown as z.ZodType<`USR-${string}`>;

export const CreateMomentSchema = z.object({
  accountId,
  momentType: z.enum(MOMENT_CODES as [string, ...string[]]).transform(
    (v) => v as (typeof MOMENT_CODES)[number],
  ),
  subMoment: z.string().min(1).max(200),
  stakeholders: z
    .array(z.enum(["Business", "Employee", "Customer", "Partner"]))
    .min(1),
  triggerDetail: z.string().min(1).max(500),
  expectedEventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date"),
  potentialWalletMin: z.number().nonnegative(),
  potentialWalletMax: z.number().nonnegative(),
  ownerId: userId,
});

export type CreateMomentFormInput = z.input<typeof CreateMomentSchema>;
