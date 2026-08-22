"use client";

import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui";
import type { WorkspaceEventView } from "@/lib/application/workspace/get-workspace-view";
import { MIN_DISCOVERY_ANSWERS } from "../use-workspace-machine";

export function DiscoveryPanel({
  eventView,
  answers,
  onToggle,
}: {
  eventView: WorkspaceEventView;
  answers: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  const questions = eventView.master?.discoveryQuestions ?? [];
  const answered = Object.values(answers).filter(Boolean).length;
  const done = answered >= Math.min(MIN_DISCOVERY_ANSWERS, questions.length);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Discovery Guide — {eventView.event.momentType}
        </p>
        <span className={`text-[11px] font-semibold ${done ? "text-emerald-600" : "text-slate-400"}`}>
          {answered}/{questions.length} ถามแล้ว{done && " ✓"}
        </span>
      </div>
      <div className="space-y-1">
        {questions.map((q, i) => {
          const key = `${eventView.event.id}-${i}`;
          const checked = answers[key] === true;
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                checked
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <CheckCircle2 size={14} className={checked ? "text-emerald-500" : "text-slate-300"} />
              {i + 1}. {q}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
