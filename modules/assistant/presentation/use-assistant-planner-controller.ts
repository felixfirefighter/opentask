"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PlannerInput, PlannerSelection } from "../application/contracts";

import {
  applyPlannerProposal,
  createPlannerProposal,
  getPlannerProposal,
  rejectPlannerProposal,
} from "./data/planner-api-client";
import {
  applyRouteError,
  generationRouteError,
  isPlannerRequestAbort,
  refreshRouteError,
  rejectRouteError,
} from "./planner-route-errors";
import type { PlannerScreenState } from "./planner-screen-model";

export function useAssistantPlannerController(
  initialInput: PlannerInput,
  online: boolean,
): Readonly<{
  state: PlannerScreenState;
  createProposal: (input: PlannerInput) => void;
  applyProposal: (selection: PlannerSelection) => void;
  rejectProposal: (proposalId: string) => void;
  retry: () => void;
  editInput: () => void;
}> {
  const [state, setState] = useState<PlannerScreenState>({ kind: "describe" });
  const stateRef = useRef<PlannerScreenState>(state);
  const lastInputRef = useRef(initialInput);
  const activeRequestRef = useRef<AbortController | null>(null);

  const transition = useCallback((next: PlannerScreenState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const beginRequest = useCallback(() => {
    if (activeRequestRef.current) return null;
    const request = new AbortController();
    activeRequestRef.current = request;
    return request;
  }, []);

  const finishRequest = useCallback((request: AbortController) => {
    if (activeRequestRef.current === request) activeRequestRef.current = null;
  }, []);

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    },
    [],
  );

  const createProposal = useCallback(
    (input: PlannerInput) => {
      if (!online) return;
      const request = beginRequest();
      if (!request) return;
      lastInputRef.current = input;
      transition({ kind: "processing", stage: "interpreting", submittedInput: input });

      void createPlannerProposal(input, request.signal)
        .then((proposal) => transition({ kind: "review", proposal }))
        .catch((error: unknown) => {
          if (!isPlannerRequestAbort(error)) {
            const routeError = generationRouteError(error);
            transition(
              routeError.permission
                ? { kind: "permission" }
                : { kind: "describe", failure: { kind: routeError.failure } },
            );
          }
        })
        .finally(() => finishRequest(request));
    },
    [beginRequest, finishRequest, online, transition],
  );

  const applyProposal = useCallback(
    (selection: PlannerSelection) => {
      if (!online) return;
      const current = stateRef.current;
      if (current.kind !== "review" || current.proposal.id !== selection.proposalId) return;
      const request = beginRequest();
      if (!request) return;
      transition({ ...current, operation: "applying", failure: undefined });

      void applyPlannerProposal(selection, request.signal)
        .then((result) => {
          const notAppliedActionCount =
            result.outcome === "already_applied"
              ? Math.max(0, current.proposal.proposal.actions.length - selection.actions.length)
              : Math.max(0, current.proposal.proposal.actions.length - result.appliedActionCount);
          transition({
            kind: "result",
            proposal: current.proposal,
            result,
            selectedActionCount: selection.actions.length,
            notAppliedActionCount,
          });
        })
        .catch((error: unknown) => {
          if (!isPlannerRequestAbort(error)) {
            const routeError = applyRouteError(error);
            transition(
              routeError.permission
                ? { kind: "permission" }
                : { ...current, operation: "idle", failure: { kind: routeError.failure } },
            );
          }
        })
        .finally(() => finishRequest(request));
    },
    [beginRequest, finishRequest, online, transition],
  );

  const rejectProposal = useCallback(
    (proposalId: string) => {
      if (!online) return;
      const current = stateRef.current;
      if (current.kind !== "review" || current.proposal.id !== proposalId) return;
      const request = beginRequest();
      if (!request) return;
      transition({ ...current, operation: "rejecting", failure: undefined });

      void rejectPlannerProposal(proposalId, request.signal)
        .then((proposal) => transition({ kind: "review", proposal }))
        .catch((error: unknown) => {
          if (!isPlannerRequestAbort(error)) {
            const routeError = rejectRouteError(error);
            transition(
              routeError.permission
                ? { kind: "permission" }
                : { ...current, operation: "idle", failure: { kind: routeError.failure } },
            );
          }
        })
        .finally(() => finishRequest(request));
    },
    [beginRequest, finishRequest, online, transition],
  );

  const revalidateProposal = useCallback(
    (current: Extract<PlannerScreenState, { kind: "review" }>) => {
      if (!online) return;
      const request = beginRequest();
      if (!request) return;
      transition({ ...current, operation: "revalidating" });

      void getPlannerProposal(current.proposal.id, request.signal)
        .then((proposal) => transition({ kind: "review", proposal }))
        .catch((error: unknown) => {
          if (!isPlannerRequestAbort(error)) {
            const routeError = refreshRouteError(error);
            transition(
              routeError.permission
                ? { kind: "permission" }
                : { ...current, operation: "idle", failure: { kind: routeError.failure } },
            );
          }
        })
        .finally(() => finishRequest(request));
    },
    [beginRequest, finishRequest, online, transition],
  );

  const retry = useCallback(() => {
    const current = stateRef.current;
    if (current.kind === "describe") createProposal(lastInputRef.current);
    if (current.kind === "review") {
      if (current.failure?.kind === "stale") createProposal(lastInputRef.current);
      else revalidateProposal(current);
    }
  }, [createProposal, revalidateProposal]);

  const editInput = useCallback(() => transition({ kind: "describe" }), [transition]);

  return { state, createProposal, applyProposal, rejectProposal, retry, editInput };
}
