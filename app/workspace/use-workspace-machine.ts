"use client";

import { useReducer } from "react";
import type { ChannelMode, MomentEventId, OpportunityId, SolutionId } from "@/lib/types";

// One controlled workflow state machine (refactor plan §26).
// Changing an upstream field invalidates all downstream state.

export type WorkspaceStep =
  | "ACCOUNT"
  | "MOMENT"
  | "DISCOVERY"
  | "SOLUTION"
  | "CHANNEL"
  | "READY"
  | "CREATED";

export interface WorkspaceState {
  momentEventId?: MomentEventId;
  discoveryAnswers: Record<string, boolean>;
  selectedSolutionIds: SolutionId[];
  channelMode?: ChannelMode;
  opportunityId?: OpportunityId;
  error?: string;
}

export const MIN_DISCOVERY_ANSWERS = 3;

export type WorkspaceAction =
  | { type: "SELECT_MOMENT"; momentEventId: MomentEventId }
  | { type: "TOGGLE_QUESTION"; key: string }
  | { type: "TOGGLE_SOLUTION"; solutionId: SolutionId }
  | { type: "SET_CHANNEL_MODE"; mode: ChannelMode }
  | { type: "CREATE_FAILED"; error: string }
  | { type: "CREATED"; opportunityId: OpportunityId };

export function answeredCount(state: WorkspaceState): number {
  return Object.values(state.discoveryAnswers).filter(Boolean).length;
}

export function currentStep(state: WorkspaceState): WorkspaceStep {
  if (state.opportunityId) return "CREATED";
  if (!state.momentEventId) return "MOMENT";
  if (answeredCount(state) < MIN_DISCOVERY_ANSWERS) return "DISCOVERY";
  if (state.selectedSolutionIds.length === 0) return "SOLUTION";
  if (!state.channelMode) return "CHANNEL";
  return "READY";
}

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "SELECT_MOMENT":
      // Upstream change → reset everything downstream.
      return {
        momentEventId: action.momentEventId,
        discoveryAnswers: {},
        selectedSolutionIds: [],
        channelMode: undefined,
        opportunityId: undefined,
      };
    case "TOGGLE_QUESTION": {
      const next = { ...state.discoveryAnswers };
      next[action.key] = !next[action.key];
      // Discovery is upstream of the created opportunity.
      return { ...state, discoveryAnswers: next, opportunityId: undefined, error: undefined };
    }
    case "TOGGLE_SOLUTION": {
      const selected = state.selectedSolutionIds.includes(action.solutionId)
        ? state.selectedSolutionIds.filter((id) => id !== action.solutionId)
        : [...state.selectedSolutionIds, action.solutionId];
      return { ...state, selectedSolutionIds: selected, opportunityId: undefined, error: undefined };
    }
    case "SET_CHANNEL_MODE":
      return { ...state, channelMode: action.mode, opportunityId: undefined, error: undefined };
    case "CREATE_FAILED":
      return { ...state, error: action.error };
    case "CREATED":
      return { ...state, opportunityId: action.opportunityId, error: undefined };
  }
}

export function useWorkspaceMachine(initialEventId?: MomentEventId) {
  return useReducer(reducer, {
    momentEventId: initialEventId,
    discoveryAnswers: {},
    selectedSolutionIds: [],
  } satisfies WorkspaceState);
}
