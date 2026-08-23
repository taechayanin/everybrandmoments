import type { OpportunityId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import {
  projectRiskFlags,
  type ProjectRiskFlag,
} from "@/lib/domain/opportunity";
import { getClock } from "@/lib/services/clock";
import { orgLocalDate } from "@/lib/services/org-time";

/**
 * Step 3 — project risk evaluation: loads the CRM context (last activity,
 * last stage change) and applies the pure domain rule set. Rules only —
 * no automation is attached here (reviewer §11).
 */
export async function evaluateProjectRisk(
  opportunityId: OpportunityId,
): Promise<{ flags: ProjectRiskFlag[]; atRisk: boolean }> {
  const repos = await getRepositories();
  const project = await repos.opportunities.getById(opportunityId);
  if (!project) throw new Error(`Project not found: ${opportunityId}`);

  const [lastActivity, history] = await Promise.all([
    repos.activities.lastActivityByOpportunities([project.id]),
    repos.opportunities.listStageHistory(project.id),
  ]);
  const now = getClock().now();
  const flags = projectRiskFlags({
    status: project.status,
    industryId: project.industryId,
    projectTypeId: project.projectTypeId,
    nextAction: project.nextAction,
    nextActionDate: project.nextActionDate,
    createdAt: project.createdAt,
    lastActivityAt: lastActivity.get(project.id) ?? null,
    lastStageChangeAt: history.at(-1)?.changedAt ?? null,
    today: orgLocalDate(now),
    now,
  });
  return { flags, atRisk: flags.length > 0 };
}
