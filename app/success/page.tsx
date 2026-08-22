import Link from "next/link";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  SectionTitle,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { ACCOUNTS, accountById } from "@/lib/data/accounts";
import { MOMENT_EVENTS } from "@/lib/data/events";
import { momentByCode } from "@/lib/data/moments";
import { baht, monthYear, shortDate } from "@/lib/format";

export default function CustomerSuccess() {
  const delivered = MOMENT_EVENTS.filter((e) => ["Won", "Delivery"].includes(e.status))
    .sort((a, b) => b.expectedEventDate.localeCompare(a.expectedEventDate))
    .slice(0, 8);
  const atRisk = ACCOUNTS.filter((a) => a.health === "At Risk");
  const healthy = ACCOUNTS.filter((a) => a.health === "Healthy");
  const recoverEvents = MOMENT_EVENTS.filter(
    (e) => e.momentType === "EBM Recover" && !["Won", "Lost"].includes(e.status),
  );
  const returnEvents = MOMENT_EVENTS.filter(
    (e) => e.momentType === "EBM Return" && !["Won", "Lost"].includes(e.status),
  );

  return (
    <div>
      <PageHeader
        title="Customer Success"
        subtitle="หลัง Won ระบบไม่จบ — ทุก Project ต้องมี Next Moment"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Healthy Accounts" value={healthy.length} accent="text-emerald-600" />
        <StatCard label="At-Risk Accounts" value={atRisk.length} accent="text-orange-600" />
        <StatCard label="Recover กำลังดูแล" value={recoverEvents.length} accent="text-red-600" />
        <StatCard label="Win-back Queue" value={returnEvents.length} accent="text-purple-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <SectionTitle
            title="Recently Delivered → Next Moment"
            subtitle="งานที่ส่งมอบแล้ว — ตั้ง Next Expected Moment ทุกงาน"
          />
          <div className="space-y-2.5">
            {delivered.map((e) => {
              const acc = accountById.get(e.accountId)!;
              const nextMoment = momentByCode.get(e.nextExpectedMoment);
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={acc.name} id={acc.id} size={8} />
                      <div>
                        <p className="text-xs font-bold text-slate-800">{acc.name}</p>
                        <p className="text-[11px] text-slate-500">{e.subMoment}</p>
                      </div>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
                    <MomentChip code={e.momentType} small />
                    <span className="text-slate-400">→ Next:</span>
                    <MomentChip code={e.nextExpectedMoment} small />
                    {nextMoment && (
                      <span className="hidden text-slate-400 sm:inline">
                        ({nextMoment.description})
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    ส่งมอบ {monthYear(e.expectedEventDate)} · มูลค่า {baht(e.potentialWalletMax)}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle title="At-Risk / Recover" subtitle="ต้องดูแลทันที" />
            <div className="space-y-2.5">
              {recoverEvents.map((e) => {
                const acc = accountById.get(e.accountId)!;
                return (
                  <Card key={e.id} className="border-red-200 bg-red-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">⚠ {acc.name}</p>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="mt-1 text-xs text-red-700">{e.triggerDetail}</p>
                    <p className="mt-2 text-[11px] text-slate-600">→ {e.recommendedAction}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      หยุด Marketing Automation แล้ว · Next: {e.nextExpectedMoment}
                    </p>
                  </Card>
                );
              })}
              {atRisk
                .filter((a) => !recoverEvents.some((e) => e.accountId === a.id))
                .map((a) => (
                  <Card key={a.id} className="border-orange-200 bg-orange-50/40 p-4">
                    <p className="text-sm font-bold text-slate-900">{a.name}</p>
                    <p className="mt-1 text-xs text-orange-700">{a.notes}</p>
                  </Card>
                ))}
            </div>
          </div>

          <div>
            <SectionTitle title="Win-back Queue (EBM Return)" />
            <div className="space-y-2.5">
              {returnEvents.map((e) => {
                const acc = accountById.get(e.accountId)!;
                return (
                  <Card key={e.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{acc.name}</p>
                      <MomentChip code="EBM Return" small />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{e.triggerDetail}</p>
                    <p className="mt-1.5 text-[11px] text-indigo-700">→ {e.recommendedAction}</p>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <SectionTitle title="Renewal / Repeat กำลังจะถึง" />
            <Card className="divide-y divide-slate-50">
              {MOMENT_EVENTS.filter(
                (e) =>
                  ["EBM Repeat", "EBM Season"].includes(e.momentType) &&
                  !["Won", "Lost", "Delivery"].includes(e.status),
              ).map((e) => {
                const acc = accountById.get(e.accountId)!;
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{acc.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{e.subMoment}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-semibold text-slate-600">
                        {shortDate(e.expectedEventDate)}
                      </p>
                      <Link
                        href={`/workspace?event=${e.id}`}
                        className="text-[11px] font-medium text-indigo-600 hover:underline"
                      >
                        เปิด Workspace →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
