import { z } from "zod";

import {
  correctCompletedSessionRequestSchema,
  deleteCompletedSessionRequestSchema,
  discardFocusSessionRequestSchema,
  focusHistoryPageSchema,
  focusHistoryQuerySchema,
  focusIdSchema,
  focusLinkSearchInputSchema,
  focusOwnedLinkSchema,
  focusSessionDtoSchema,
  focusStartRequestSchema,
  focusStartResultSchema,
  focusSummarySchema,
  focusTimerSnapshotSchema,
  focusTransitionRequestSchema,
  type CorrectCompletedSessionRequest,
  type FocusHistoryQuery,
  type FocusLinkSearchInput,
  type FocusStartRequest,
  type FocusTransitionRequest,
} from "../../application/contracts";
import { focusJsonMutation, focusQueryPath, requestFocusJson } from "./focus-api-request";

const nullableFocusSnapshotSchema = focusTimerSnapshotSchema.nullable();
const focusLinkSearchResultSchema = z.array(focusOwnedLinkSchema).max(20);

export function getActiveFocusSession() {
  return requestFocusJson("/api/v1/focus/active", nullableFocusSnapshotSchema);
}

export function getFocusSummary() {
  return requestFocusJson("/api/v1/focus/summary", focusSummarySchema);
}

export function listRecentFocusSessions(query: FocusHistoryQuery = {}) {
  const input = focusHistoryQuerySchema.parse(query);
  return requestFocusJson(focusQueryPath("/api/v1/focus/sessions", input), focusHistoryPageSchema);
}

export function searchFocusLinks(input: FocusLinkSearchInput) {
  const query = focusLinkSearchInputSchema.parse(input);
  return requestFocusJson(focusQueryPath("/api/v1/focus/links", query), focusLinkSearchResultSchema);
}

export function startFocusSession(resourceId: string, rawInput: FocusStartRequest) {
  const id = focusIdSchema.parse(resourceId);
  const input = focusStartRequestSchema.parse(rawInput);
  return requestFocusJson(
    "/api/v1/focus/sessions",
    focusStartResultSchema,
    focusJsonMutation("POST", input, { "idempotency-key": id }),
  );
}

export function pauseFocusSession(sessionId: string, input: FocusTransitionRequest) {
  return transition(sessionId, "pause", input);
}

export function resumeFocusSession(sessionId: string, input: FocusTransitionRequest) {
  return transition(sessionId, "resume", input);
}

export function finishFocusSession(sessionId: string, input: FocusTransitionRequest) {
  return transition(sessionId, "finish", input);
}

export function discardFocusSession(sessionId: string, rawInput: FocusTransitionRequest) {
  const id = focusIdSchema.parse(sessionId);
  const input = discardFocusSessionRequestSchema.parse(rawInput);
  return requestFocusJson(
    `/api/v1/focus/sessions/${id}/discard`,
    focusSessionDtoSchema,
    focusJsonMutation("POST", input),
  );
}

export function correctCompletedFocusSession(sessionId: string, rawInput: CorrectCompletedSessionRequest) {
  const id = focusIdSchema.parse(sessionId);
  const input = correctCompletedSessionRequestSchema.parse(rawInput);
  return requestFocusJson(
    `/api/v1/focus/sessions/${id}`,
    focusSessionDtoSchema,
    focusJsonMutation("PATCH", input),
  );
}

export function deleteCompletedFocusSession(sessionId: string, rawInput: FocusTransitionRequest) {
  const id = focusIdSchema.parse(sessionId);
  const input = deleteCompletedSessionRequestSchema.parse(rawInput);
  return requestFocusJson(
    `/api/v1/focus/sessions/${id}`,
    focusSessionDtoSchema,
    focusJsonMutation("DELETE", input),
  );
}

function transition(
  sessionId: string,
  command: "pause" | "resume" | "finish",
  rawInput: FocusTransitionRequest,
) {
  const id = focusIdSchema.parse(sessionId);
  const input = focusTransitionRequestSchema.parse(rawInput);
  return requestFocusJson(
    `/api/v1/focus/sessions/${id}/${command}`,
    focusTimerSnapshotSchema,
    focusJsonMutation("POST", input),
  );
}
