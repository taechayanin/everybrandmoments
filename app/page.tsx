import Link from "next/link";
import { ArrowRight, CalendarClock, Clock3, MapPin } from "lucide-react";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  PriorityBadge,
  SectionTitle,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { accountById } from "@/lib/data/accounts";
import { MOMENT_EVENTS } from "@/lib/data/events";
import { APPOINTMENTS, OPPORTUNITIES } from "@/lib/data/opportunities";
import { userName } from "@/lib/data/users";
import {
  SLA_BY_PRIORITY,
  TODAY,
  daysUntil,
  priorityOf,
  shortDate,
  thDate,
  totalScore,
  walletRange,
} from "@/lib/format";

const ACTIVE_STATUSES = new Set([
  "Detected", "Review", "Contacted", "Qualified", "Meeting Booked",
  "Discovery Completed", "Solution Design", "Proposal", "Negotiation",
]);

export default function CommandCenter() {
  const active = MOMENT_EVENTS.filter((e) => ACTIVE_STATUSES.has(e.status));
  const hot = active.filter((e) => priorityOf(totalScore(e.score)) === "HOT");
  const newToday = MOMENT_EVENTS.filter((e) => e.detectedAt === TODAY);
  const newThisWeek = MOMENT_EVENTS.filter((e) => daysUntil(e.detectedAt) >= -7 && daysUntil(e.detectedAt) <= 0);
  const qualified = active.filter((e) =>
    ["Qualified", "Meeting Booked", "Discovery Completed", "Solution Design"].includes(e.status),
  );
  const proposals = OPPORTUNITIES.filter((o) => ["Proposal", "Negotiation"].includes(o.status));
  const wonThisMonth = MOMENT_EVENTS.filter(
    (e) => e.status === "Won" && e.expectedEventDate.startsWith("2026-08"),
  );
  const atRisk = ["ACC-003", "ACC-012"];
  const next30 = active.filter((e) => {
    const d = daysUntil(e.expectedEventDate);
    return d >= 0 && d <= 30;
  });
  const apptToday = APPOINTMENTS.filter((a) => a.datetime.startsWith(TODAY));

  const feed = [...active]
    .sort((a, b) => totalScore(b.score) - totalScore(a.score))
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Command Center"
        subtitle={`สวัสดีตอนเช้า 👋 วันนี้ ${thDate(TODAY)} — มี ${hot.length} HOT Moments ที่ต้องทำงานก่อน`}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="New Moments (7 วัน)" value={newThisWeek.length} hint={`วันนี้ ${newToday.length} รายการ`} />
        <StatCard label="HOT Moments" value={hot.length} accent="text-red-600" hint="SLA: ติดต่อภายใน 2 ชม." />
        <StatCard label="Qualified Opportunities" value={qualified.length} accent="text-blue-600" hint="อยู่ระหว่าง Discovery–Design" />
        <StatCard label="Proposal / Negotiation" value={proposals.length} accent="text-amber-600" hint="รอปิดภายใน 30 วัน" />
        <StatCard label="Won เดือนนี้" value={wonThisMonth.length} accent="text-emerald-600" hint="ส.ค. 2569" />
        <StatCard label="At-Risk Accounts" value={atRisk.length} accent="text-orange-600" hint="Recover + Return" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Priority Feed */}
        <div className="xl:col-span-2">
          <SectionTitle
            title="Priority Feed"
            subtitle="เรียงตาม Moment Score — เริ่มจากบนสุด"
            action={
              <Link href="/radar" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                ดูทั้งหมดใน Radar <ArrowRight size={12} />
              </Link>
            }
          />
          <div className="space-y-2.5">
            {feed.map((e) => {
              const acc = accountById.get(e.accountId)!;
              const score = totalScore(e.score);
              const prio = priorityOf(score);
              return (
                <Card key={e.id} className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar name={acc.name} id={acc.id} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/accounts/${acc.id}`} className="text-sm font-semibold text-slate-900 hover:text-indigo-600">
                            {acc.name}
                          </Link>
                          <MomentChip code={e.momentType} small />
                          <StatusBadge status={e.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {e.subMoment} · Trigger: {e.triggerDetail}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">
                            Wallet {walletRange(e.potentialWalletMin, e.potentialWalletMax)}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarClock size={11} /> คาดว่าเกิด {shortDate(e.expectedEventDate)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock3 size={11} /> {SLA_BY_PRIORITY[prio]}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-indigo-700">
                          → {e.recommendedAction}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <PriorityBadge score={score} />
                      <span className="text-[11px] text-slate-400">{userName(e.ownerId)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <div>
            <SectionTitle title="นัดหมายวันนี้" subtitle={thDate(TODAY)} />
            {apptToday.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">ไม่มีนัดหมายวันนี้</Card>
            ) : (
              <div className="space-y-2.5">
                {apptToday.map((a) => {
                  const acc = accountById.get(a.accountId)!;
                  return (
                    <Card key={a.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">{acc.name}</p>
                        <span className="text-xs font-bold text-indigo-600">
                          {a.datetime.slice(11, 16)} น.
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{a.need}</p>
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin size={11} /> {a.center} · {userName(a.consultantId)}
                      </p>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <SectionTitle title="Next 30-Day Moments" subtitle={`${next30.length} Moment กำลังจะเกิดใน 30 วัน`} />
            <Card className="divide-y divide-slate-100">
              {next30.slice(0, 6).map((e) => {
                const acc = accountById.get(e.accountId)!;
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{acc.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{e.momentType} — {e.subMoment}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-slate-500">
                      อีก {daysUntil(e.expectedEventDate)} วัน
                    </span>
                  </div>
                );
              })}
            </Card>
          </div>

          <div>
            <SectionTitle title="Proposal ที่ต้อง Follow-up" />
            <Card className="divide-y divide-slate-100">
              {proposals.map((o) => (
                <div key={o.id} className="px-4 py-2.5">
                  <p className="truncate text-xs font-semibold text-slate-800">{o.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    ปิดภายใน {shortDate(o.closeDate)} · {o.nextAction}
                  </p>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
