import { CalendarScreen } from "@/modules/visual-proof/presentation";

import { requireVisualProofDevelopment } from "../_visual-proof";

export default function CalendarPage() {
  requireVisualProofDevelopment();
  return <CalendarScreen />;
}
