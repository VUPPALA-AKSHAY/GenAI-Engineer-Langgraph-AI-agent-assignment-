"use client";

// Animated orb showing what the AI is doing.
import { ThinkingOrb, type OrbState } from "thinking-orbs";

export type AgentOrbMode =
  | "connecting"
  | "classify"
  | "generate"
  | "evaluate"
  | "regenerate"
  | "chat"
  | "done";

const STATE_FOR_MODE: Record<AgentOrbMode, OrbState> = {
  connecting: "connecting",
  classify: "listening",
  generate: "composing",
  evaluate: "solving",
  regenerate: "weaving",
  chat: "composing",
  done: "breathing",
};

const LABEL_FOR_MODE: Record<AgentOrbMode, string> = {
  connecting: "Contacting the pipeline",
  classify: "Reading the message",
  generate: "Writing the draft",
  evaluate: "Grading the draft",
  regenerate: "Reworking what failed",
  chat: "Writing a reply",
  done: "Finished",
};

export function AgentOrb({
  mode,
  running,
  size = 20,
}: {
  mode: AgentOrbMode;
  running: boolean;
  size?: 64 | 32 | 20;
}) {
  return (
    <ThinkingOrb
      state={running ? STATE_FOR_MODE[mode] : "breathing"}
      size={size}
      aria-label={running ? LABEL_FOR_MODE[mode] : "Finished"}
    />
  );
}
