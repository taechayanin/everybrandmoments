"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Sparkles,
  Video,
} from "lucide-react";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  PriorityBadge,
  ScoreBar,
  StatusBadge,
} from "@/components/ui";
import { ACCOUNTS, accountById } from "@/lib/data/accounts";
import { MOMENT_EVENTS, eventById } from "@/lib/data/events";
import { momentByCode } from "@/lib/data/moments";
import { solutionById, solutionsForMoment } from "@/lib/data/solutions";
import {
  SLA_BY_PRIORITY,
  baht,
  bahtFull,
  monthYear,
  pct,
  priorityOf,
  shortDate,
  totalScore,
  walletRange,
} from "@/lib/format";

const ACTIVE = new Set([
  "Detected", "Review", "Contacted", "Qualified", "Meeting Booked",
  "Discovery Completed", "Solution Design", "Proposal", "Negotiation",
]);

export function WorkspaceClient({ initialEventId }: { initialEventId?: string }) {
  const initialEvent = initialEventId ? eventById.get(initialEventId) : undefined;
  const [accountId, setAccountId] = useState(initialEvent?.accountId ?? "ACC-001");
  const [eventId, setEventId] = useState<string | undefined>(
    initialEvent?.id ??
      MOMENT_EVENTS.find((e) => e.accountId === "ACC-001" && ACTIVE.has(e.status))?.id,
  );
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());
  const [selectedSolutions, setSelectedSolutions] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<"online" | "offline" | null>(null);
  const [opportunityCreated, setOpportunityCreated] = useState(false);

  const account = accountById.get(accountId)!;
  const accountEvents = useMemo(
    () => MOMENT_EVENTS.filter((e) => e.accountId === accountId && ACTIVE.has(e.status)),
    [accountId],
  );
  const event = eventId ? eventById.get(eventId) : undefined;
  const moment = event ? momentByCode.get(event.momentType) : undefined;
  const recommended = event
    ? [
        ...event.recommendedSolutionIds.map((id) => solutionById.get(id)!),
        ...solutionsForMoment(event.momentType).filter(
          (s) => !event.recommendedSolutionIds.includes(s.id),
        ),
      ].filter(Boolean)
    : [];

  const selectedWallet = [...selectedSolutions].reduce(
    (sum, id) => sum + (solutionById.get(id)?.averageWallet ?? 0),
    0,
  );
  const discoveryDone = moment
    ? checkedQuestions.size >= Math.min(3, moment.discoveryQuestions.length)
    : false;

  function pickAccount(id: string) {
    setAccountId(id);
    const first = MOMENT_EVENTS.find((e) => e.accountId === id && ACTIVE.has(e.status));
    setEventId(first?.id);
    setCheckedQuestions(new Set());
    setSelectedSolutions(new Set());
    setChannel(null);
    setOpportunityCreated(false);
  }

  return (
    <div>
      <PageHeader
        title="Customer Solution Workspace"
        subtitle="Select Account → Confirm Moment → Discovery → Solution → Route → Create Opportunity"
      />

      {/* Step indicator */}
      <div className="mb-5 flex flex-wrap items-center gap-1 text-[11px] font-medium">
        {[
          ["1. Account", true],
          ["2. Moment", !!event],
          ["3. Discovery", discoveryDone],
          ["4. Solution", selectedSolutions.size > 0],
          ["5. Channel", channel !== null],
          ["6. Opportunity", opportunityCreated],
        ].map(([label, done], i) => (
          <span key={label as string} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-slate-300" />}
            <span
              className={`rounded-full px-2.5 py-1 ${
                done ? "bg-indigo-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"
              }`}
            >
              {label as string}
            </span>
          </span>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_320px]">
        {/* LEFT — Customer */}
        <div className="space-y-3">
          <Card className="p-3">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <Building2 size={12} /> Customer
            </p>
            <select
              value={accountId}
              onChange={(e) => pickAccount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-300"
            >
              {ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="mt-3 flex items-center gap-2.5 px-1">
              <Avatar name={account.name} id={account.id} size={10} />
              <div>
                <p className="text-sm font-bold text-slate-900">{account.name}</p>
                <p className="text-[11px] text-slate-500">{account.industry}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
              <p>ขนาด: {account.employeeSize} คน · {account.branchCount} สาขา</p>
              <p>Tier: {account.tier}</p>
              <p>
                ความสัมพันธ์:{" "}
                {account.customerSince
                  ? `ลูกค้าตั้งแต่ ${monthYear(account.customerSince)}`
                  : "New Prospect"}
              </p>
              <p>LTV: {account.ltv ? baht(account.ltv) : "—"}</p>
            </div>
          </Card>

          <Card className="p-3">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Purchase History
            </p>
            {account.purchases.length === 0 ? (
              <p className="px-1 text-[11px] text-slate-400">ยังไม่เคยซื้อ</p>
            ) : (
              <div className="space-y-2">
                {[...account.purchases].reverse().slice(0, 4).map((p, i) => (
                  <div key={i} className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-[11px] font-semibold text-slate-700">{p.item}</p>
                    <p className="text-[10px] text-slate-400">
                      {shortDate(p.date)} · {bahtFull(p.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-3">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Previous Moments
            </p>
            <div className="space-y-1.5 px-1">
              {MOMENT_EVENTS.filter(
                (e) => e.accountId === accountId && ["Won", "Delivery"].includes(e.status),
              )
                .slice(-4)
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-[11px]">
                    <MomentChip code={e.momentType} small />
                    <span className="text-slate-400">{monthYear(e.detectedAt)}</span>
                  </div>
                ))}
            </div>
          </Card>
        </div>

        {/* CENTER — Current Moment + Discovery */}
        <div className="space-y-3">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Current Moment
            </p>
            {accountEvents.length === 0 ? (
              <p className="text-sm text-slate-400">
                Account นี้ไม่มี Moment Active —{" "}
                <Link href="/radar" className="text-indigo-600 hover:underline">
                  Add Moment ใน Radar
                </Link>
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {accountEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setEventId(e.id);
                        setCheckedQuestions(new Set());
                        setSelectedSolutions(new Set());
                        setChannel(null);
                        setOpportunityCreated(false);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        eventId === e.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {e.momentType} · {e.subMoment.slice(0, 22)}
                    </button>
                  ))}
                </div>
                {event && (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <MomentChip code={event.momentType} />
                        <span className="text-sm font-bold text-slate-900">{event.subMoment}</span>
                        <StatusBadge status={event.status} />
                      </div>
                      <PriorityBadge score={totalScore(event.score)} />
                    </div>
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-semibold">{event.triggerSource}:</span>{" "}
                      {event.triggerDetail}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                      <ScoreBar label="Business Fit" value={event.score.businessFit} max={30} />
                      <ScoreBar label="Intent / Signal" value={event.score.intent} max={25} />
                      <ScoreBar label="Timing" value={event.score.timing} max={20} />
                      <ScoreBar label="Wallet Potential" value={event.score.wallet} max={15} />
                      <ScoreBar label="Relationship" value={event.score.relationship} max={10} />
                    </div>
                    <p className="mt-2.5 text-[11px] text-slate-500">
                      Stakeholders: {event.stakeholders.join(" · ")} · คาดว่าเกิด{" "}
                      {shortDate(event.expectedEventDate)} ·{" "}
                      {SLA_BY_PRIORITY[priorityOf(totalScore(event.score))]}
                    </p>
                  </div>
                )}
              </>
            )}
          </Card>

          {event && moment && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Discovery Guide — {event.momentType}
                </p>
                <span className={`text-[11px] font-semibold ${discoveryDone ? "text-emerald-600" : "text-slate-400"}`}>
                  {checkedQuestions.size}/{moment.discoveryQuestions.length} ถามแล้ว
                  {discoveryDone && " ✓"}
                </span>
              </div>
              <div className="space-y-1">
                {moment.discoveryQuestions.map((q, i) => {
                  const key = `${event.id}-${i}`;
                  const checked = checkedQuestions.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setCheckedQuestions((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                        checked
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <CheckCircle2
                        size={14}
                        className={checked ? "text-emerald-500" : "text-slate-300"}
                      />
                      {i + 1}. {q}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT — Solution + Next Action */}
        <div className="space-y-3">
          <Card className="p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <Sparkles size={12} /> Recommended Solutions
            </p>
            {!event ? (
              <p className="text-xs text-slate-400">เลือก Moment ก่อน</p>
            ) : (
              <div className="space-y-2">
                {recommended.slice(0, 5).map((s) => {
                  const selected = selectedSolutions.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSolutions((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        });
                        setOpportunityCreated(false);
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800">{s.name}</p>
                        <CheckCircle2
                          size={14}
                          className={selected ? "text-indigo-600" : "text-slate-200"}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        เริ่มต้น {baht(s.startingPrice)} · Avg Wallet {baht(s.averageWallet)} · GM{" "}
                        {pct(s.grossMarginTarget)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Lead time {s.leadTimeDays} วัน
                        {s.productionRequired && " · ต้องผลิต"}
                        {s.recommendedOffline && " · แนะนำ Offline"}
                      </p>
                      {s.crossSell.length > 0 && (
                        <p className="mt-1 text-[10px] text-indigo-600">
                          Cross-sell: {s.crossSell.slice(0, 2).join(", ")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedSolutions.size > 0 && (
              <div className="mt-3 rounded-lg bg-slate-900 px-3 py-2.5 text-xs text-white">
                เลือก {selectedSolutions.size} Solution · Potential Wallet ≈{" "}
                <span className="font-bold">{baht(selectedWallet)}</span>
              </div>
            )}
          </Card>

          {event && (
            <Card className="p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Route Channel
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setChannel("offline")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition-colors ${
                    channel === "offline"
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <MapPin size={16} />
                  Offline Center
                  <span className="text-[10px] font-normal text-slate-400">
                    Wallet ≥ ฿100K / งาน Physical
                  </span>
                </button>
                <button
                  onClick={() => setChannel("online")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition-colors ${
                    channel === "online"
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Video size={16} />
                  Online / Inside Sales
                  <span className="text-[10px] font-normal text-slate-400">
                    Standard / Low-ticket
                  </span>
                </button>
              </div>
              {event.potentialWalletMax >= 100000 && channel === "online" && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  ⚠ Wallet {walletRange(event.potentialWalletMin, event.potentialWalletMax)} ≥ ฿100K
                  — Routing Logic แนะนำ Offline
                </p>
              )}
            </Card>
          )}

          {event && (
            <Card className="p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Create Opportunity
              </p>
              {opportunityCreated ? (
                <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                  <p className="font-bold">✅ สร้าง Opportunity แล้ว (Mock)</p>
                  <p className="mt-1">
                    {account.name} — {event.subMoment}
                  </p>
                  <p className="mt-0.5">
                    Expected Revenue ≈ {baht(selectedWallet || event.potentialWalletMax)} · Next
                    Moment: {event.nextExpectedMoment}
                  </p>
                  <Link
                    href="/opportunities"
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                  >
                    ไปที่ Opportunity Queue <ArrowRight size={11} />
                  </Link>
                </div>
              ) : (
                <>
                  <ul className="mb-3 space-y-1 text-[11px] text-slate-500">
                    <li className={discoveryDone ? "text-emerald-600" : ""}>
                      {discoveryDone ? "✓" : "○"} Discovery อย่างน้อย 3 ข้อ
                    </li>
                    <li className={selectedSolutions.size > 0 ? "text-emerald-600" : ""}>
                      {selectedSolutions.size > 0 ? "✓" : "○"} เลือก Solution อย่างน้อย 1 รายการ
                    </li>
                    <li className={channel ? "text-emerald-600" : ""}>
                      {channel ? "✓" : "○"} เลือก Channel (Online / Offline)
                    </li>
                  </ul>
                  <button
                    disabled={!discoveryDone || selectedSolutions.size === 0 || !channel}
                    onClick={() => setOpportunityCreated(true)}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    สร้าง Opportunity + Set Next Moment
                  </button>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
