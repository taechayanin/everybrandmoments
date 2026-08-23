import Link from "next/link";
import { Avatar, Card, MomentChip, PageHeader, PriorityBadge } from "@/components/ui";
import {
  ACCOUNT_LIST_FILTERS,
  getAccountList,
  isAccountListFilter,
  type AccountListFilter,
} from "@/lib/application/accounts/get-account-list";
import { DEMO_USER } from "@/lib/services/authz";
import { baht } from "@/lib/format";

// Operational account list (Step 7, spec §47–§48): who needs attention now —
// server-rendered; filters are plain links (?filter=…), state lives in the URL.
export const dynamic = "force-dynamic";

const HEALTH_STYLE: Record<string, string> = {
  Healthy: "bg-emerald-50 text-emerald-700",
  Stable: "bg-slate-100 text-slate-600",
  "At Risk": "bg-rose-50 text-rose-700",
  Churned: "bg-red-50 text-red-700",
};

const FILTER_LABEL: Record<AccountListFilter, string> = {
  ALL: "ทั้งหมด",
  MY: "ของฉัน",
  HOT: "🔥 HOT Moment",
  NO_FOLLOWUP: "ไม่มี Follow-up",
  NO_CONTACT_7: "ไม่ติดต่อ 7 วัน",
  NO_CONTACT_14: "ไม่ติดต่อ 14 วัน",
  NO_CONTACT_30: "ไม่ติดต่อ 30 วัน",
  AT_RISK: "⚠ At Risk",
  OPEN_OPP: "มี Opportunity",
  DUE_TODAY: "นัดวันนี้",
  OVERDUE: "เกินกำหนด",
};

export default async function AccountsPage({
  searchParams,
}: PageProps<"/accounts">) {
  const params = await searchParams;
  const raw = typeof params.filter === "string" ? params.filter : "ALL";
  const filter: AccountListFilter = isAccountListFilter(raw) ? raw : "ALL";

  const view = await getAccountList(filter, DEMO_USER);

  return (
    <div>
      <PageHeader
        title="Business Accounts"
        subtitle={`${view.rows.length} จาก ${view.totalBeforeFilter} accounts · วันนี้ ${view.today}`}
      />

      {/* Filter chips — URL-driven, server-rendered */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {ACCOUNT_LIST_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/accounts" : `/accounts?filter=${f}`}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              filter === f
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {FILTER_LABEL[f]}
          </Link>
        ))}
      </div>

      {view.rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-slate-500">
            ไม่มี account ที่ตรงเงื่อนไข “{FILTER_LABEL[filter]}”
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Current Moment</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Last Activity</th>
                <th className="px-4 py-3 font-semibold">Next Follow-up</th>
                <th className="px-4 py-3 font-semibold">Pipeline</th>
                <th className="px-4 py-3 font-semibold">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {view.rows.map((row) => {
                const a = row.account;
                return (
                  <tr key={a.id} className="align-top hover:bg-slate-50/60">
                    <td className="max-w-[240px] px-4 py-3">
                      <Link href={`/accounts/${a.id}`} className="flex items-start gap-2 hover:text-indigo-600">
                        <Avatar name={a.name} id={a.id} size={7} />
                        <span>
                          <span className="block text-xs font-bold text-slate-800">{a.name}</span>
                          <span className="block text-[10px] text-slate-400">
                            {a.industry}
                            {a.customerSince ? "" : " · 🆕 Prospect"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">{a.ownerId}</td>
                    <td className="px-4 py-3">
                      {row.currentMoment ? (
                        <MomentChip code={row.currentMoment.momentType} small />
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.momentScore !== null && <PriorityBadge score={row.momentScore} />}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      {row.daysSinceLastActivity === null ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                          ยังไม่เคยบันทึก
                        </span>
                      ) : (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            row.daysSinceLastActivity >= 7
                              ? "bg-rose-100 text-rose-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {row.daysSinceLastActivity === 0
                            ? "วันนี้"
                            : `${row.daysSinceLastActivity} วันก่อน`}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-[11px]">
                      {row.nextFollowUp ? (
                        <span
                          className={
                            row.nextFollowUp.dueDate && row.nextFollowUp.dueDate < view.today
                              ? "font-semibold text-rose-600"
                              : row.nextFollowUp.dueDate === view.today
                                ? "font-semibold text-amber-600"
                                : "text-slate-600"
                          }
                        >
                          ⏭ {row.nextFollowUp.title}
                          {row.nextFollowUp.dueDate ? ` — ${row.nextFollowUp.dueDate}` : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">ไม่มีนัด</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      {row.openOpportunityCount > 0 ? (
                        <span className="font-bold text-slate-700">
                          {baht(row.openPipelineValue)}
                          <span className="ml-1 font-normal text-slate-400">
                            ({row.openOpportunityCount})
                          </span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${HEALTH_STYLE[a.health]}`}>
                        {a.health}
                      </span>
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
