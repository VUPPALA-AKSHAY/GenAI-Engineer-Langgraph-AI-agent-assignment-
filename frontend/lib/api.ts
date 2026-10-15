import type { CheckRow, LessonResult, StepEvent } from "./types";

// Backend chat + lesson streaming calls.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

export interface StreamHandlers {
  onStart?: (data: { topic: string; max_attempts: number }) => void;
  onStep?: (step: StepEvent) => void;
  onEvaluation?: (data: {
    attempt?: number;
    overall_pass?: boolean;
    checks: CheckRow[];
    summary: string;
  }) => void;
  onDone?: (result: LessonResult) => void;
  onError?: (message: string) => void;
}

async function readSSE(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (line: string) => {
    const raw = line.replace(/^data:\s*/, "").trim();
    if (!raw) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    switch (payload.type) {
      case "start":
        handlers.onStart?.(payload as never);
        break;
      case "step":
        handlers.onStep?.(payload as unknown as StepEvent);
        break;
      case "evaluation":
        handlers.onEvaluation?.(payload as never);
        break;
      case "done":
        handlers.onDone?.(payload.result as LessonResult);
        break;
      case "error":
        handlers.onError?.(String(payload.message || "Unknown error"));
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) dispatch(part);
    }
    if (buffer.trim()) dispatch(buffer);
  } finally {
    reader.releaseLock();
  }
}

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export async function streamLesson(
  topic: string,
  handlers: StreamHandlers,
  maxAttempts?: number,
  history: ChatHistoryTurn[] = [],
): Promise<LessonResult | null> {
  let result: LessonResult | null = null;
  try {
    const response = await fetch(`${API_URL}/api/generate-lesson/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, max_attempts: maxAttempts ?? null, history }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Backend returned ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.body) throw new Error("Backend returned no stream.");

    await readSSE(response.body, {
      ...handlers,
      onDone: (lessonResult) => {
        result = lessonResult;
        handlers.onDone?.(lessonResult);
      },
    });

    if (!result) throw new Error("Stream ended without a result.");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handlers.onError?.(message);
    return null;
  }
}

export async function generateLesson(
  topic: string,
  maxAttempts?: number,
  history: ChatHistoryTurn[] = [],
): Promise<LessonResult> {
  const response = await fetch(`${API_URL}/api/generate-lesson`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, max_attempts: maxAttempts ?? null, history }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Backend returned ${response.status}: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as LessonResult;
}

export async function health(): Promise<{
  ok: boolean;
  model: string;
  max_attempts: number;
}> {
  const response = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
  if (!response.ok) throw new Error(`health ${response.status}`);
  return response.json();
}
