"use client";

import { useMutation } from "@tanstack/react-query";

import { markWorkspaceRoutesStale } from "@/shared/presentation";

import type {
  CorrectCompletedSessionRequest,
  FocusStartRequest,
  FocusTransitionRequest,
} from "../../application/contracts";
import {
  correctCompletedFocusSession,
  deleteCompletedFocusSession,
  discardFocusSession,
  finishFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
} from "./focus-api-client";
import { isFocusApiError } from "./focus-api-request";

export function useStartFocusMutation() {
  return useFocusMutation(
    ({ resourceId, input }: Readonly<{ resourceId: string; input: FocusStartRequest }>) =>
      startFocusSession(resourceId, input),
  );
}

export function useTransitionFocusMutation() {
  return useFocusMutation(
    ({
      command,
      sessionId,
      input,
    }: Readonly<{
      command: "pause" | "resume" | "finish";
      sessionId: string;
      input: FocusTransitionRequest;
    }>) => {
      if (command === "pause") return pauseFocusSession(sessionId, input);
      if (command === "resume") return resumeFocusSession(sessionId, input);
      return finishFocusSession(sessionId, input);
    },
  );
}

export function useDiscardFocusMutation() {
  return useFocusMutation(
    ({ sessionId, input }: Readonly<{ sessionId: string; input: FocusTransitionRequest }>) =>
      discardFocusSession(sessionId, input),
  );
}

export function useCorrectFocusMutation() {
  return useFocusMutation(
    ({ sessionId, input }: Readonly<{ sessionId: string; input: CorrectCompletedSessionRequest }>) =>
      correctCompletedFocusSession(sessionId, input),
  );
}

export function useDeleteFocusMutation() {
  return useFocusMutation(
    ({ sessionId, input }: Readonly<{ sessionId: string; input: FocusTransitionRequest }>) =>
      deleteCompletedFocusSession(sessionId, input),
  );
}

function useFocusMutation<TData, TVariables>(mutationFn: (variables: TVariables) => Promise<TData>) {
  return useMutation({
    mutationFn,
    onError: (error) => {
      if (!isFocusApiError(error) || error.code === "INTERNAL") markWorkspaceRoutesStale();
    },
    onSuccess: markWorkspaceRoutesStale,
  });
}
