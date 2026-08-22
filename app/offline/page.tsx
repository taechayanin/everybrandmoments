import { MapPin } from "lucide-react";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { accountById } from "@/lib/data/accounts";
import { APPOINTMENTS, CENTERS } from "@/lib/data/opportunities";
import { userName } from "@/lib/data/users";
import { baht, pct, shortDate } from "@/lib/format";

export default function OfflineCenter() {
  return (
    <div>
      <PageHeader
        title="Offline Center"
        subtitle="Route ลูกค้าเข้า Offline ตาม Need — Business Center / Studio / Partner Point"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Appointments สัปดาห์นี้" value={APPOINTMENTS.length} />
        <StatCard
          label="Expected Wallet รวม"
          value={baht(APPOINTMENTS.reduce((s, a) => s + a.expectedWallet, 0))}
          accent="text-indigo-600"
        />
        <StatCard label="Centers เปิดใช้งาน" value={CENTERS.length} />
        <StatCard label="Avg Close Rate" value={pct(CENTERS.reduce((s, c) => s + c.closeRate, 0) / CENTERS.length)} accent="text-emerald-600" />
      </div>

      {/* Routing Logic */}
      <Card className="mb-6 p-4">
        <SectionTitle title="Routing Logic" />
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-red-50 p-3 text-red-800">
            <p className="font-bold">Priority Offline</p>
            <p className="mt-1">Wallet ≥ ฿300K</p>
          </div>
          <div className="rounded-lg bg-orange-50 p-3 text-orange-800">
            <p className="font-bold">Recommend Offline</p>
            <p className="mt-1">Wallet ≥ ฿100K + Complexity HIGH</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-blue-800">
            <p className="font-bold">Recommend Offline</p>
            <p className="mt-1">Need: Packaging / Material / Uniform / Signage / Samples</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 text-slate-700">
            <p className="font-bold">Inside Sales / Online</p>
            <p className="mt-1">Low-ticket / Standardized Solution</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Bookings */}
        <div>
          <SectionTitle title="Offline Bookings" subtitle="นัดหมายที่กำลังจะถึง" />
          <div className="space-y-2.5">
            {APPOINTMENTS.map((a) => {
              const acc = accountById.get(a.accountId)!;
              return (
                <Card key={a.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{acc.name}</p>
                    <span className="text-xs font-bold text-indigo-600">
                      {shortDate(a.datetime)} · {a.datetime.slice(11, 16)} น.
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{a.need}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {a.center}
                    </span>
                    <span>Consultant: {userName(a.consultantId)}</span>
                    <span className="font-semibold text-slate-700">
                      Expected {baht(a.expectedWallet)}
                    </span>
                  </div>
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                    🎒 Samples: {a.samples.join(" · ")}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Center dashboards */}
        <div>
          <SectionTitle title="Branch / Center Dashboard" subtitle="ผลงานรายศูนย์เดือนนี้" />
          <div className="space-y-2.5">
            {CENTERS.map((c) => (
              <Card key={c.name} className="p-4">
                <p className="text-sm font-bold text-slate-900">{c.name}</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-[11px] sm:grid-cols-6">
                  <CenterStat label="นัดวันนี้" value={String(c.appointmentsToday)} />
                  <CenterStat label="HOT Opps" value={String(c.hotOpportunities)} />
                  <CenterStat label="Visit Rate" value={pct(c.visitRate)} />
                  <CenterStat label="Close Rate" value={pct(c.closeRate)} />
                  <CenterStat label="Revenue MTD" value={baht(c.revenueMTD)} />
                  <CenterStat label="GP" value={pct(c.gpMTD)} />
                </div>
                <p className="mt-2.5 text-[11px] text-slate-500">
                  Top Moments: {c.topMoments.join(" · ")}
                </p>
              </Card>
            ))}
          </div>

          <div className="mt-6">
            <SectionTitle title="Location Expansion Intelligence" subtitle="ควรเปิด EBM Center ต่อไปที่ไหน?" />
            <Card className="p-4">
              <div className="space-y-2">
                {[
                  { area: "ขอนแก่น", demand: 0.72, pipeline: 850000, note: "Rung Ruang Hub + SME โซนอีสานหนาแน่น" },
                  { area: "เชียงใหม่", demand: 0.61, pipeline: 520000, note: "F&B / Craft cluster โตต่อเนื่อง" },
                  { area: "ภูเก็ต", demand: 0.55, pipeline: 470000, note: "Hospitality โซนท่องเที่ยว — Seasonal สูง" },
                ].map((l) => (
                  <div key={l.area} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{l.area}</span>
                      <span className="font-semibold text-indigo-600">Pipeline {baht(l.pipeline)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-200">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${l.demand * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Demand Density {pct(l.demand)} — {l.note}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                New Location Gate: Lead Density → Meeting Demand → Pipeline → Unit Economics → Payback &lt;18–24 เดือน
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-1 py-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="mt-0.5 font-bold text-slate-800">{value}</p>
    </div>
  );
}
