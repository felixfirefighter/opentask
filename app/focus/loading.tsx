import { FocusRouteLoadingScreen } from "@/modules/focus/presentation";
import { WorkspaceLoadingShell } from "@/modules/identity/presentation";

export default function FocusLoading() {
  return (
    <WorkspaceLoadingShell label="Loading Focus">
      <FocusRouteLoadingScreen />
    </WorkspaceLoadingShell>
  );
}
