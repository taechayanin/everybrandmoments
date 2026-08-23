import type {
  Account,
  CrmTask,
  Industry,
  MomentEvent,
  Opportunity,
  ProjectType,
  SalesStage,
} from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { getClock } from "@/lib/services/clock";
import { orgLocalDate } from "@/lib/services/org-time";
import { totalScore } from "@/lib/domain/score";
import { THAI_MOMENT_NAMES } from "@/lib/domain/master-moments";
import {
  SALES_STAGES,
  hasIncompleteContext,
  projectRiskFlags,
  type ProjectRiskFlag,
  type UserId,
} from "@/lib/types";

// Step 4 — ONE bounded read model powering BOTH the Kanban board and the
// list view (same dataset, same semantics): 1 project page (cap 100) + bulk
// hydration (accounts, moments, owners, last activity, next task, last stage
// change) + cached masters. Filters/grouping happen here in the application
// layer at pilot scale; SQL pushdown keeps the identical contract later.

export const PROJECT_FILTERS = [
  "ALL",
  "MY",
  "DRAFT",
  "ACTIVE",
  "AT_RISK",
  "NO_NEXT_ACTION",
  "OVERDUE_NEXT_ACTION",
  "NO_RECENT_ACTIVITY",
  "INCOMPLETE_CONTEXT",
  "WON",
  "LOST",
  "CANCELLED",
] as const;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];

export function isProjectFilter(v: string): v is ProjectFilter {
  return (PROJECT_FILTERS as readonly string[]).includes(v);
}

export interface ProjectPipelineRow {
  project: Opportunity;
  account: Account | null;
  event: MomentEvent | null;
  ownerName: string;
  /** Thai-first labels resolved from the masters — codes never surface. */
  momentThai: string | null;
  industryThai: string | null;
  subIndustryThai: string | null;
  projectTypeThai: string | null;
  momentScore: number;
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  nextFollowUp: CrmTask | null;
  riskFlags: ProjectRiskFlag[];
  incompleteContext: boolean;
}

export interface ProjectPipelineView {
  rows: ProjectPipelineRow[];
  /** ACTIVE rows grouped per commercial stage (board columns). */
  byStage: Record<SalesStage, ProjectPipelineRow[]>;
  drafts: ProjectPipelineRow[];
  closed: { won: number; lost: number; cancelled: number };
  activeCount: number;
  pipelineValue: number;
  atRiskCount: number;
  today: string;
  filter: ProjectFilter;
}

const CANDIDATE_LIMIT = 100;

export async function getProjectPipeline(
  filter: ProjectFilter,
  currentUserId: UserId,
): Promise<ProjectPipelineView> {
  const repos = await getRepositories();
  const clockNow = getClock().now();
  const today = orgLocalDate(clockNow);

  const { items: projects } = await repos.opportunities.list({
    limit: CANDIDATE_LIMIT,
  });
  const ids = projects.map((p) => p.id);

  // Bulk hydration — one query per relation, chunked ≤50 inside; masters are
  // cached list reads. No per-project loads anywhere.
  const [accounts, events, owners, lastActivity, nextTasks, lastStageChange, industries, projectTypes] =
    await Promise.all([
      repos.accounts.getByIds([...new Set(projects.map((p) => p.accountId))]),
      repos.moments.getByIds([...new Set(projects.map((p) => p.momentEventId))]),
      repos.users.getByIds([...new Set(projects.map((p) => p.ownerId))]),
      repos.activities.lastActivityByOpportunities(ids),
      repos.tasks.nextOpenTaskByOpportunities(ids),
      repos.opportunities.lastStageChangeByOpportunities(ids),
      repos.industries.listAll(),
      repos.projectTypes.listAll(),
    ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const ownerMap = new Map(owners.map((u) => [u.id, u]));
  const industryMap = new Map<string, Industry>(industries.map((i) => [i.id, i]));
  const typeMap = new Map<string, ProjectType>(projectTypes.map((t) => [t.id, t]));
  const now = clockNow.getTime();

  const rows: ProjectPipelineRow[] = projects.map((project) => {
    const event = eventMap.get(project.momentEventId) ?? null;
    const owner = ownerMap.get(project.ownerId);
    const lastAt = lastActivity.get(project.id) ?? null;
    const riskFlags = projectRiskFlags({
      status: project.status,
      industryId: project.industryId,
      projectTypeId: project.projectTypeId,
      nextAction: project.nextAction,
      nextActionDate: project.nextActionDate,
      createdAt: project.createdAt,
      lastActivityAt: lastAt,
      lastStageChangeAt: lastStageChange.get(project.id) ?? null,
      today,
      now: clockNow,
    });
    return {
      project,
      account: accountMap.get(project.accountId) ?? null,
      event,
      ownerName: owner ? `${owner.nickname} (${owner.name.split(" ")[0]})` : project.ownerId,
      momentThai: event ? (THAI_MOMENT_NAMES[event.momentType] ?? null) : null,
      industryThai: project.industryId
        ? (industryMap.get(project.industryId)?.nameTh ?? null)
        : null,
      subIndustryThai: project.subIndustryId
        ? (industryMap.get(project.subIndustryId)?.nameTh ?? null)
        : null,
      projectTypeThai: project.projectTypeId
        ? (typeMap.get(project.projectTypeId)?.nameTh ?? null)
        : null,
      momentScore: event ? totalScore(event.score) : 0,
      lastActivityAt: lastAt,
      daysSinceLastActivity: lastAt
        ? Math.max(0, Math.floor((now - new Date(lastAt).getTime()) / 86_400_000))
        : null,
      nextFollowUp: nextTasks.get(project.id) ?? null,
      riskFlags,
      incompleteContext: hasIncompleteContext(project),
    };
  });

  const filtered = rows.filter((row) => {
    const p = row.project;
    switch (filter) {
      case "ALL":
        return true;
      case "MY":
        return p.ownerId === currentUserId;
      case "DRAFT":
        return p.status === "DRAFT";
      case "ACTIVE":
        return p.status === "ACTIVE";
      case "AT_RISK":
        return row.riskFlags.length > 0;
      case "NO_NEXT_ACTION":
        return row.riskFlags.includes("NO_NEXT_ACTION");
      case "OVERDUE_NEXT_ACTION":
        return row.riskFlags.includes("OVERDUE_NEXT_ACTION");
      case "NO_RECENT_ACTIVITY":
        return row.riskFlags.includes("NO_RECENT_ACTIVITY");
      case "INCOMPLETE_CONTEXT":
        return row.incompleteContext;
      case "WON":
        return p.status === "WON";
      case "LOST":
        return p.status === "LOST";
      case "CANCELLED":
        return p.status === "CANCELLED";
    }
  });

  // Operational sort: moment score desc, then expected revenue.
  filtered.sort(
    (a, b) =>
      b.momentScore - a.momentScore ||
      b.project.expectedRevenue - a.project.expectedRevenue,
  );

  // The board always shows ACTIVE rows per stage — DRAFT is a separate strip,
  // never a column; closed are summary counts only.
  const byStage = Object.fromEntries(
    SALES_STAGES.map((s) => [s, [] as ProjectPipelineRow[]]),
  ) as Record<SalesStage, ProjectPipelineRow[]>;
  for (const row of filtered) {
    if (row.project.status === "ACTIVE" && row.project.salesStage) {
      byStage[row.project.salesStage].push(row);
    }
  }
  const active = rows.filter((r) => r.project.status === "ACTIVE");

  return {
    rows: filtered,
    byStage,
    drafts: filtered.filter((r) => r.project.status === "DRAFT"),
    closed: {
      won: rows.filter((r) => r.project.status === "WON").length,
      lost: rows.filter((r) => r.project.status === "LOST").length,
      cancelled: rows.filter((r) => r.project.status === "CANCELLED").length,
    },
    activeCount: active.length,
    pipelineValue: active.reduce((s, r) => s + r.project.expectedRevenue, 0),
    atRiskCount: active.filter((r) => r.riskFlags.length > 0).length,
    today,
    filter,
  };
}

/** Wizard bootstrap — everything the Create Project dialog needs for one
 * account, in one round trip (no per-field fetches). */
export async function getProjectWizardContext(accountId: Account["id"]) {
  const repos = await getRepositories();
  const [account, moments, contacts, industries, projectTypes] = await Promise.all([
    repos.accounts.getById(accountId),
    repos.moments.listByAccount(accountId),
    repos.contacts.listByAccount(accountId),
    repos.industries.listAll(),
    repos.projectTypes.listSelectable(), // sentinel never reaches the UI
  ]);
  if (!account) throw new Error(`Account not found: ${accountId}`);
  // Solutions per moment type present on this account (bounded: ≤20 types).
  const momentTypes = [...new Set(moments.map((m) => m.momentType))];
  const solutionsByMoment: Record<string, { id: string; name: string }[]> = {};
  await Promise.all(
    momentTypes.map(async (code) => {
      const sols = await repos.solutions.listByMoment(code);
      solutionsByMoment[code] = sols.map((s) => ({ id: s.id, name: s.name }));
    }),
  );
  return {
    solutionsByMoment,
    account: { id: account.id, name: account.name, industryId: account.industryId },
    moments: moments.map((m) => ({
      id: m.id,
      momentType: m.momentType,
      thai: THAI_MOMENT_NAMES[m.momentType],
      subMoment: m.subMoment,
      status: m.status,
    })),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, jobTitle: c.jobTitle })),
    industries: industries.map((i) => ({ id: i.id, nameTh: i.nameTh, parentId: i.parentId })),
    projectTypes: projectTypes.map((t) => ({ id: t.id, nameTh: t.nameTh })),
  };
}
