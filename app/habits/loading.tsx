import { HabitWorkspaceLoadingScreen } from "@/modules/habits/presentation";
import { WorkspaceLoadingShell } from "@/modules/identity/presentation";

export default function HabitLoading() {
  return (
    <WorkspaceLoadingShell label="Loading habits">
      <HabitWorkspaceLoadingScreen />
    </WorkspaceLoadingShell>
  );
}
