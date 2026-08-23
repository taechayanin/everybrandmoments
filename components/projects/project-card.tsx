import Link from "next/link";
import { baht, shortDate } from "@/lib/format";
import type { ProjectPipelineRow } from "@/lib/application/projects/get-project-pipeline";
import type { ProjectRiskFlag } from "@/lib/domain/opportunity";
import { StageMenu } from "./stage-menu";
import { ActivateButton } from "./activate-button";

// Server component card — compact operational context (Step 4 §2). The only
// interactive islands are StageMenu / ActivateButton (client), both of which
// call server actions → use cases. No business rules here.

export const RISK_TH: Record<ProjectRiskFlag, string> = {
  NO_NEXT_ACTION: "ไม่มี Next Action",
  OVERDUE_NEXT_ACTION: "Next Action เลยกำหนด",
  NO_RECENT_ACTIVITY: "ไม่มี activity ≥7 วัน",
  STUCK_IN_STAGE: "ค้าง stage นาน",
  INCOMPLETE_CONTEXT: "ข้อมูลโปรเจกต์เดิมไม่สมบูรณ์",
};

export function ProjectCard({
  row,
  masters,
}: {
  row: ProjectPipelineRow;
  masters: {
    industries: { id: string; nameTh: string; parentId: string | null }[];
    projectTypes: { id: string; nameTh: string }[];
  };
}) {
  const p = row.project;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[11px] font-bold leading-snug text-slate-800">{p.name}</p>
        {row.riskFlags.length > 0 && (
          <span title={row.riskFlags.map((f) => RISK_TH[f]).join(" · ")} className="text-[11px]">⚠️</span>
        )}
      </div>
      {row.account && (
        <Link href={`/accounts/${row.account.id}`} className="text-[10px] text-indigo-600 hover:underline">
          {row.account.name}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
        {row.momentThai && (
          <span className="rounded bg-cyan-50 px-1.5 py-0.5 font-semibold text-cyan-700">{row.momentThai}</span>
        )}
        {row.industryThai && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
            {row.subIndustryThai ?? row.industryThai}
          </span>
        )}
        {row.projectTypeThai ? (
          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{row.projectTypeThai}</span>
        ) : (
          p.status !== "DRAFT" && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">ยังไม่ระบุประเภท</span>
          )
        )}
      </div>
      {row.incompleteContext && (
        <p className="mt-1 rounded bg-amber-50 px-1.5 py-1 text-[9px] leading-snug text-amber-800">
          ข้อมูลโปรเจกต์เดิมไม่สมบูรณ์ — กรุณาระบุประเภทโปรเจกต์
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="font-bold text-slate-700">
          {baht(p.expectedRevenue)}
          <span className="ml-1 font-normal text-slate-400">GP {(p.expectedGP * 100).toFixed(0)}%</span>
        </span>
        <span className="text-slate-400">ปิด {shortDate(p.closeDate)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>{row.ownerName}</span>
        <span>
          {row.daysSinceLastActivity === null
            ? "ไม่มี activity"
            : row.daysSinceLastActivity === 0
              ? "คุยวันนี้"
              : `คุย ${row.daysSinceLastActivity} วันก่อน`}
        </span>
      </div>
      {p.nextAction && (
        <p className="mt-1 truncate text-[10px] text-amber-700">
          ⏭ {p.nextAction}
          {p.nextActionDate ? ` — ${p.nextActionDate}` : ""}
        </p>
      )}
      <div className="mt-1.5 flex justify-end gap-1">
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
      </div>
    </div>
  );
}
