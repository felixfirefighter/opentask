"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markWorkspaceRoutesStale } from "@/shared/presentation";

import type { PlannerInput, PlannerProposalDto, PlannerSelection } from "../application/contracts";

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
import { plannerProposalHref, taskLinksForAppliedSelection } from "./planner-route-navigation";

export function useAssistantPlannerController({
  initialInput,
  initialProposal,
  initialProposalUnavailable,
  online,
}: Readonly<{
  initialInput: PlannerInput;
  initialProposal?: PlannerProposalDto | null | undefined;
  initialProposalUnavailable: boolean;
  online: boolean;
}>): Readonly<{
  state: PlannerScreenState;
  createProposal: (input: PlannerInput) => void;
  applyProposal: (selection: PlannerSelection) => void;
  rejectProposal: (proposalId: string) => void;
  retry: (input?: PlannerInput) => void;
  editInput: () => void;
}> {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [state, setState] = useState<PlannerScreenState>(() =>
    initialPlannerState(initialProposal, initialProposalUnavailable),
  );
  const stateRef = useRef<PlannerScreenState>(state);
  const lastInputRef = useRef(initialInput);
  const hasSubmittedInputRef = useRef(false);
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
      hasSubmittedInputRef.current = true;
      transition({ kind: "processing", stage: "interpreting", submittedInput: input });

      void createPlannerProposal(input, request.signal)
        .then((proposal) => {
          transition(stateForProposal(proposal));
          replaceRoute(router, plannerProposalHref(proposal.id));
        })
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
    [beginRequest, finishRequest, online, router, transition],
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
            taskLinks:
              result.outcome === "applied"
                ? taskLinksForAppliedSelection(current.proposal, selection.actions)
                : [],
          });
          refreshTaskProjections(queryClient, router);
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
    [beginRequest, finishRequest, online, queryClient, router, transition],
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
        .then((proposal) => transition(stateForProposal(proposal)))
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
        .then((proposal) => {
          transition(stateForProposal(proposal));
          if (proposal.status === "applied") refreshTaskProjections(queryClient, router);
        })
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
    [beginRequest, finishRequest, online, queryClient, router, transition],
  );

  const retry = useCallback(
    (input?: PlannerInput) => {
      const current = stateRef.current;
      if (current.kind === "describe") createProposal(input ?? lastInputRef.current);
      if (current.kind === "review") {
        if (current.failure?.kind !== "stale") {
          revalidateProposal(current);
        } else if (hasSubmittedInputRef.current) {
          createProposal(lastInputRef.current);
        } else {
          transition({ kind: "describe", failure: { kind: "input_stale" } });
          replaceRoute(router, "/plan");
        }
      }
    },
    [createProposal, revalidateProposal, router, transition],
  );

  const editInput = useCallback(() => {
    transition({ kind: "describe" });
    replaceRoute(router, "/plan");
  }, [router, transition]);

  return { state, createProposal, applyProposal, rejectProposal, retry, editInput };
}

function initialPlannerState(
  proposal: PlannerProposalDto | null | undefined,
  unavailable: boolean,
): PlannerScreenState {
  if (unavailable) return { kind: "permission" };
  if (!proposal) return { kind: "describe" };
  return stateForProposal(proposal);
}

function stateForProposal(proposal: PlannerProposalDto): PlannerScreenState {
  return proposal.status === "pending" ? { kind: "review", proposal } : { kind: "terminal", proposal };
}

function refreshTaskProjections(queryClient: QueryClient, router: ReturnType<typeof useRouter>): void {
  markWorkspaceRoutesStale();
  void queryClient
    .invalidateQueries()
    .catch(() => undefined)
    .then(() => router.refresh())
    .catch(() => undefined);
}

function replaceRoute(router: ReturnType<typeof useRouter>, href: string): void {
  try {
    router.replace(href, { scroll: false });
  } catch {
    // The proposal remains usable in memory if client-side navigation itself is unavailable.
  }
}
