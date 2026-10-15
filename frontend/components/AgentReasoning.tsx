"use client";

// Single-line thinking indicator with orb and timer.
import {
  Reasoning,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useEffect, useRef, useState } from "react";

import { AgentOrb, type AgentOrbMode } from "./AgentOrb";

import type { CheckRow, LessonResult, StepEvent } from "@/lib/types";

export interface AttemptEval {
  checks: CheckRow[];
  summary: string;
  overall_pass?: boolean;
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}m ${totalSeconds % 60}s`;
}

function parseTime(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

const NODE_LABEL: Record<string, string> = {
  classify: "Understand",
  generate: "Generate",
  evaluate: "Evaluate",
  regenerate: "Regenerate",
  finalize: "Ship",
};

export function AgentReasoning({
  steps,
  running,
  result,
  currentAttempt,
}: {
  steps: StepEvent[];
  running: boolean;
  result: LessonResult | null;
  attemptEvals?: Record<number, AttemptEval>;
  currentAttempt: number;
}) {
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const prevRunning = useRef(running);
  const runStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (running && !prevRunning.current) {
      runStartRef.current = Date.now();
    }
    prevRunning.current = running;
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (!steps.length && !running) return null;

  const startMs = steps.length ? parseTime(steps[0].at) : runStartRef.current;
  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const endMs = running ? now : (parseTime(lastStep?.at ?? undefined) ?? now);
  const elapsed = startMs == null ? null : formatElapsed(endMs - startMs);

  const activeLabel = running
    ? lastStep
      ? `${NODE_LABEL[lastStep.step] ?? lastStep.step} · attempt ${lastStep.attempt}`
      : `Generate · attempt ${currentAttempt}`
    : null;

  const shipped = result?.status === "pass";
  const outcome = result
    ? shipped
      ? `shipped on attempt ${result.attempts_used}`
      : `rejected after ${result.attempts_used}`
    : running
      ? "working"
      : "finished";

  const triggerMode: AgentOrbMode = !running
    ? "done"
    : !lastStep
      ? "connecting"
      : lastStep.step === "finalize"
        ? "done"
        : lastStep.step === "classify"
          ? "classify"
          : lastStep.step === "generate"
            ? "generate"
            : lastStep.step === "evaluate"
              ? "evaluate"
              : "regenerate";

  return (
    <Reasoning
      className="thinking-ai"
      isStreaming={running}
      open={open}
      onOpenChange={setOpen}
    >
      <ReasoningTrigger
        className="thinking-ai-trigger"
        getThinkingMessage={(isStreaming) =>
          isStreaming ? (
            <Shimmer duration={1}>
              {`Thinking… ${activeLabel ?? `Generate · attempt ${currentAttempt}`}${elapsed ? ` · ${elapsed}` : ""}`}
            </Shimmer>
          ) : (
            <p>
              {`Thought${elapsed ? ` for ${elapsed}` : ""} · ${steps.length} steps · ${outcome}`}
            </p>
          )
        }
      >
        <AgentOrb mode={triggerMode} running={running} size={20} />
        {running ? (
          <Shimmer duration={1}>
            {`Thinking… ${activeLabel ?? `Generate · attempt ${currentAttempt}`}${elapsed ? ` · ${elapsed}` : ""}`}
          </Shimmer>
        ) : (
          <p>
            {`Thought${elapsed ? ` for ${elapsed}` : ""} · ${steps.length} steps · ${outcome}`}
          </p>
        )}
      </ReasoningTrigger>
    </Reasoning>
  );
}
