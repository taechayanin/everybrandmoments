import type { MomentEvent } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import {
  CreateMomentSchema,
  type CreateMomentFormInput,
} from "@/lib/validation/moment";

/** Manual moment creation (Detection Level 1). */
export async function createMoment(raw: CreateMomentFormInput): Promise<MomentEvent> {
  const input = CreateMomentSchema.parse(raw);
  const repos = await getRepositories();

  return repos.moments.create({
    accountId: input.accountId,
    momentType: input.momentType,
    subMoment: input.subMoment,
    stakeholders: input.stakeholders,
    triggerSource: "Manual",
    triggerDetail: input.triggerDetail,
    expectedEventDate: input.expectedEventDate,
    // Manual moments start with a conservative default score; Customer
    // Solution updates it during qualification (SOP step 5).
    score: { businessFit: 15, intent: 10, timing: 10, wallet: 5, relationship: 5 },
    potentialWalletMin: input.potentialWalletMin,
    potentialWalletMax: input.potentialWalletMax,
    ownerId: input.ownerId,
  });
}
