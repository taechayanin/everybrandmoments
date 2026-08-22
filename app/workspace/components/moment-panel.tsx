"use client";

import Link from "next/link";
import { Card, MomentChip, PriorityBadge, ScoreBar, StatusBadge } from "@/components/ui";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { SLA_BY_PRIORITY, shortDate } from "@/lib/format";
import type { MomentEventId } from "@/lib/types";
import type { WorkspaceView } from "@/lib/application/workspace/get-workspace-view";

export function MomentPanel({
  view,
  selectedEventId,
  onSelect,
}: {
  view: WorkspaceView;
  selectedEventId?: MomentEventId;
  onSelect: (id: MomentEventId) => void;
}) {
  const selected = view.events.find((e) => e.event.id === selectedEventId);

  return (
    <Card className="p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        Current Moment
      </p>
      {view.events.length === 0 ? (
        <p className="text-sm text-slate-400">
          Account นี้ไม่มี Moment Active —{" "}
          <Link href="/radar" className="text-indigo-600 hover:underline">
            Add Moment ใน Radar
          </Link>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {view.events.map(({ event: e }) => (
              <button
                key={e.id}
                onClick={() => onSelect(e.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedEventId === e.id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {e.momentType} · {e.subMoment.slice(0, 22)}
              </button>
            ))}
          </div>
          {selected && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <MomentChip code={selected.event.momentType} />
                  <span className="text-sm font-bold text-slate-900">{selected.event.subMoment}</span>
                  <StatusBadge status={selected.event.status} />
                </div>
                <PriorityBadge score={totalScore(selected.event.score)} />
              </div>
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold">{selected.event.triggerSource}:</span>{" "}
                {selected.event.triggerDetail}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                <ScoreBar label="Business Fit" value={selected.event.score.businessFit} max={30} />
                <ScoreBar label="Intent / Signal" value={selected.event.score.intent} max={25} />
                <ScoreBar label="Timing" value={selected.event.score.timing} max={20} />
                <ScoreBar label="Wallet Potential" value={selected.event.score.wallet} max={15} />
                <ScoreBar label="Relationship" value={selected.event.score.relationship} max={10} />
              </div>
              <p className="mt-2.5 text-[11px] text-slate-500">
                Stakeholders: {selected.event.stakeholders.join(" · ")} · คาดว่าเกิด{" "}
                {shortDate(selected.event.expectedEventDate)} ·{" "}
                {SLA_BY_PRIORITY[priorityOf(totalScore(selected.event.score))]}
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
