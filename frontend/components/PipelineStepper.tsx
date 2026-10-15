"use client";

// Connects lesson stages to the booking progress display.
import { useEffect, useState } from "react";

import type { StageState } from "@/lib/types";
import {
  ProgressCard,
  type Step as ProgressStep,
} from "@/components/blocks/card-progress/progress-card";

const LABELS: Record<string, string> = {
  generate: "Generate",
  evaluate: "Evaluate",
  regenerate: "Regenerate",
  ship: "Ship",
};

const SUBTITLES: Record<string, string> = {
  generate: "Write the beginner lesson",
  evaluate: "6 hard pass/fail checks",
  regenerate: "Fix only what failed",
  ship: "Ready to publish",
};

function toProgressStatus(status: StageState["status"]): ProgressStep["status"] {
  switch (status) {
    case "active":
      return "in_progress";
    case "complete":
      return "complete";
    case "error":
      return "error";
    default:
      return "pending";
  }
}

export function PipelineStepper({
  stages,
  currentAttempt,
  maxAttempts,
}: {
  stages: StageState[];
  currentAttempt: number;
  maxAttempts: number;
}) {
  const steps: ProgressStep[] = stages.map((stage) => ({
    id: stage.name,
    title: LABELS[stage.name] ?? stage.name,
    description: SUBTITLES[stage.name] ?? stage.detail,
    status: toProgressStatus(stage.status),
  }));

  return (
    <div role="group" aria-label="Lesson pipeline progress">
      <ProgressCard steps={steps} />

      <div className="stepper-attempt">
        <span className={`attempt-pill ${currentAttempt > 1 ? "is-retry" : ""}`}>
          Attempt {currentAttempt} / {maxAttempts}
        </span>
        <span className="stepper-hint">
          {currentAttempt > 1
            ? "Regenerating with the failure reasons fed back in"
            : "First draft — the evaluator decides if it ships"}
        </span>
      </div>
    </div>
  );
}

export function EventLog({ steps }: { steps: { step: string; detail: string; attempt: number }[] }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => setVisible(true), [steps.length]);

  if (!steps.length) return null;

  return (
    <div className="event-log">
      <button className="event-log-toggle" onClick={() => setVisible((v) => !v)}>
        <span className="event-dot" />
        Pipeline log ({steps.length})
        <span className="event-log-chevron">{visible ? "▾" : "▸"}</span>
      </button>
      {visible && (
        <ol className="event-log-list">
          {steps.map((step, index) => (
            <li key={`${step.step}-${index}`} className={`event-log-row is-${step.step}`}>
              <span className="event-log-tag">{step.step}</span>
              <span className="event-log-text">{step.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
