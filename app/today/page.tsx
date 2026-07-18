import { TodayScreen } from "@/modules/visual-proof/presentation";

import { requireVisualProofDevelopment } from "../_visual-proof";

export default function TodayPage() {
  requireVisualProofDevelopment();
  return <TodayScreen />;
}
