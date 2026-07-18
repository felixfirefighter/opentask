import { TaskDetailScreen } from "@/modules/visual-proof/presentation";

import { requireVisualProofDevelopment } from "../../_visual-proof";

export default function TaskDetailPage() {
  requireVisualProofDevelopment();
  return <TaskDetailScreen />;
}
