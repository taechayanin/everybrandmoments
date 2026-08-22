"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import { baht, pct } from "@/lib/format";
import type { SolutionId } from "@/lib/types";
import type { WorkspaceEventView } from "@/lib/application/workspace/get-workspace-view";

export function SolutionPanel({
  eventView,
  selectedIds,
  onToggle,
}: {
  eventView?: WorkspaceEventView;
  selectedIds: SolutionId[];
  onToggle: (id: SolutionId) => void;
}) {
  const selectedWallet =
    eventView?.solutions
      .filter((s) => selectedIds.includes(s.id))
      .reduce((sum, s) => sum + s.averageWallet, 0) ?? 0;

  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        <Sparkles size={12} /> Recommended Solutions
      </p>
      {!eventView ? (
        <p className="text-xs text-slate-400">เลือก Moment ก่อน</p>
      ) : (
        <div className="space-y-2">
          {eventView.solutions.map((s) => {
            const selected = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => onToggle(s.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800">{s.name}</p>
                  <CheckCircle2 size={14} className={selected ? "text-indigo-600" : "text-slate-200"} />
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
              </button>
            );
          })}
        </div>
      )}
      {selectedIds.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-900 px-3 py-2.5 text-xs text-white">
          เลือก {selectedIds.length} Solution · Potential Wallet ≈{" "}
          <span className="font-bold">{baht(selectedWallet)}</span>
        </div>
      )}
    </Card>
  );
}
