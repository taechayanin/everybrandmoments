import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";
import { getTeamMembers } from "@/lib/application/team/get-team-view";
import { baht, pct } from "@/lib/format";
import type { UserId } from "@/lib/types";

export const dynamic = "force-dynamic";

const TEAM_KPI = [
  {
    team: "Growth",
    kpis: [
      { label: "Prospects เดือนนี้", value: "2,480" },
      { label: "MQL", value: "196" },
      { label: "Cost / MQL", value: "฿185" },
      { label: "Signal Quality", value: "72%" },
    ],
  },
  {
    team: "SDR / BDR",
    kpis: [
      { label: "Speed-to-Lead (HOT)", value: "1.4 ชม." },
      { label: "Contact Rate", value: "81%" },
      { label: "MQL → SQL", value: "34%" },
      { label: "Meeting Held", value: "58" },
    ],
  },
  {
    team: "Customer Solution",
    kpis: [
      { label: "Discovery Completed", value: "42" },
      { label: "Opportunity Value", value: baht(3200000) },
      { label: "Win Rate", value: "44%" },
      { label: "Avg Wallet", value: baht(185000) },
    ],
  },
  {
    team: "Customer Success",
    kpis: [
      { label: "Repeat Rate", value: "68%" },
      { label: "Renewal", value: "82%" },
      { label: "Next Moment Set", value: "95%" },
      { label: "Revenue Expansion", value: "+22%" },
    ],
  },
];

const LEADERBOARD: {
  userId: UserId;
  won: number;
  revenue: number;
  gp: number;
  attach: number;
}[] = [
  { userId: "USR-010", won: 8, revenue: 1480000, gp: 0.39, attach: 0.82 },
  { userId: "USR-011", won: 7, revenue: 1260000, gp: 0.41, attach: 0.76 },
  { userId: "USR-012", won: 6, revenue: 940000, gp: 0.4, attach: 0.71 },
  { userId: "USR-004", won: 4, revenue: 380000, gp: 0.4, attach: 0.6 },
  { userId: "USR-003", won: 3, revenue: 290000, gp: 0.38, attach: 0.55 },
];

export default async function TeamPerformance() {
  const users = await getTeamMembers();
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div>
      <PageHeader title="Team Performance" subtitle="KPI แยกตามทีม — Growth / SDR / Customer Solution / Customer Success" />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TEAM_KPI.map((t) => (
          <Card key={t.team} className="p-4">
            <p className="text-sm font-bold text-slate-900">{t.team}</p>
            <div className="mt-3 space-y-2.5">
              {t.kpis.map((k) => (
                <div key={k.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">{k.label}</span>
                  <span className="text-xs font-bold text-slate-800">{k.value}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <SectionTitle title="Leaderboard — YTD 2026" subtitle="เรียงตาม Revenue" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">สมาชิกทีม</th>
                <th className="px-4 py-3 font-semibold">Won</th>
                <th className="px-4 py-3 font-semibold">Revenue</th>
                <th className="px-4 py-3 font-semibold">GP</th>
                <th className="px-4 py-3 font-semibold">Production Attach</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {LEADERBOARD.map((row, i) => {
                const u = userMap.get(row.userId);
                if (!u) return null;
                return (
                  <tr key={row.userId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs font-bold text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} id={u.id} size={8} />
                        <div>
                          <p className="text-xs font-bold text-slate-800">{u.nickname} — {u.name}</p>
                          <p className="text-[11px] text-slate-400">{u.role}{u.center ? ` · ${u.center}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.won}</td>
                    <td className="px-4 py-3 text-xs font-bold text-indigo-600">{baht(row.revenue)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{pct(row.gp)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{pct(row.attach)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-6">
        <SectionTitle title="Weekly Team Review Checklist" subtitle="12 หัวข้อประจำสัปดาห์" />
        <Card className="p-4">
          <div className="grid gap-x-6 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "New Moments", "HOT Moments", "MQL → Opportunity", "Proposal", "Won",
              "Average Wallet", "GP", "Production Attach", "Top Moment", "Top Solution",
              "Offline Conversion", "Next Week Moment Pipeline",
            ].map((item, i) => (
              <p key={item} className="flex items-center gap-2">
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded bg-slate-100 text-[9px] font-bold text-slate-500">
                  {i + 1}
                </span>
                {item}
              </p>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
