import Link from "next/link";
import { Avatar, Card, MomentChip, PageHeader } from "@/components/ui";
import { searchAccounts } from "@/lib/application/accounts/search-accounts";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { baht } from "@/lib/format";

const HEALTH_STYLE: Record<string, string> = {
  Healthy: "bg-emerald-50 text-emerald-700",
  Stable: "bg-slate-100 text-slate-600",
  "At Risk": "bg-orange-50 text-orange-700",
  Churned: "bg-red-50 text-red-700",
};

export default async function AccountsPage() {
  const rows = await searchAccounts();

  return (
    <div>
      <PageHeader
        title="Business Accounts"
        subtitle={`${rows.length} accounts · เรียงตาม Account Score`}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ account: a, currentMoment: current }) => (
          <Link key={a.id} href={`/accounts/${a.id}`}>
            <Card className="h-full p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar name={a.name} id={a.id} size={10} />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{a.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {a.industry} · {a.location}
                    </p>
                  </div>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${HEALTH_STYLE[a.health]}`}>
                  {a.health}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">LTV</p>
                  <p className="text-xs font-bold text-slate-800">{a.ltv ? baht(a.ltv) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">GP</p>
                  <p className="text-xs font-bold text-slate-800">{a.grossProfit ? baht(a.grossProfit) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Score</p>
                  <p className="text-xs font-bold text-indigo-600">{a.accountScore}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400">Current:</span>
                {current ? (
                  <>
                    <MomentChip code={current.momentType} small />
                    <span className="font-semibold text-slate-600">
                      {totalScore(current.score)} {priorityOf(totalScore(current.score))}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">ไม่มี Moment Active</span>
                )}
              </div>
              {current && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Next: <span className="text-indigo-600">{current.nextExpectedMoment}</span>
                </p>
              )}
              <p className="mt-2 text-[10px] text-slate-400">
                {a.tier} · {a.employeeSize} คน · {a.branchCount} สาขา
                {a.customerSince ? "" : " · 🆕 Prospect"}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
