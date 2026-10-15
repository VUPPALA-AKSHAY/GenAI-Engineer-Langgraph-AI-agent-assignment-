"use client";

// Runs the lesson loop and maps live events to screen state.
import { useCallback, useRef, useState } from "react";

import { streamLesson, type ChatHistoryTurn } from "@/lib/api";
import type {
  CheckRow,
  LessonResult,
  LessonRunSnapshot,
  StageName,
  StageState,
  StepEvent,
} from "@/lib/types";
import type { AttemptEval } from "@/components/AgentReasoning";

const STAGE_ORDER: StageName[] = ["generate", "evaluate", "regenerate", "ship"];

const STAGE_LABELS: Record<StageName, string> = {
  generate: "Generate",
  evaluate: "Evaluate",
  regenerate: "Regenerate",
  ship: "Ship",
};

function initialStages(): StageState[] {
  return STAGE_ORDER.map((name) => ({
    name,
    status: "pending",
    detail: "",
    attempt: 1,
  }));
}

function setStage(
  stages: StageState[],
  name: StageName,
  status: StageState["status"],
  detail: string,
  attempt: number,
): StageState[] {
  return stages.map((stage) =>
    stage.name === name ? { ...stage, status, detail, attempt } : stage,
  );
}

export interface LessonRunState {
  running: boolean;
  topic: string;
  intent: "" | "teach" | "chat";
  stages: StageState[];
  steps: StepEvent[];
  checks: CheckRow[];
  attemptEvals: Record<number, AttemptEval>;
  currentAttempt: number;
  maxAttempts: number;
  evaluationSummary: string;
  result: LessonResult | null;
  notice: string | null;
  error: string | null;
}

const EMPTY: LessonRunState = {
  running: false,
  topic: "",
  intent: "",
  stages: initialStages(),
  steps: [],
  checks: [],
  attemptEvals: {},
  currentAttempt: 1,
  maxAttempts: 3,
  evaluationSummary: "",
  result: null,
  notice: null,
  error: null,
};

export function useLessonRun() {
  const [state, setState] = useState<LessonRunState>(EMPTY);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (topic: string, maxAttempts?: number, history: ChatHistoryTurn[] = []) => {
    const clean = topic.trim();
    if (!clean) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({
      ...EMPTY,
      running: true,
      topic: clean,
      maxAttempts: maxAttempts ?? 3,
      stages: setStage(initialStages(), "generate", "active", "Writing the first draft…", 1),
    });

    let stages = initialStages();
    let currentAttempt = 1;
    let max = maxAttempts ?? 3;
    const collectedSteps: StepEvent[] = [];

    const applyStep = (step: StepEvent) => {
      if (!["classify", "generate", "evaluate", "regenerate", "finalize"].includes(step.step)) {
        console.error("[LessonRun] Ignored internal step:", step.step, step.detail);
        return;
      }
      collectedSteps.push(step);
      currentAttempt = step.attempt || currentAttempt;

      if (step.step === "classify") {
        const decided = step.intent === "chat" ? "chat" : step.intent === "teach" ? "teach" : "";
        stages = setStage(
          stages,
          "generate",
          "active",
          step.intent === "chat"
            ? "Casual chat — replying directly, no lesson loop."
            : step.detail,
          1,
        );
        setState((prev) => ({ ...prev, intent: decided as LessonRunState["intent"] }));
      } else if (step.step === "generate") {
        stages = setStage(stages, "generate", "complete", step.detail, step.attempt);
        stages = setStage(stages, "evaluate", "active", "Checking against the 6 hard rules…", step.attempt);
      } else if (step.step === "evaluate") {
        stages = setStage(stages, "evaluate", "complete", step.detail, step.attempt);
        const passed = step.overall_pass === true;
        if (passed) {
          // First-attempt pass skips Regenerate entirely — mark it complete
          // ("not needed") so the stepper shows a clean run instead of a
          // grey skipped dot between two green checks.
          if (stages.find((s) => s.name === "regenerate")!.status === "pending") {
            stages = setStage(
              stages,
              "regenerate",
              "complete",
              "Not needed — first attempt passed.",
              step.attempt,
            );
          }
          stages = setStage(stages, "ship", "active", "All checks passed — packaging the lesson…", step.attempt);
        } else if (step.attempt < max) {
          stages = setStage(
            stages,
            "regenerate",
            "active",
            `Sending ${step.failed_ids?.length ?? 0} failure reason(s) back to the generator…`,
            step.attempt,
          );
        } else {
          // Final attempt failed — no retries left, so Regenerate is skipped:
          // mark it complete to avoid a grey gap before the Ship error.
          if (stages.find((s) => s.name === "regenerate")!.status === "pending") {
            stages = setStage(
              stages,
              "regenerate",
              "complete",
              "Skipped — retry budget spent.",
              step.attempt,
            );
          }
          stages = setStage(
            stages,
            "ship",
            "active",
            "Retry budget spent — finishing with the rejection log…",
            step.attempt,
          );
        }
      } else if (step.step === "regenerate") {
        stages = setStage(stages, "regenerate", "complete", step.detail, step.attempt);
        // Loop back for the next attempt: the new draft still needs
        // re-evaluation, so Evaluate goes back to pending instead of
        // staying green while Generate re-runs.
        stages = setStage(
          stages,
          "evaluate",
          "pending",
          "Waiting on the new draft…",
          step.attempt + 1,
        );
        stages = setStage(
          stages,
          "generate",
          "active",
          `Attempt ${step.attempt + 1}: rewriting with the failure reasons…`,
          step.attempt + 1,
        );
        currentAttempt = step.attempt + 1;
      } else if (step.step === "finalize") {
        const shipped = step.status === "pass";
        stages = setStage(
          stages,
          "generate",
          stages.find((s) => s.name === "generate")!.status === "pending" ? "complete" : stages.find((s) => s.name === "generate")!.status,
          stages.find((s) => s.name === "generate")!.detail || step.detail,
          step.attempt,
        );
        stages = setStage(stages, "ship", shipped ? "complete" : "error", step.detail, step.attempt);
        // Safety net: a terminal state must never leave Regenerate pending
        // (e.g. failed on attempt 1 of 1 with no regenerate event).
        if (stages.find((s) => s.name === "regenerate")!.status === "pending") {
          stages = setStage(
            stages,
            "regenerate",
            "complete",
            "Skipped — no regeneration ran.",
            step.attempt,
          );
        }
      }

      setState((prev) => ({
        ...prev,
        stages: [...stages],
        steps: [...collectedSteps],
        currentAttempt,
        maxAttempts: max,
      }));
    };

    const result = await streamLesson(
      clean,
      {        onStart: (data) => {
          max = data.max_attempts || max;
          setState((prev) => ({ ...prev, maxAttempts: max, topic: data.topic }));
        },
        onStep: applyStep,
        onEvaluation: (data) => {
          const attemptNo = data.attempt || currentAttempt;
          setState((prev) => ({
            ...prev,
            checks: data.checks || [],
            evaluationSummary: data.summary || "",
            currentAttempt: attemptNo,
            attemptEvals: {
              ...prev.attemptEvals,
              [attemptNo]: {
                checks: data.checks || [],
                summary: data.summary || "",
                overall_pass: data.overall_pass,
              },
            },
          }));
        },
        onDone: (lessonResult) => {
          if (lessonResult.status === "needs_topic" || lessonResult.status === "chat") {
            setState((prev) => ({
              ...prev,
              running: false,
              notice: lessonResult.message || "Tell me what you'd like to learn.",
              steps: [],
              checks: [],
              attemptEvals: {},
              result: null,
              error: null,
            }));
            return;
          }
          const shipped = lessonResult.status === "pass";
          stages = setStage(
            stages,
            "generate",
            "complete",
            lessonResult.steps.find((s) => s.step === "generate")?.detail || "Draft written.",
            lessonResult.attempts_used,
          );
          const evalStep = lessonResult.steps.find((s) => s.step === "evaluate");
          if (evalStep) {
            stages = setStage(stages, "evaluate", "complete", evalStep.detail, evalStep.attempt);
          }
          if (lessonResult.steps.some((s) => s.step === "regenerate")) {
            stages = setStage(
              stages,
              "regenerate",
              "complete",
              lessonResult.steps.filter((s) => s.step === "regenerate").slice(-1)[0].detail,
              Math.max(1, lessonResult.attempts_used - 1),
            );
          } else {
            // Terminal state with no regenerate event (first-attempt ship or
            // fail with no retries) — never leave a grey skipped dot behind.
            stages = setStage(
              stages,
              "regenerate",
              "complete",
              shipped ? "Not needed — first attempt passed." : "Skipped — no regeneration ran.",
              lessonResult.attempts_used,
            );
          }
          stages = setStage(
            stages,
            "ship",
            shipped ? "complete" : "error",
            shipped
              ? `Shipped on attempt ${lessonResult.attempts_used}.`
              : `Stopped after ${lessonResult.attempts_used} attempts (loop bounded).`,
            lessonResult.attempts_used,
          );
          const KNOWN_STEPS = new Set(["classify", "generate", "evaluate", "regenerate", "finalize"]);
          const cleanSteps = (lessonResult.steps || []).filter((s) => {
            const known = KNOWN_STEPS.has(s.step);
            if (!known) console.error("[LessonRun] Ignored internal step:", s.step, s.detail);
            return known;
          });
          setState((prev) => ({
            ...prev,
            running: false,
            stages: [...stages],
            steps: cleanSteps,
            checks: lessonResult.checks,
            currentAttempt: lessonResult.attempts_used,
            maxAttempts: lessonResult.max_attempts,
            result: lessonResult,
            error: null,
          }));
        },
        onError: (message) => {
          console.error("[LessonRun Error]", message);
          if (controller.signal.aborted) {
            setState((prev) => ({ ...prev, running: false }));
            return;
          }
          setState((prev) => ({ ...prev, running: false, error: "Something went wrong. Please try again." }));
        },
      },
      maxAttempts,
      history,
    );

    if (!result && !controller.signal.aborted) {
      setState((prev) =>
        prev.running
          ? {
              ...prev,
              running: false,
              error: prev.error || "The run stopped before finishing. Please check your connection and try again.",
            }
          : prev,
      );
    }
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState(EMPTY);
  }, []);

  // Restores a saved view after reload (always idle — a stream can't resume).
  const restore = useCallback((snapshot: LessonRunSnapshot) => {
    setState({
      ...EMPTY,
      topic: typeof snapshot.topic === "string" ? snapshot.topic : "",
      intent: snapshot.intent === "teach" || snapshot.intent === "chat" ? snapshot.intent : "",
      stages: Array.isArray(snapshot.stages) && snapshot.stages.length === 4 ? snapshot.stages : initialStages(),
      checks: Array.isArray(snapshot.checks) ? snapshot.checks : [],
      result: snapshot.result ?? null,
      notice: typeof snapshot.notice === "string" ? snapshot.notice : null,
      currentAttempt: Number.isFinite(snapshot.currentAttempt) ? snapshot.currentAttempt : 1,
      maxAttempts: Number.isFinite(snapshot.maxAttempts) ? snapshot.maxAttempts : 3,
      running: false,
    });
  }, []);

  return { state, run, reset, restore, stageLabels: STAGE_LABELS };
}
