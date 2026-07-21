import { z, type ZodType } from "zod";

import { fetchWithConnectivity } from "@/shared/presentation";

import {
  plannerApplyResultSchema,
  plannerInputSchema,
  plannerProposalDtoSchema,
  plannerSelectionSchema,
  type PlannerApplyResult,
  type PlannerInput,
  type PlannerProposalDto,
  type PlannerSelection,
} from "../../application/contracts";

const plannerProblemCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL",
]);

const plannerProblemSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: plannerProblemCodeSchema,
  detail: z.string(),
  correlationId: z.string(),
  currentVersion: z.number().int().optional(),
});

export type PlannerApiErrorCode = z.infer<typeof plannerProblemCodeSchema> | "NETWORK" | "INVALID_RESPONSE";

export class PlannerApiError extends Error {
  readonly code: PlannerApiErrorCode;
  readonly status: number;
  readonly currentVersion: number | undefined;

  constructor(code: PlannerApiErrorCode, status = 0, currentVersion?: number) {
    super("The planner request could not be completed safely.");
    this.name = "PlannerApiError";
    this.code = code;
    this.status = status;
    this.currentVersion = currentVersion;
  }
}

type PlannerRequestOptions = Readonly<{
  method?: "GET" | "POST";
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}>;

export async function createPlannerProposal(input: PlannerInput, signal?: AbortSignal) {
  return requestPlannerJson(
    "/api/v1/planner/proposals",
    plannerProposalDtoSchema,
    mutationOptions(plannerInputSchema.parse(input), undefined, signal),
  );
}

export async function getPlannerProposal(proposalId: string, signal?: AbortSignal) {
  const id = proposalIdSchema.parse(proposalId);
  return requestPlannerJson(
    `/api/v1/planner/proposals/${encodeURIComponent(id)}`,
    plannerProposalDtoSchema,
    signal === undefined ? {} : { signal },
  );
}

export async function applyPlannerProposal(
  selection: PlannerSelection,
  signal?: AbortSignal,
): Promise<PlannerApplyResult> {
  const input = plannerSelectionSchema.parse(selection);
  return requestPlannerJson(
    `/api/v1/planner/proposals/${encodeURIComponent(input.proposalId)}/apply`,
    plannerApplyResultSchema,
    mutationOptions(input, { "idempotency-key": input.applyToken }, signal),
  );
}

export async function rejectPlannerProposal(
  proposalId: string,
  signal?: AbortSignal,
): Promise<PlannerProposalDto> {
  const id = proposalIdSchema.parse(proposalId);
  return requestPlannerJson(
    `/api/v1/planner/proposals/${encodeURIComponent(id)}/reject`,
    plannerProposalDtoSchema,
    mutationOptions({}, undefined, signal),
  );
}

const proposalIdSchema = z.uuidv4().refine((value) => value === value.toLowerCase(), {
  message: "Proposal IDs must use canonical lowercase UUIDs.",
});

function mutationOptions(body: unknown, headers?: HeadersInit, signal?: AbortSignal): PlannerRequestOptions {
  return {
    method: "POST",
    body,
    ...(headers === undefined ? {} : { headers }),
    ...(signal === undefined ? {} : { signal }),
  };
}

async function requestPlannerJson<Output>(
  path: string,
  schema: ZodType<Output>,
  options: PlannerRequestOptions = {},
): Promise<Output> {
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");
  if (options.body !== undefined) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetchWithConnectivity(path, {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PlannerApiError("NETWORK");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const problem = plannerProblemSchema.safeParse(payload);
    if (!problem.success) throw new PlannerApiError("INVALID_RESPONSE", response.status);
    throw new PlannerApiError(problem.data.code, response.status, problem.data.currentVersion);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new PlannerApiError("INVALID_RESPONSE", response.status);
  return parsed.data;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PlannerApiError("INVALID_RESPONSE", response.status);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
