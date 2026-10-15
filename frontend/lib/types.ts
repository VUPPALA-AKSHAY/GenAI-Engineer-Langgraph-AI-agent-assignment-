// Shared backend response shapes.
export type CheckLayer = "deterministic" | "llm" | "both";

export interface CheckRow {
  id: string;
  title?: string;
  pass: boolean;
  reason: string;
  layer?: CheckLayer;
}

export type GraphStepName =
  | "classify"
  | "generate"
  | "evaluate"
  | "regenerate"
  | "finalize"
  | "memory_error";

export interface StepEvent {
  step: GraphStepName;
  attempt: number;
  at?: string;
  detail: string;
  checks?: CheckRow[];
  overall_pass?: boolean;
  failed_ids?: string[];
  status?: string;
  intent?: string;
}

export interface FailedCheck {
  id: string;
  title?: string;
  reason: string;
}

export interface RejectionRow {
  attempt: number | string;
  status: string;
  failed_checks: FailedCheck[];
  fixes_applied: Record<string, string>;
  at?: string;
}

export interface EvolutionRow {
  check_id: string;
  title: string;
  total_failures: number;
  threshold: number;
  evolved: boolean;
  patch: string | null;
}

export interface LessonResult {
  topic: string;
  status: string;
  message?: string;
  lesson: string;
  attempts_used: number;
  max_attempts: number;
  checks: CheckRow[];
  overall_pass: boolean;
  summary: string;
  rejection_log: RejectionRow[];
  steps: StepEvent[];
  prompt_patches_active: string[];
  self_evolved_this_run: string[];
  evolution_report: EvolutionRow[];
  started_at?: string;
  finished_at?: string;
}

export type StageName = "generate" | "evaluate" | "regenerate" | "ship";

export type StageStatus = "pending" | "active" | "complete" | "error";

export interface StageState {
  name: StageName;
  status: StageStatus;
  detail: string;
  attempt: number;
}

// Saved chat thread: transcript plus the last finished view.
export interface TranscriptTurn {
  user: string;
  assistant: string;
  kind: "chat" | "lesson";
}

export interface LessonRunSnapshot {
  topic: string;
  intent: "" | "teach" | "chat";
  stages: StageState[];
  checks: CheckRow[];
  result: LessonResult | null;
  notice: string | null;
  currentAttempt: number;
  maxAttempts: number;
}

export interface ChatSession {
  id: string;
  title: string;
  at: number;
  transcript: TranscriptTurn[];
  live: LessonRunSnapshot | null;
}
