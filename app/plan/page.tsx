import type { Metadata } from "next";

import {
  getAssistantPlannerApplication,
  getPlannerCapability,
  plannerProposalDtoSchema,
  type PlannerProposalDto,
} from "@/modules/assistant";
import { AssistantPlannerRouteScreen, type PlannerTaskOption } from "@/modules/assistant/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getPlanningProjectionApplication, type EisenhowerProjection } from "@/modules/planning";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { ApplicationError } from "@/shared/http/application-error";

import { loadWorkspace } from "../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "AI Review" };
export const dynamic = "force-dynamic";

type PlanPageProps = Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function PlanPage({ searchParams = Promise.resolve({}) }: PlanPageProps = {}) {
  const requestedProposal = readProposalId(await searchParams);
  const returnTo = (
    requestedProposal.id ? `/plan?proposal=${requestedProposal.id}` : "/plan"
  ) as `/${string}`;
  const workspace = await loadWorkspace(returnTo);
  const planning = getPlanningProjectionApplication();
  const [inbox, today, matrix, restoredProposal] = await Promise.all([
    getInbox(workspace.identity.actor),
    planning.getToday(workspace.identity.actor, { limit: 1 }),
    planning.getEisenhower(workspace.identity.actor, { limit: 500 }),
    requestedProposal.id
      ? loadOwnedProposal(workspace.identity.actor, requestedProposal.id)
      : Promise.resolve(null),
  ]);

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="plan"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
    >
      <AssistantPlannerRouteScreen
        capability={getPlannerCapability()}
        tasks={unscheduledOptions(matrix)}
        initialProposal={restoredProposal}
        initialProposalUnavailable={
          requestedProposal.invalid || (requestedProposal.id !== null && !restoredProposal)
        }
        initialInput={{
          brainDump: "",
          selectedTaskIds: [],
          planningDate: today.localDate,
          timeZone: workspace.preferences.timezone,
          workWindow: { start: "09:00", end: "17:00" },
          defaultDurationMinutes: 30,
          bufferMinutes: 10,
        }}
      />
    </AuthenticatedShell>
  );
}

const proposalIdSchema = plannerProposalDtoSchema.shape.id;

function readProposalId(searchParams: Record<string, string | string[] | undefined>) {
  const raw = searchParams.proposal;
  if (raw === undefined) return { id: null, invalid: false } as const;
  if (typeof raw !== "string") return { id: null, invalid: true } as const;
  const parsed = proposalIdSchema.safeParse(raw);
  return parsed.success
    ? ({ id: parsed.data, invalid: false } as const)
    : ({ id: null, invalid: true } as const);
}

async function loadOwnedProposal(
  actor: AuthenticatedActor,
  proposalId: string,
): Promise<PlannerProposalDto | null> {
  try {
    return await getAssistantPlannerApplication().getProposal(actor, proposalId);
  } catch (error) {
    if (error instanceof ApplicationError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
      return null;
    }
    throw error;
  }
}

function unscheduledOptions(matrix: EisenhowerProjection): PlannerTaskOption[] {
  return [...matrix.doNow, ...matrix.plan, ...matrix.timeSensitive, ...matrix.later]
    .filter((task) => task.schedule === null)
    .map(({ id, priority, title }) => ({ id, priority, title }))
    .sort((left, right) => left.title.localeCompare(right.title));
}
