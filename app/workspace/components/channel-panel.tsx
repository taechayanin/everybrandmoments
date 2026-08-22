"use client";

import { MapPin, Video } from "lucide-react";
import { Card } from "@/components/ui";
import { walletRange } from "@/lib/format";
import type { ChannelMode } from "@/lib/types";
import type { WorkspaceEventView } from "@/lib/application/workspace/get-workspace-view";

// Routing logic (PRD §31): high wallet / physical needs → OFFLINE.
export function recommendedMode(eventView: WorkspaceEventView): ChannelMode {
  const physical = eventView.solutions.some((s) => s.recommendedOffline);
  return eventView.event.potentialWalletMax >= 100000 || physical ? "OFFLINE" : "ONLINE";
}

export function ChannelPanel({
  eventView,
  mode,
  onSelect,
}: {
  eventView: WorkspaceEventView;
  mode?: ChannelMode;
  onSelect: (mode: ChannelMode) => void;
}) {
  const e = eventView.event;
  return (
    <Card className="p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        Route Channel
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onSelect("OFFLINE")}
          className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition-colors ${
            mode === "OFFLINE"
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
          onClick={() => onSelect("ONLINE")}
          className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-semibold transition-colors ${
            mode === "ONLINE"
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
      {mode === "ONLINE" && recommendedMode(eventView) === "OFFLINE" && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          ⚠ Wallet {walletRange(e.potentialWalletMin, e.potentialWalletMax)} ≥ ฿100K — Routing
          Logic แนะนำ Offline
        </p>
      )}
    </Card>
  );
}
