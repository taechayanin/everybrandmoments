"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, MomentChip, PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { ACCOUNTS, accountById } from "@/lib/data/accounts";
import { MOMENT_EVENTS } from "@/lib/data/events";
import { LIFECYCLE_PHASES, MASTER_MOMENTS, momentByCode } from "@/lib/data/moments";
import { baht, priorityOf, shortDate, totalScore } from "@/lib/format";
import type { Stakeholder } from "@/lib/types";

type Mode = "master" | "account" | "revenue";

const STAKEHOLDERS: Stakeholder[] = ["Business", "Employee", "Customer", "Partner"];

export default function JourneyMap() {
  const [mode, setMode] = useState<Mode>("master");
  const [accountId, setAccountId] = useState(ACCOUNTS[0].id);

  return (
    <div>
      <PageHeader
        title="Journey Map"
        subtitle="Visual-first: 7 Lifecycle Phases × 4 Stakeholder Swimlanes"
      >
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
            {(
              [
                ["master", "Master Journey"],
                ["account", "Account Journey"],
                ["revenue", "Revenue Journey"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "account" && (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-300"
            >
              {ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </PageHeader>

      {mode === "master" ? <MasterJourney /> : mode === "account" ? <AccountJourney accountId={accountId} /> : <RevenueJourney />}
    </div>
  );
}

function PhaseHeader() {
  return (
    <div className="grid min-w-[980px] grid-cols-[110px_repeat(7,1fr)] gap-2">
      <div />
      {LIFECYCLE_PHASES.map((p) => (
        <div key={p.key} className="rounded-lg bg-slate-900 px-2 py-1.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white">
            {p.no} {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function MasterJourney() {
  return (
    <Card className="overflow-x-auto p-4">
      <PhaseHeader />
      <div className="mt-2 grid min-w-[980px] grid-cols-[110px_repeat(7,1fr)] gap-2">
        <div className="flex items-center">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            20 Moments
          </span>
        </div>
        {LIFECYCLE_PHASES.map((p) => (
          <div key={p.key} className="space-y-1.5 rounded-lg bg-slate-50/70 p-1.5">
            {MASTER_MOMENTS.filter((m) => m.phase === p.key).map((m) => (
              <div
                key={m.code}
                className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
                style={{ borderLeft: `3px solid ${m.color}` }}
              >
                <p className="text-[11px] font-bold text-slate-800">
                  {String(m.no).padStart(2, "0")} {m.code}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{m.description}</p>
                <p className="mt-1 text-[10px] text-indigo-600">
                  → {m.nextMoments.join(", ")}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Mode A — Master Journey: มาตรฐานกลาง 20 Business Moments ของ EBM แบ่งตาม 7 Lifecycle Phases
      </p>
    </Card>
  );
}

function AccountJourney({ accountId }: { accountId: string }) {
  const acc = accountById.get(accountId)!;
  const events = useMemo(
    () =>
      MOMENT_EVENTS.filter((e) => e.accountId === accountId).sort((a, b) =>
        a.detectedAt.localeCompare(b.detectedAt),
      ),
    [accountId],
  );

  return (
    <Card className="overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">
          {acc.name} <span className="ml-2 text-xs font-normal text-slate-400">{acc.industry} · {acc.branchCount} สาขา</span>
        </p>
        <Link href={`/accounts/${acc.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
          เปิด Account 360 →
        </Link>
      </div>
      <PhaseHeader />
      <div className="mt-2 space-y-2">
        {STAKEHOLDERS.map((st) => {
          const stEvents = events.filter((e) => e.stakeholders.includes(st));
          return (
            <div key={st} className="grid min-w-[980px] grid-cols-[110px_repeat(7,1fr)] gap-2">
              <div className="flex items-center">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{st}</span>
              </div>
              {LIFECYCLE_PHASES.map((p) => {
                const cell = stEvents.filter(
                  (e) => momentByCode.get(e.momentType)?.phase === p.key,
                );
                return (
                  <div key={p.key} className="min-h-[52px] space-y-1.5 rounded-lg bg-slate-50/70 p-1.5">
                    {cell.map((e) => (
                      <div
                        key={e.id}
                        className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
                        style={{ borderLeft: `3px solid ${momentByCode.get(e.momentType)?.color}` }}
                      >
                        <p className="text-[10px] font-bold text-slate-800">{e.momentType}</p>
                        <p className="truncate text-[10px] text-slate-500">{e.subMoment}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[9px] font-semibold text-slate-600">
                            {totalScore(e.score)} · {priorityOf(totalScore(e.score))}
                          </span>
                          <StatusBadge status={e.status} />
                        </div>
                        <p className="mt-0.5 text-[9px] text-slate-400">
                          {shortDate(e.expectedEventDate)} · {baht(e.potentialWalletMax)}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Mode B/C — Account + Stakeholder Journey: Moment ทั้งหมดของ {acc.name} แยกตาม Swimlane
      </p>
    </Card>
  );
}

function RevenueJourney() {
  const revEvents = MOMENT_EVENTS.filter((e) =>
    ["Qualified", "Meeting Booked", "Discovery Completed", "Solution Design", "Proposal", "Negotiation", "Won", "Delivery"].includes(e.status),
  ).sort((a, b) => totalScore(b.score) - totalScore(a.score));

  return (
    <div className="space-y-2.5">
      {revEvents.map((e) => {
        const acc = accountById.get(e.accountId)!;
        return (
          <Card key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <PriorityBadge score={totalScore(e.score)} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{acc.name}</p>
                <p className="truncate text-xs text-slate-500">{e.subMoment}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <MomentChip code={e.momentType} small />
              <StatusBadge status={e.status} />
              <span className="text-xs font-bold text-slate-700">
                {baht(e.potentialWalletMin)}–{baht(e.potentialWalletMax)}
              </span>
              <span className="text-[11px] text-indigo-600">→ {e.nextExpectedMoment}</span>
            </div>
          </Card>
        );
      })}
      <p className="text-[11px] text-slate-400">
        Mode D — Revenue Journey: เฉพาะ Moment ที่สร้าง Opportunity / Revenue แล้ว
      </p>
    </div>
  );
}
