"use client";

import { ChevronRight } from "lucide-react";
import type { MomentEventId } from "@/lib/types";
import type { WorkspaceView } from "@/lib/application/workspace/get-workspace-view";
import { AccountPanel } from "./components/account-panel";
import { ChannelPanel } from "./components/channel-panel";
import { DiscoveryPanel } from "./components/discovery-panel";
import { MomentPanel } from "./components/moment-panel";
import { OpportunityPanel } from "./components/opportunity-panel";
import { SolutionPanel } from "./components/solution-panel";
import { currentStep, useWorkspaceMachine } from "./use-workspace-machine";

const STEP_LABELS: [string, string][] = [
  ["ACCOUNT", "1. Account"],
  ["MOMENT", "2. Moment"],
  ["DISCOVERY", "3. Discovery"],
  ["SOLUTION", "4. Solution"],
  ["CHANNEL", "5. Channel"],
  ["CREATED", "6. Opportunity"],
];

const STEP_ORDER = ["ACCOUNT", "MOMENT", "DISCOVERY", "SOLUTION", "CHANNEL", "READY", "CREATED"];

export function WorkspaceClient({
  view,
  initialEventId,
}: {
  view: WorkspaceView;
  initialEventId?: MomentEventId;
}) {
  const [state, dispatch] = useWorkspaceMachine(initialEventId);
  const step = currentStep(state);
  const stepIndex = STEP_ORDER.indexOf(step);

  const selectedEvent = view.events.find((e) => e.event.id === state.momentEventId);

  return (
    <div>
      {/* Step indicator — derived from the state machine, always consistent */}
      <div className="mb-5 flex flex-wrap items-center gap-1 text-[11px] font-medium">
        {STEP_LABELS.map(([key, label], i) => {
          const done =
            key === "CREATED"
              ? step === "CREATED"
              : stepIndex > STEP_ORDER.indexOf(key) || key === "ACCOUNT";
          return (
            <span key={key} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-slate-300" />}
              <span
                className={`rounded-full px-2.5 py-1 ${
                  done ? "bg-indigo-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"
                }`}
              >
                {label}
              </span>
            </span>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_320px]">
        {/* LEFT — Customer */}
        <AccountPanel view={view} />

        {/* CENTER — Moment + Discovery */}
        <div className="space-y-3">
          <MomentPanel
            view={view}
            selectedEventId={state.momentEventId}
            onSelect={(id) => dispatch({ type: "SELECT_MOMENT", momentEventId: id })}
          />
          {selectedEvent && (
            <DiscoveryPanel
              eventView={selectedEvent}
              answers={state.discoveryAnswers}
              onToggle={(key) => dispatch({ type: "TOGGLE_QUESTION", key })}
            />
          )}
        </div>

        {/* RIGHT — Solution + Channel + Opportunity */}
        <div className="space-y-3">
          <SolutionPanel
            eventView={selectedEvent}
            selectedIds={state.selectedSolutionIds}
            onToggle={(id) => dispatch({ type: "TOGGLE_SOLUTION", solutionId: id })}
          />
          {selectedEvent && (
            <ChannelPanel
              eventView={selectedEvent}
              mode={state.channelMode}
              onSelect={(mode) => dispatch({ type: "SET_CHANNEL_MODE", mode })}
            />
          )}
          {selectedEvent && (
            <OpportunityPanel view={view} eventView={selectedEvent} state={state} dispatch={dispatch} />
          )}
        </div>
      </div>
    </div>
  );
}
