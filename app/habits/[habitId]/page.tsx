import type { Metadata } from "next";
import Link from "next/link";
import { ZodError } from "zod";

import { getHabitsApplication, type HabitMonthProjection, type HabitOverview } from "@/modules/habits";
import { HabitDetailRouteScreen, HabitNavigation } from "@/modules/habits/presentation";
import { AuthenticatedShell } from "@/modules/identity/presentation";
import { getInbox } from "@/modules/tasks";
import { TaskCommandPalette } from "@/modules/tasks/presentation";
import { ApplicationError } from "@/shared/http/application-error";

import { loadWorkspace } from "../../(workspace)/_load-workspace";

export const metadata: Metadata = { title: "Habit details" };
export const dynamic = "force-dynamic";

type HabitDetailPageProps = Readonly<{ params: Promise<{ habitId: string }> }>;

export default async function HabitDetailPage({ params }: HabitDetailPageProps) {
  const { habitId } = await params;
  const route = `/habits/${habitId}` as `/${string}`;
  const workspace = await loadWorkspace(route);
  const actor = workspace.identity.actor;
  const [inbox, overview] = await Promise.all([getInbox(actor), loadHabitOverview(actor, habitId)]);
  const lifecycle = overview?.detail.habit.archivedAt ? "archived" : "active";
  const initialMonth = overview ? await loadInitialMonth(actor, overview) : undefined;

  return (
    <AuthenticatedShell
      identity={workspace.identity}
      theme={workspace.preferences.theme}
      reducedMotion={workspace.preferences.reducedMotion}
      currentDestination="habits"
      destinationTitle="Habit details"
      topBarActions={<TaskCommandPalette inbox={inbox} />}
      contextNavigation={<HabitNavigation current={lifecycle} />}
      compactNavigation={<HabitNavigation current={lifecycle} variant="compact" />}
      mobileNavigation={null}
    >
      {overview ? (
        <HabitDetailRouteScreen initialOverview={overview} {...(initialMonth ? { initialMonth } : {})} />
      ) : (
        <UnavailableHabit />
      )}
    </AuthenticatedShell>
  );
}

type HabitActor = Parameters<ReturnType<typeof getHabitsApplication>["projections"]["getHabitOverview"]>[0];

async function loadHabitOverview(actor: HabitActor, habitId: string): Promise<HabitOverview | null> {
  try {
    return await getHabitsApplication().projections.getHabitOverview(actor, habitId);
  } catch (error) {
    if (isUnavailableResource(error)) return null;
    throw error;
  }
}

async function loadInitialMonth(
  actor: HabitActor,
  overview: HabitOverview,
): Promise<HabitMonthProjection | undefined> {
  try {
    return await getHabitsApplication().projections.getHabitMonth(actor, overview.detail.habit.id, {
      yearMonth: overview.localDate.slice(0, 7),
    });
  } catch {
    // Monthly history has an independent client-side loading/error state.
    return undefined;
  }
}

function isUnavailableResource(error: unknown): boolean {
  return error instanceof ZodError || (error instanceof ApplicationError && error.code === "NOT_FOUND");
}

function UnavailableHabit() {
  return (
    <section className="workspace-route-state" aria-labelledby="habit-unavailable-title">
      <div>
        <p className="eyebrow">Habits</p>
        <h1 id="habit-unavailable-title" tabIndex={-1} data-route-focus>
          Habit unavailable
        </h1>
        <p>This habit could not be found or you may not have access.</p>
        <Link className="secondary-button" href="/habits">
          Back to habits
        </Link>
      </div>
    </section>
  );
}
