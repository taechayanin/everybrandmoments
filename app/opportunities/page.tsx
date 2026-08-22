import Link from "next/link";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  PriorityBadge,
  StageBadge,
  StatCard,
} from "@/components/ui";
import { getOpportunityQueue } from "@/lib/application/opportunities/get-opportunity-queue";
import { OPPORTUNITY_STAGES } from "@/lib/domain/opportunity";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { SLA_BY_PRIORITY, baht, pct, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpportunityQueue() {
  const view = await getOpportunityQueue();

  return (
    <div>
      <PageHeader
        title="Opportunity Queue"
        subtitle="Commercial Pipeline — Opportunity Stage แยกจาก Moment Status"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open Opportunities" value={view.openCount} />
        <StatCard label="Pipeline Value" value={baht(view.pipelineValue)} accent="text-indigo-600" />
        <StatCard label="Expected GP" value={baht(Math.round(view.weightedGP))} accent="text-emerald-600" hint="ถ่วงน้ำหนักตาม GP Target" />
        <StatCard label="Proposal / Negotiation" value={view.inProposalOrNegotiation} accent="text-amber-600" />
      </div>

      {/* Pipeline strip */}
      <Card className="mb-5 overflow-x-auto p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Opportunity Pipeline (Commercial Stages)
        </p>
        <div className="flex min-w-[600px] items-center gap-1">
          {OPPORTUNITY_STAGES.map((stage, i, arr) => {
            const count = view.rows.filter((r) => r.opportunity.stage === stage).length;
            return (
              <div key={stage} className="flex items-center gap-1">
                <div
                  className={`rounded-lg px-3 py-1.5 text-center ${
                    count > 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <p className="text-[10px] font-semibold leading-tight">{stage}</p>
                  <p className="text-xs font-bold">{count}</p>
                </div>
                {i < arr.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Company / Opportunity</th>
              <th className="px-4 py-3 font-semibold">Moment</th>
              <th className="px-4 py-3 font-semibold">Expected Revenue</th>
              <th className="px-4 py-3 font-semibold">GP</th>
              <th className="px-4 py-3 font-semibold">Close Date</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Stage / SLA</th>
              <th className="px-4 py-3 font-semibold">Next Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {view.rows.map(({ opportunity: o, account: acc, event: e, ownerName }) => {
              const score = e ? totalScore(e.score) : 0;
              return (
                <tr key={o.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">{e && <PriorityBadge score={score} />}</td>
                  <td className="max-w-[260px] px-4 py-3">
                    <Link href={`/accounts/${acc.id}`} className="flex items-start gap-2 hover:text-indigo-600">
                      <Avatar name={acc.name} id={acc.id} size={7} />
                      <span>
                        <span className="block text-xs font-bold text-slate-800">{acc.name}</span>
                        <span className="block text-[11px] text-slate-500">{o.name}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{e && <MomentChip code={e.momentType} small />}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700">{baht(o.expectedRevenue)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{pct(o.expectedGP)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{shortDate(o.closeDate)}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">{ownerName}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={o.stage} />
                    {e && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {SLA_BY_PRIORITY[priorityOf(score)]}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-[11px] text-slate-600">{o.nextAction}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
