import { PlanReviewScreen } from "@/modules/visual-proof/presentation";

import { requireVisualProofDevelopment } from "../_visual-proof";

export default function PlanPage() {
  requireVisualProofDevelopment();
  return <PlanReviewScreen />;
}
