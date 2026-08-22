import { Card, MomentChip, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { ACCOUNTS } from "@/lib/data/accounts";
import { MOMENT_EVENTS } from "@/lib/data/events";
import { baht, pct, totalScore } from "@/lib/format";

const FUNNEL = [
  { label: "Prospects", value: 30000 },
  { label: "ICP Qualified", value: 13500 },
  { label: "Engaged", value: 6000 },
  { label: "MQL", value: 2400 },
  { label: "Meetings Booked", value: 1200 },
  { label: "Meetings Held", value: 720 },
  { label: "Opportunities", value: 576 },
  { label: "Proposals", value: 288 },
  { label: "New Customers", value: 110 },
];

// Moment economics summary (mock aggregates)
const MOMENT_ECONOMICS = [
  { moment: "EBM Expand", revenue: 1180000, gp: 0.38, attach: 0.85, repeat: 0.7 },
  { moment: "EBM Season", revenue: 1030000, gp: 0.4, attach: 0.75, repeat: 0.8 },
  { moment: "EBM Hire", revenue: 920000, gp: 0.38, attach: 0.8, repeat: 0.65 },
  { moment: "EBM Build", revenue: 860000, gp: 0.37, attach: 0.9, repeat: 0.55 },
  { moment: "EBM Welcome", revenue: 540000, gp: 0.4, attach: 0.7, repeat: 0.65 },
  { moment: "EBM Milestone", revenue: 420000, gp: 0.42, attach: 0.6, repeat: 0.5 },
  { moment: "EBM Repeat", revenue: 400000, gp: 0.4, attach: 0.65, repeat: 0.9 },
  { moment: "EBM Engage", revenue: 320000, gp: 0.39, attach: 0.6, repeat: 0.6 },
];

export default function Analytics() {
  const activeAccounts = ACCOUNTS.filter((a) => a.customerSince).length;
  const totalLtv = ACCOUNTS.reduce((s, a) => s + a.ltv, 0);
  const totalGp = ACCOUNTS.reduce((s, a) => s + a.grossProfit, 0);
  const detected = MOMENT_EVENTS.length;
  const won = MOMENT_EVENTS.filter((e) => e.status === "Won").length;
  const hot = MOMENT_EVENTS.filter((e) => totalScore(e.score) >= 85).length;
  const maxRevenue = Math.max(...MOMENT_ECONOMICS.map((m) => m.revenue));

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Executive Dashboard — Account / Moment / Revenue / Solution / Offline" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active Business Accounts" value={activeAccounts} hint="มี Transaction ใน 12 เดือน" />
        <StatCard label="Moments Detected" value={detected} hint="ทั้งหมดในระบบ" />
        <StatCard label="HOT Moments" value={hot} accent="text-red-600" />
        <StatCard label="Moment → Won" value={won} accent="text-emerald-600" />
        <StatCard label="Total LTV" value={baht(totalLtv)} accent="text-indigo-600" />
        <StatCard label="Total GP" value={baht(totalGp)} hint={`≈ ${pct(totalGp / Math.max(totalLtv, 1))} ของ LTV`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Core funnel */}
        <div>
          <SectionTitle title="Core Funnel" subtitle="เป้าหมายรายปี — วัด Conversion ทุก Step" />
          <Card className="p-5">
            <div className="space-y-2">
              {FUNNEL.map((f, i) => {
                const width = Math.max((f.value / FUNNEL[0].value) * 82, 1.5);
                const conv = i > 0 ? f.value / FUNNEL[i - 1].value : 1;
                return (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-right text-[11px] text-slate-500">{f.label}</span>
                    <div className="flex h-6 flex-1 items-center gap-2">
                      <div
                        className="h-6 shrink-0 rounded-r-md bg-indigo-500"
                        style={{ width: `${width}%` }}
                      />
                      <span className="whitespace-nowrap text-[10px] font-bold text-slate-700">
                        {f.value.toLocaleString()}
                      </span>
                    </div>
                    <span className="w-12 shrink-0 text-[10px] text-slate-400">
                      {i > 0 ? pct(conv) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Revenue by moment */}
        <div>
          <SectionTitle title="Revenue by Moment" subtitle="12 เดือนล่าสุด (Mock)" />
          <Card className="p-5">
            <div className="space-y-2.5">
              {MOMENT_ECONOMICS.map((m) => (
                <div key={m.moment} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-right">
                    <MomentChip code={m.moment} small />
                  </span>
                  <div className="h-5 flex-1">
                    <div
                      className="h-5 rounded-r-md bg-indigo-500"
                      style={{ width: `${(m.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-[11px] font-semibold text-slate-700">
                    {baht(m.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Moment economics table */}
      <div className="mt-6">
        <SectionTitle
          title="Moment Economics"
          subtitle="เปรียบเทียบ Moment: Revenue / GP / Production Attach / Repeat Probability"
        />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">Moment</th>
                <th className="px-4 py-3 font-semibold">Revenue (12 เดือน)</th>
                <th className="px-4 py-3 font-semibold">Avg GP</th>
                <th className="px-4 py-3 font-semibold">Production Attach</th>
                <th className="px-4 py-3 font-semibold">Repeat Probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {MOMENT_ECONOMICS.map((m) => (
                <tr key={m.moment} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3"><MomentChip code={m.moment} small /></td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700">{baht(m.revenue)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{pct(m.gp)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{pct(m.attach)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{pct(m.repeat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* North star */}
      <div className="mt-6">
        <SectionTitle title="North Star Metrics" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard label="#1 Active Accounts" value={activeAccounts} />
          <StatCard label="#2 Moments / Account / ปี" value="2.5" hint="เป้า: เพิ่มขึ้นทุกไตรมาส" />
          <StatCard label="#3 Revenue / Account" value={baht(Math.round(totalLtv / Math.max(activeAccounts, 1)))} />
          <StatCard label="#4 GP / Account" value={baht(Math.round(totalGp / Math.max(activeAccounts, 1)))} />
          <StatCard label="#5 Production Attach" value="74%" />
          <StatCard label="#6 Repeat / Renewal" value="68%" />
        </div>
      </div>
    </div>
  );
}
