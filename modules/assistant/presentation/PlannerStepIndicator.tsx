import { Check } from "lucide-react";

import styles from "./AssistantPlannerScreen.module.css";

type PlannerStep = "describe" | "review" | "result";

const steps: readonly Readonly<{ id: PlannerStep; label: string }>[] = [
  { id: "describe", label: "Describe" },
  { id: "review", label: "Review" },
  { id: "result", label: "Result" },
];

export function PlannerStepIndicator({ current }: Readonly<{ current: PlannerStep }>) {
  const currentIndex = steps.findIndex(({ id }) => id === current);
  return (
    <ol className={styles.steps} aria-label="Planning progress">
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        return (
          <li key={step.id} data-state={complete ? "complete" : step.id === current ? "current" : undefined}>
            <span aria-hidden="true">{complete ? <Check size={15} /> : index + 1}</span>
            <strong aria-current={step.id === current ? "step" : undefined}>{step.label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
