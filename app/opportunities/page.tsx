import Link from "next/link";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  PriorityBadge,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { accountById } from "@/lib/data/accounts";
import { eventById } from "@/lib/data/events";
import { OPPORTUNITIES } from "@/lib/data/opportunities";
import { userName } from "@/lib/data/users";
import { SLA_BY_PRIORITY, baht, pct, priorityOf, shortDate, totalScore } from "@/lib/format";

const PIPELINE_ORDER = [
  "Detected", "Review", "Contacted", "Qualified", "Meeting Booked",
  "Discovery Completed", "Solution Design", "Proposal", "Negotiation",
  "Won", "Lost", "Delivery", "Next Moment",
];

export default function OpportunityQueue() {
  const opps = [...OPPORTUNITIES].sort((a, b) => {
    const ea = eventById.get(a.momentEventId);
    const eb = eventById.get(b.momentEventId);
    return (eb ? totalScore(eb.score) : 0) - (ea ? totalScore(ea.score) : 0);
  });

  const totalPipeline = opps
    .filter((o) => !["Won", "Lost", "Delivery"].includes(o.status))
    .reduce((s, o) => s + o.expectedRevenue, 0);
  const weightedGP = opps
    .filter((o) => !["Won", "Lost", "Delivery"].includes(o.status))
    .reduce((s, o) => s + o.expectedRevenue * o.expectedGP, 0);
  const inNegotiation = opps.filter((o) => ["Proposal", "Negotiation"].includes(o.status));

  return (
    <div>
      <PageHeader
        title="Opportunity Queue"
        subtitle="Moment ที่ Qualified แล้ว — เรียงตาม Priority Score"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open Opportunities" value={opps.filter((o) => !["Won", "Lost", "Delivery"].includes(o.status)).length} />
        <StatCard label="Pipeline Value" value={baht(totalPipeline)} accent="text-indigo-600" />
        <StatCard label="Expected GP" value={baht(Math.round(weightedGP))} accent="text-emerald-600" hint="ถ่วงน้ำหนักตาม GP Target" />
        <StatCard label="Proposal / Negotiation" value={inNegotiation.length} accent="text-amber-600" />
      </div>

      {/* Pipeline strip */}
      <Card className="mb-5 overflow-x-auto p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Opportunity Pipeline
        </p>
        <div className="flex min-w-[900px] items-center gap-1">
          {PIPELINE_ORDER.filter((s) => !["Lost"].includes(s)).map((status, i, arr) => {
            const count = opps.filter((o) => o.status === status).length;
            return (
              <div key={status} className="flex items-center gap-1">
                <div
                  className={`rounded-lg px-2.5 py-1.5 text-center ${
                    count > 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <p className="text-[10px] font-semibold leading-tight">{status}</p>
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
              <th className="px-4 py-3 font-semibold">Status / SLA</th>
              <th className="px-4 py-3 font-semibold">Next Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {opps.map((o) => {
              const acc = accountById.get(o.accountId)!;
              const e = eventById.get(o.momentEventId);
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
                  <td className="px-4 py-3 text-[11px] text-slate-500">{userName(o.ownerId)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
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
