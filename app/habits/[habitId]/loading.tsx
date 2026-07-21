import { HabitDetailLoadingScreen } from "@/modules/habits/presentation";
import { WorkspaceLoadingShell } from "@/modules/identity/presentation";

export default function HabitDetailLoading() {
  return (
    <WorkspaceLoadingShell label="Loading habit details">
      <HabitDetailLoadingScreen />
    </WorkspaceLoadingShell>
  );
}
