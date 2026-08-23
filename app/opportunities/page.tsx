import Link from "next/link";
import { Avatar, Card, PageHeader, StageBadge, StatCard } from "@/components/ui";
import { CreateProjectWizard } from "@/components/projects/create-project-wizard";
import { ProjectCard, RISK_TH } from "@/components/projects/project-card";
import { StageMenu } from "@/components/projects/stage-menu";
import { ActivateButton } from "@/components/projects/activate-button";
import {
  PROJECT_FILTERS,
  getProjectPipeline,
  isProjectFilter,
  type ProjectFilter,
} from "@/lib/application/projects/get-project-pipeline";
import { getRepositories } from "@/lib/infrastructure";
import { SALES_STAGES, SALES_STAGE_TH } from "@/lib/domain/opportunity";
import { DEMO_USER } from "@/lib/services/authz";
import { baht, shortDate } from "@/lib/format";

// 06 · Project Pipeline (Step 4) — the Opportunity Queue evolved. ONE read
// model powers Board and List; DRAFT is never a stage column; stage changes
// and activation go through server actions → Step-3 use cases only.
export const dynamic = "force-dynamic";

const FILTER_LABEL: Record<ProjectFilter, string> = {
  ALL: "ทั้งหมด",
  MY: "ของฉัน",
  DRAFT: "ฉบับร่าง",
  ACTIVE: "กำลังดำเนินการ",
  AT_RISK: "⚠ At Risk",
  NO_NEXT_ACTION: "ไม่มี Next Action",
  OVERDUE_NEXT_ACTION: "Next Action เลยกำหนด",
  NO_RECENT_ACTIVITY: "ไม่มี activity ≥7 วัน",
  INCOMPLETE_CONTEXT: "ข้อมูลไม่สมบูรณ์",
  WON: "ปิดสำเร็จ",
  LOST: "ไม่สำเร็จ",
  CANCELLED: "ยกเลิก",
};

export default async function ProjectPipelinePage({
  searchParams,
}: PageProps<"/opportunities">) {
  const sp = await searchParams;
  const rawFilter = typeof sp.filter === "string" ? sp.filter : "ALL";
  const filter: ProjectFilter = isProjectFilter(rawFilter) ? rawFilter : "ALL";
  const view = typeof sp.view === "string" && sp.view === "list" ? "list" : "board";

  const repos = await getRepositories();
  const [pipeline, accountsPage, industries, projectTypes] = await Promise.all([
    getProjectPipeline(filter, DEMO_USER),
    repos.accounts.search({ limit: 100 }),
    repos.industries.listAll(),
    repos.projectTypes.listSelectable(),
  ]);
  const masters = {
    industries: industries.map((i) => ({ id: i.id, nameTh: i.nameTh, parentId: i.parentId })),
    projectTypes: projectTypes.map((t) => ({ id: t.id, nameTh: t.nameTh })),
  };
  const href = (f: ProjectFilter, v: string) =>
    `/opportunities?${new URLSearchParams({ ...(f !== "ALL" ? { filter: f } : {}), ...(v !== "board" ? { view: v } : {}) })}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader
          title="06 · Project Pipeline"
          subtitle={`Commercial pipeline — วันนี้ ${pipeline.today}`}
        />
        <CreateProjectWizard
          accounts={accountsPage.items.map((a) => ({ id: a.id, name: a.name }))}
          ownerId={DEMO_USER}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active Projects" value={pipeline.activeCount} />
        <StatCard label="Pipeline Value" value={baht(pipeline.pipelineValue)} accent="text-indigo-600" />
        <StatCard label="At Risk" value={pipeline.atRiskCount} accent="text-rose-600" hint="ตาม risk rules" />
        <StatCard
          label="ปิดแล้ว"
          value={`${pipeline.closed.won}W / ${pipeline.closed.lost}L / ${pipeline.closed.cancelled}C`}
          accent="text-emerald-600"
        />
      </div>

      {/* View toggle + filter chips — URL-driven, server-rendered */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <div className="mr-2 flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
          {(["board", "list"] as const).map((v) => (
            <Link
              key={v}
              href={href(filter, v)}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold ${
                view === v ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {v === "board" ? "Pipeline Board" : "List View"}
            </Link>
          ))}
        </div>
        {PROJECT_FILTERS.map((f) => (
          <Link
            key={f}
            href={href(f, view)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
              filter === f
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {FILTER_LABEL[f]}
          </Link>
        ))}
      </div>

      {view === "board" ? (
        <>
          {/* DRAFT strip — explicitly OUTSIDE the funnel */}
          {pipeline.drafts.length > 0 && (
            <details className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3" open>
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-500">
                ฉบับร่าง (DRAFT) — {pipeline.drafts.length} โปรเจกต์ · ยังไม่เข้า pipeline
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {pipeline.drafts.map((row) => (
                  <ProjectCard key={row.project.id} row={row} masters={masters} />
                ))}
              </div>
            </details>
          )}

          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1200px] grid-cols-6 gap-2">
              {SALES_STAGES.map((stage) => {
                const rows = pipeline.byStage[stage];
                return (
                  <div key={stage} className="rounded-xl bg-slate-100/70 p-2">
                    <p className="mb-2 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {SALES_STAGE_TH[stage]}
                      <span className="rounded-full bg-white px-1.5 text-slate-600">{rows.length}</span>
                    </p>
                    <div className="space-y-2">
                      {rows.map((row) => (
                        <ProjectCard key={row.project.id} row={row} masters={masters} />
                      ))}
                      {rows.length === 0 && (
                        <p className="px-1 pb-1 text-center text-[10px] text-slate-300">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3 font-semibold">Risk</th>
                <th className="px-3 py-3 font-semibold">Project / Account</th>
                <th className="px-3 py-3 font-semibold">Industry</th>
                <th className="px-3 py-3 font-semibold">Moment</th>
                <th className="px-3 py-3 font-semibold">ประเภท</th>
                <th className="px-3 py-3 font-semibold">Revenue</th>
                <th className="px-3 py-3 font-semibold">GP</th>
                <th className="px-3 py-3 font-semibold">Close</th>
                <th className="px-3 py-3 font-semibold">Owner</th>
                <th className="px-3 py-3 font-semibold">Stage</th>
                <th className="px-3 py-3 font-semibold">Activity / Next Action</th>
                <th className="px-3 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pipeline.rows.map((row) => {
                const p = row.project;
                return (
                  <tr key={p.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      {row.riskFlags.length > 0 && (
                        <span title={row.riskFlags.map((f) => RISK_TH[f]).join(" · ")}>⚠️</span>
                      )}
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <p className="text-xs font-bold text-slate-800">{p.name}</p>
                      {row.account && (
                        <Link href={`/accounts/${row.account.id}`} className="mt-0.5 flex items-center gap-1.5 text-[11px] text-indigo-600 hover:underline">
                          <Avatar name={row.account.name} id={row.account.id} size={5} />
                          {row.account.name}
                        </Link>
                      )}
                      {row.incompleteContext && (
                        <p className="mt-1 text-[10px] text-amber-700">ข้อมูลโปรเจกต์เดิมไม่สมบูรณ์ — กรุณาระบุประเภทโปรเจกต์</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-slate-600">
                      {row.subIndustryThai ?? row.industryThai ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.momentThai && (
                        <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                          {row.momentThai}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-slate-600">{row.projectTypeThai ?? "—"}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-700">{baht(p.expectedRevenue)}</td>
                    <td className="px-3 py-3 text-[11px] text-slate-600">{(p.expectedGP * 100).toFixed(0)}%</td>
                    <td className="px-3 py-3 text-[11px] text-slate-600">{shortDate(p.closeDate)}</td>
                    <td className="px-3 py-3 text-[11px] text-slate-500">{row.ownerName}</td>
                    <td className="px-3 py-3">
                      <StageBadge status={p.status} salesStage={p.salesStage} />
                    </td>
                    <td className="max-w-[220px] px-3 py-3 text-[10px]">
                      <span className={row.riskFlags.includes("NO_RECENT_ACTIVITY") ? "font-semibold text-rose-600" : "text-slate-500"}>
                        {row.daysSinceLastActivity === null
                          ? "ไม่มี activity"
                          : `คุย ${row.daysSinceLastActivity === 0 ? "วันนี้" : `${row.daysSinceLastActivity} วันก่อน`}`}
                      </span>
                      {p.nextAction && (
                        <p className="mt-0.5 truncate text-amber-700">
                          ⏭ {p.nextAction}
                          {p.nextActionDate ? ` — ${p.nextActionDate}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.status === "ACTIVE" && p.salesStage && (
                        <StageMenu opportunityId={p.id} currentStage={p.salesStage} />
                      )}
                      {p.status === "DRAFT" && (
                        <ActivateButton
                          opportunityId={p.id}
                          missingHints={[
                            ...(!p.industryId ? ["industry"] : []),
                            ...(!p.projectTypeId ? ["project_type"] : []),
                            ...(!p.nextActionDate ? ["next_action_date"] : []),
                          ]}
                          industries={masters.industries}
                          projectTypes={masters.projectTypes}
                          current={{
                            industryId: p.industryId,
                            subIndustryId: p.subIndustryId,
                            projectTypeId: p.projectTypeId,
                            nextAction: p.nextAction,
                            nextActionDate: p.nextActionDate,
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
