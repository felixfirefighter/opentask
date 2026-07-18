import { BrandMark } from "@/shared/presentation";

export default function WorkspaceLoading() {
  return (
    <div className="workspace-route-state" aria-busy="true">
      <BrandMark />
      <p role="status">Opening your workspace…</p>
    </div>
  );
}
