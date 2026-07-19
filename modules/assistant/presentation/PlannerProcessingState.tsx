import { Check, Circle, LoaderCircle } from "lucide-react";

import type { PlannerInput } from "../application/contracts";

import { inputWindowLabel } from "./planner-presentation-format";
import styles from "./PlannerProcessingState.module.css";

const stages = [
  { id: "interpreting", label: "Interpreting the selected input" },
  { id: "validating", label: "Validating suggestions and constraints" },
  { id: "scheduling", label: "Fitting eligible work into free intervals" },
] as const;

export function PlannerProcessingState({
  stage,
  input,
}: Readonly<{
  stage: (typeof stages)[number]["id"];
  input: PlannerInput;
}>) {
  const currentIndex = stages.findIndex(({ id }) => id === stage);
  return (
    <section className={styles.panel} aria-labelledby="planner-processing-heading" aria-busy="true">
      <p className="eyebrow">Creating proposal</p>
      <h2 id="planner-processing-heading">Building a reviewable plan</h2>
      <p className={styles.intro}>No task changes while the proposal is being prepared.</p>
      <ol className={styles.stageList} aria-live="polite">
        {stages.map((item, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "waiting";
          return (
            <li key={item.id} data-state={state}>
              {state === "complete" ? (
                <Check size={18} aria-hidden="true" />
              ) : state === "current" ? (
                <LoaderCircle size={18} aria-hidden="true" />
              ) : (
                <Circle size={18} aria-hidden="true" />
              )}
              <span>{item.label}</span>
              <span className="sr-only">{state}</span>
            </li>
          );
        })}
      </ol>
      <div className={styles.readOnlySummary}>
        <strong>Submitted constraints</strong>
        <span>{inputWindowLabel(input)}</span>
        <span>
          {input.selectedTaskIds.length} selected {input.selectedTaskIds.length === 1 ? "task" : "tasks"} ·
          Default {input.defaultDurationMinutes} min
        </span>
      </div>
    </section>
  );
}
