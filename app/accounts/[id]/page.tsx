import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Sparkles, X } from "lucide-react";
import {
  Avatar,
  Card,
  MomentChip,
  PriorityBadge,
  SectionTitle,
  StatusBadge,
} from "@/components/ui";
import { ActivityTimeline } from "@/components/crm/timeline";
import { SuggestionsPanel } from "@/components/crm/suggestions-panel";
import { ContactsPanel } from "@/components/crm/contacts-panel";
import { QuickActions } from "@/components/crm/quick-actions";
import { TasksPanel } from "@/components/crm/tasks-panel";
import { getAccount360 } from "@/lib/application/accounts/get-account-360";
import { isAccountId } from "@/lib/domain/ids";
import { totalScore } from "@/lib/domain/score";
import { WHITESPACE_CATEGORIES } from "@/lib/domain/account";
import type { CustomerHealth } from "@/lib/types";
import {
  baht,
  bahtFull,
  monthYear,
  shortDate,
  walletRange,
} from "@/lib/format";
import { momentColor } from "@/lib/domain/master-moments";

// Dynamic server-rendered page — no generateStaticParams. Account data will
// come from D1 and must not be baked in at build time (refactor plan §31).
export const dynamic = "force-dynamic";

const HEALTH_BADGE: Record<CustomerHealth, string> = {
  Healthy: "bg-emerald-50 text-emerald-700",
  Stable: "bg-sky-50 text-sky-700",
  "At Risk": "bg-rose-50 text-rose-700",
  Churned: "bg-slate-100 text-slate-500",
};

export default async function Account360({
  params,
}: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  if (!isAccountId(id)) notFound();

  const view = await getAccount360(id);
  if (!view) notFound();

  const {
    account: acc,
    activeMoments,
    timeline,
    recommendedSolutions,
    ownerName,
    crmTimeline,
    timelineContacts,
    contacts,
    taskBands,
    openOpportunities,
    pendingSuggestions,
  } = view;
  const topMoment = activeMoments[0];

  return (
    <div>
      <Link href="/accounts" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600">
        <ArrowLeft size={13} /> Business Accounts
      </Link>

      {/* Header — who is this customer, what moment, how healthy (spec §6) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={acc.name} id={acc.id} size={13} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">{acc.name}</h1>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${HEALTH_BADGE[acc.health]}`}>
                  {acc.health}
                </span>
                {topMoment && <PriorityBadge score={totalScore(topMoment.score)} />}
              </div>
              <p className="text-xs text-slate-500">
                {acc.industry} · {acc.location} · {acc.employeeSize} คน · {acc.branchCount} สาขา
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                  {acc.tier} Account
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                  Owner: {ownerName}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                  {acc.customerSince ? `ลูกค้าตั้งแต่ ${monthYear(acc.customerSince)}` : "🆕 Prospect"}
                </span>
                {topMoment && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                    Wallet {walletRange(topMoment.potentialWalletMin, topMoment.potentialWalletMax)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center sm:grid-cols-5">
            <HeaderStat label="LTV" value={acc.ltv ? baht(acc.ltv) : "—"} />
            <HeaderStat label="Gross Profit" value={acc.grossProfit ? baht(acc.grossProfit) : "—"} />
            <HeaderStat label="Account Score" value={String(acc.accountScore)} accent />
            <HeaderStat
              label="Current Moment"
              value={topMoment ? topMoment.momentType.replace("EBM ", "") : "—"}
            />
            <HeaderStat
              label="Next Moment"
              value={topMoment ? topMoment.nextExpectedMoment.replace("EBM ", "") : "—"}
            />
          </div>
        </div>
        {acc.notes && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            📌 {acc.notes}
          </p>
        )}
        {/* Quick Actions — primary CRM actions, never hidden (spec §6) */}
        <div className="mt-4 border-t border-slate-100 pt-3.5">
          <QuickActions
            accountId={acc.id}
            contacts={contacts}
            activeMoments={activeMoments}
            openOpportunities={openOpportunities}
          />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Left — the working column: what did we last discuss */}
        <div className="space-y-6 xl:col-span-2">
          {pendingSuggestions.length > 0 && (
            <SuggestionsPanel suggestions={pendingSuggestions} />
          )}

          <div>
            <SectionTitle
              title="Activity Timeline"
              subtitle="ทุก interaction กับลูกค้า — ใหม่สุดก่อน"
            />
            <ActivityTimeline
              // Remount when the head of the timeline changes so a fresh
              // server render (after a save + router.refresh) replaces the
              // client page state instead of being ignored by useState.
              key={`${acc.id}:${crmTimeline.items[0]?.id ?? "empty"}:${crmTimeline.items.length}`}
              accountId={acc.id}
              initialItems={crmTimeline.items}
              initialCursor={crmTimeline.nextCursor}
              initialContacts={timelineContacts}
            />
          </div>

          {/* Active moments */}
          <div>
            <SectionTitle title="Active Moments" subtitle="Moment ที่กำลังทำงานอยู่" />
            {activeMoments.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">ไม่มี Moment Active</Card>
            ) : (
              <div className="space-y-2.5">
                {activeMoments.map((e) => (
                  <Card key={e.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <MomentChip code={e.momentType} />
                        <span className="text-sm font-semibold text-slate-800">{e.subMoment}</span>
                        <StatusBadge status={e.status} />
                      </div>
                      <PriorityBadge score={totalScore(e.score)} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {e.triggerSource}: {e.triggerDetail}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">
                        Wallet {walletRange(e.potentialWalletMin, e.potentialWalletMax)}
                      </span>
                      <span>คาดว่าเกิด {shortDate(e.expectedEventDate)}</span>
                      <span className="text-indigo-600">Next: {e.nextExpectedMoment}</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <p className="text-xs font-medium text-indigo-700">→ {e.recommendedAction}</p>
                      <Link
                        href={`/workspace?account=${acc.id}&event=${e.id}`}
                        className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        <Sparkles size={11} /> เปิดใน Workspace
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Moment timeline */}
          <div>
            <SectionTitle title="Moment Timeline" subtitle="ประวัติ Business Moments ทั้งหมด" />
            <Card className="p-5">
              <div className="relative space-y-5 before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-slate-200">
                {timeline.map((e) => (
                  <div key={e.id} className="relative pl-7">
                    <span
                      className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-white ring-1 ring-slate-200"
                      style={{ backgroundColor: momentColor(e.momentType) }}
                    />
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {monthYear(e.detectedAt)}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">{e.momentType}</span>
                      <span className="text-xs text-slate-500">{e.subMoment}</span>
                      <StatusBadge status={e.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Purchase history */}
          <div>
            <SectionTitle title="Purchase History" />
            {acc.purchases.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">ยังไม่มีประวัติการซื้อ</Card>
            ) : (
              <Card className="divide-y divide-slate-50">
                {[...acc.purchases].reverse().map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{p.item}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {shortDate(p.date)} · {p.moment}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-700">{bahtFull(p.amount)}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>

        {/* Right rail — intelligence & relationship context */}
        <div className="space-y-6">
          <div>
            <SectionTitle title="Contacts" subtitle="Buying Committee" />
            <Card>
              <ContactsPanel accountId={acc.id} contacts={contacts} />
            </Card>
          </div>

          <div>
            <SectionTitle title="Tasks / Follow-ups" subtitle={`วันนี้ ${taskBands.today}`} />
            <Card>
              <TasksPanel bands={taskBands} />
            </Card>
          </div>

          {openOpportunities.length > 0 && (
            <div>
              <SectionTitle title="Open Opportunities" />
              <Card className="divide-y divide-slate-50">
                {openOpportunities.map((o) => (
                  <div key={o.id} className="px-4 py-2.5">
                    <p className="text-xs font-semibold text-slate-800">{o.name}</p>
                    <p className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">
                        {o.stage}
                      </span>
                      <span className="font-bold text-slate-700">{baht(o.expectedRevenue)}</span>
                    </p>
                    {o.nextAction && (
                      <p className="mt-1 text-[10px] text-amber-700">⏭ {o.nextAction}</p>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div>
            <SectionTitle title="Whitespace Map" subtitle="ซื้อแล้ว vs ยังไม่ได้ซื้อ" />
            <Card className="p-4">
              <div className="space-y-1.5">
                {WHITESPACE_CATEGORIES.map((cat) => {
                  const bought = acc.whitespace[cat];
                  return (
                    <div
                      key={cat}
                      className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                        bought ? "bg-emerald-50/60 text-slate-700" : "bg-slate-50 text-slate-500"
                      }`}
                    >
                      <span className="font-medium">{cat}</span>
                      {bought ? (
                        <Check size={13} className="text-emerald-600" />
                      ) : (
                        <X size={13} className="text-slate-300" />
                      )}
                    </div>
                  );
                })}
              </div>
              {recommendedSolutions.length > 0 && (
                <div className="mt-4 rounded-lg bg-indigo-50 p-3">
                  <p className="text-[11px] font-bold text-indigo-800">✨ Next Best Solutions</p>
                  <ul className="mt-1.5 space-y-1">
                    {recommendedSolutions.map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-[11px] text-indigo-700">
                        <span>{s.name}</span>
                        <span className="font-semibold">{baht(s.averageWallet)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div>
            <SectionTitle title="Journey" />
            <Card className="p-4">
              <Link
                href="/journey"
                className="block rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                ดู Account Journey Map →
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${accent ? "text-indigo-600" : "text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}
