"use client";

import { useState } from "react";
import { Card, MomentChip, PageHeader } from "@/components/ui";
import { MASTER_MOMENTS } from "@/lib/data/moments";
import { SOLUTIONS } from "@/lib/data/solutions";
import { baht, pct } from "@/lib/format";
import type { Stakeholder } from "@/lib/types";

const STAKEHOLDERS: (Stakeholder | "ทั้งหมด")[] = ["ทั้งหมด", "Business", "Employee", "Customer", "Partner"];

export default function SolutionLibrary() {
  const [momentFilter, setMomentFilter] = useState<string>("ทั้งหมด");
  const [stFilter, setStFilter] = useState<Stakeholder | "ทั้งหมด">("ทั้งหมด");

  const solutions = SOLUTIONS.filter(
    (s) =>
      (momentFilter === "ทั้งหมด" || s.moment === momentFilter) &&
      (stFilter === "ทั้งหมด" || s.stakeholders.includes(stFilter)),
  );

  return (
    <div>
      <PageHeader
        title="Solution Library"
        subtitle={`${SOLUTIONS.length} Solutions — ทุก Solution ผูกกับ Moment และ Stakeholder`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={momentFilter}
          onChange={(e) => setMomentFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-300"
        >
          <option>ทั้งหมด</option>
          {MASTER_MOMENTS.map((m) => (
            <option key={m.code}>{m.code}</option>
          ))}
        </select>
        {STAKEHOLDERS.map((st) => (
          <button
            key={st}
            onClick={() => setStFilter(st)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              stFilter === st
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {solutions.map((s) => (
          <Card key={s.id} className="flex h-full flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">{s.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <MomentChip code={s.moment} small />
                  {s.stakeholders.map((st) => (
                    <span key={st} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {st}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700">
                {baht(s.startingPrice)}+
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-center text-[11px]">
              <div>
                <p className="text-slate-400">Avg Wallet</p>
                <p className="font-bold text-slate-700">{baht(s.averageWallet)}</p>
              </div>
              <div>
                <p className="text-slate-400">GM Target</p>
                <p className="font-bold text-slate-700">{pct(s.grossMarginTarget)}</p>
              </div>
              <div>
                <p className="text-slate-400">Lead Time</p>
                <p className="font-bold text-slate-700">{s.leadTimeDays} วัน</p>
              </div>
            </div>

            {s.packages && (
              <div className="mt-3 space-y-1.5">
                {s.packages.map((p) => (
                  <div key={p.name} className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px]">
                    <span className="font-semibold text-slate-700">{p.name}</span>
                    <span className="text-slate-500">{baht(p.startingPrice)}+</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pt-3">
              {s.crossSell.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  <span className="font-semibold">Cross-sell:</span> {s.crossSell.join(" · ")}
                </p>
              )}
              <p className="mt-1 text-[11px] text-indigo-600">
                Next Moment → {s.nextMoment}
                {s.productionRequired && " · 🏭 Production"}
                {s.recommendedOffline && " · 📍 Offline"}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
