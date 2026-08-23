"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createOpportunity } from "@/lib/application/opportunities/create-opportunity";
import { WRITES_DISABLED_MESSAGE, writesEnabled } from "@/lib/services/authz";
import type { CreateOpportunityFormInput } from "@/lib/validation/opportunity";

export interface CreateOpportunityActionResult {
  ok: boolean;
  opportunityId?: string;
  name?: string;
  expectedRevenue?: number;
  error?: string;
}

export async function createOpportunityAction(
  input: CreateOpportunityFormInput,
): Promise<CreateOpportunityActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const opportunity = await createOpportunity(input);
    revalidatePath("/opportunities");
    revalidatePath("/workspace");
    revalidatePath("/");
    return {
      ok: true,
      opportunityId: opportunity.id,
      name: opportunity.name,
      expectedRevenue: opportunity.expectedRevenue,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues.map((i) => i.message).join(", ") };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
