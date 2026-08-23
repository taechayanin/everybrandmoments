import type {
  AccountId,
  IndustryId,
  MomentEventId,
  ProjectTypeId,
  UserId,
} from "@/lib/types";
import type { Repositories } from "@/lib/repositories";

/**
 * Step-3 fix P1-1 — the CANONICAL relationship validator for project context.
 * Presence/completeness is activationGateErrors() (domain); THIS validates
 * that every referenced id actually belongs together:
 *   - moment: same organization (org-scoped lookup) AND same account
 *   - sub_industry (when present): child of the selected industry
 *   - project_type (when present): exists, active, selectable — the
 *     PT-UNSPECIFIED sentinel is never valid as a NEW value
 *   - owner: a real user of the organization
 * Every context write path (create / activate / update) calls this one
 * function — nothing re-implements the rules.
 */
export interface ProjectContextRelations {
  accountId: AccountId;
  momentEventId: MomentEventId;
  industryId: IndustryId | null;
  subIndustryId: IndustryId | null;
  projectTypeId: ProjectTypeId | null;
  ownerId: UserId;
}

export async function validateProjectContextRelations(
  repos: Repositories,
  ctx: ProjectContextRelations,
): Promise<string[]> {
  const errors: string[] = [];

  const [moment, owner] = await Promise.all([
    repos.moments.getById(ctx.momentEventId), // org-scoped: foreign org = null
    repos.users.getById(ctx.ownerId), // org-scoped: foreign org = null
  ]);
  if (!moment) {
    errors.push("moment_not_found_in_organization");
  } else if (moment.accountId !== ctx.accountId) {
    errors.push("moment_belongs_to_different_account");
  }
  if (!owner) errors.push("owner_not_in_organization");

  if (ctx.industryId) {
    const industry = await repos.industries.getById(ctx.industryId);
    if (!industry || !industry.active) errors.push("industry_not_found");
  }
  if (ctx.subIndustryId) {
    const sub = await repos.industries.getById(ctx.subIndustryId);
    if (!sub || !sub.active) {
      errors.push("sub_industry_not_found");
    } else if (ctx.industryId === null || sub.parentId !== ctx.industryId) {
      errors.push("sub_industry_not_in_selected_industry");
    }
  }
  if (ctx.projectTypeId) {
    const pt = await repos.projectTypes.getById(ctx.projectTypeId);
    if (!pt || !pt.active || !pt.selectable) {
      errors.push("project_type_not_selectable");
    }
  }
  return errors;
}
