import { getRepositories } from "@/lib/infrastructure";
import { CrmError } from "@/lib/application/activities/shared";
import type {
  AcceptSuggestionOutcome,
  Repositories,
} from "@/lib/repositories";
import type {
  AccountId,
  ActivityAnalysis,
  MomentCode,
  SolutionId,
  SuggestionId,
  UserId,
} from "@/lib/types";

// Step 6 — human confirmation (spec §22): AI output is suggestion data only;
// accepting routes through the existing Moment/Task domain rules via ONE
// atomic decision write. Moment codes and solution ids are re-validated
// against the ACTIVE catalogs at acceptance time — never trusted from the
// stored payload alone.

const DEFAULT_EXPECTED_DAYS = 30;

export interface ValidatedAnalysis {
  momentCode: MomentCode | null;
  solutionIds: SolutionId[];
}

/** Keep only catalog-backed moment codes / solution ids (review: never trust
 * invented IDs). Exported for the worker-parity tests. */
export function validateAnalysisAgainstCatalog(
  payload: ActivityAnalysis,
  activeMomentCodes: Set<string>,
  activeSolutionIds: Set<string>,
): ValidatedAnalysis {
  const momentCode =
    (payload.detectedMomentCodes.find((c) => activeMomentCodes.has(c)) as
      | MomentCode
      | undefined) ?? null;
  return {
    momentCode,
    solutionIds: payload.recommendedSolutionIds.filter((s) =>
      activeSolutionIds.has(s),
    ) as SolutionId[],
  };
}

async function loadSuggestionContext(repos: Repositories, suggestionId: SuggestionId) {
  const suggestion = await repos.suggestions.getById(suggestionId);
  // Org-scoped repo: a foreign-org (or unknown) id resolves to null.
  if (!suggestion) throw new CrmError("ไม่พบ Suggestion นี้ในองค์กร");
  const activity = await repos.activities.getById(suggestion.activityId);
  if (!activity) throw new CrmError("Activity ต้นทางของ Suggestion ถูกลบไปแล้ว");
  return { suggestion, activity };
}

export async function acceptSuggestion(
  suggestionId: SuggestionId,
  userId: UserId,
): Promise<AcceptSuggestionOutcome & { accountId: string }> {
  const repos = await getRepositories();
  const { suggestion, activity } = await loadSuggestionContext(repos, suggestionId);
  const payload = suggestion.payload;

  const [masterMoments, solutions] = await Promise.all([
    repos.masterMoments.listAll(),
    repos.solutions.listAll(),
  ]);
  const validated = validateAnalysisAgainstCatalog(
    payload,
    new Set(masterMoments.map((m) => m.code)),
    new Set(solutions.map((s) => s.id)),
  );

  const expectedDate =
    payload.expectedDate ??
    new Date(Date.now() + DEFAULT_EXPECTED_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

  const outcome = await repos.suggestionDecisions.acceptAtomic({
    suggestionId,
    userId,
    accountId: activity.accountId as AccountId,
    moment: validated.momentCode
      ? {
          momentCode: validated.momentCode,
          subMoment: payload.summary.slice(0, 200),
          reason: payload.summary,
          expectedEventDate: expectedDate,
          confidence: payload.confidence,
          solutionIds: validated.solutionIds,
        }
      : undefined,
    task: payload.nextAction
      ? { title: payload.nextAction, dueDate: payload.nextActionDate }
      : undefined,
  });
  return { ...outcome, accountId: activity.accountId };
}

export async function ignoreSuggestion(
  suggestionId: SuggestionId,
  userId: UserId,
): Promise<{ changed: boolean; accountId: string }> {
  const repos = await getRepositories();
  const { activity } = await loadSuggestionContext(repos, suggestionId);
  const result = await repos.suggestionDecisions.ignoreAtomic(suggestionId, userId);
  return { ...result, accountId: activity.accountId };
}
