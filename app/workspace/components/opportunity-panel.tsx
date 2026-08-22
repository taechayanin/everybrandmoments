"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";
import { baht } from "@/lib/format";
import type { OpportunityId } from "@/lib/types";
import type { WorkspaceEventView, WorkspaceView } from "@/lib/application/workspace/get-workspace-view";
import { createOpportunityAction } from "../actions";
import {
  MIN_DISCOVERY_ANSWERS,
  answeredCount,
  currentStep,
  type WorkspaceAction,
  type WorkspaceState,
} from "../use-workspace-machine";
import { recommendedMode } from "./channel-panel";

export function OpportunityPanel({
  view,
  eventView,
  state,
  dispatch,
}: {
  view: WorkspaceView;
  eventView: WorkspaceEventView;
  state: WorkspaceState;
  dispatch: (action: WorkspaceAction) => void;
}) {
  const [pending, startTransition] = useTransition();
  const step = currentStep(state);
  const answered = answeredCount(state);
  const discoveryDone = answered >= MIN_DISCOVERY_ANSWERS;
  const ready = step === "READY";

  const selectedWallet = eventView.solutions
    .filter((s) => state.selectedSolutionIds.includes(s.id))
    .reduce((sum, s) => sum + s.averageWallet, 0);

  function create() {
    if (!state.channelMode) return;
    startTransition(async () => {
      const res = await createOpportunityAction({
        accountId: view.account.id,
        momentEventId: eventView.event.id,
        solutionIds: state.selectedSolutionIds,
        discoveryAnsweredCount: answered,
        channelMode: state.channelMode!,
        channel:
          state.channelMode === "OFFLINE"
            ? eventView.event.channel ?? "EBM Business Center"
            : "Inside Sales",
        expectedRevenue: selectedWallet || undefined,
        ownerId: view.currentUserId as `USR-${string}`,
      });
      if (res.ok && res.opportunityId) {
        dispatch({ type: "CREATED", opportunityId: res.opportunityId as OpportunityId });
      } else {
        dispatch({ type: "CREATE_FAILED", error: res.error ?? "สร้างไม่สำเร็จ" });
      }
    });
  }

  return (
    <Card className="p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        Create Opportunity
      </p>
      {step === "CREATED" ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-bold">✅ สร้าง Opportunity แล้ว</p>
          <p className="mt-1">{state.opportunityId}</p>
          <p className="mt-0.5">
            {view.account.name} — {eventView.event.subMoment}
          </p>
          <p className="mt-0.5">
            Expected Revenue ≈ {baht(selectedWallet || eventView.event.potentialWalletMax)} · Next
            Moment: {eventView.event.nextExpectedMoment}
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
              {discoveryDone ? "✓" : "○"} Discovery อย่างน้อย {MIN_DISCOVERY_ANSWERS} ข้อ ({answered})
            </li>
            <li className={state.selectedSolutionIds.length > 0 ? "text-emerald-600" : ""}>
              {state.selectedSolutionIds.length > 0 ? "✓" : "○"} เลือก Solution อย่างน้อย 1 รายการ
            </li>
            <li className={state.channelMode ? "text-emerald-600" : ""}>
              {state.channelMode ? "✓" : "○"} เลือก Channel (แนะนำ:{" "}
              {recommendedMode(eventView) === "OFFLINE" ? "Offline" : "Online"})
            </li>
          </ul>
          {state.error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {state.error}
            </p>
          )}
          <button
            disabled={!ready || pending}
            onClick={create}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {pending ? "กำลังสร้าง…" : "สร้าง Opportunity + Set Next Moment"}
          </button>
        </>
      )}
    </Card>
  );
}
