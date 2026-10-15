"use client";

// Main chat screen: ask for lessons, watch them get built.
import { useEffect, useRef, useState } from "react";

import { AgentReasoning } from "@/components/AgentReasoning";
import { LessonCard } from "@/components/LessonCard";
import { PipelineStepper } from "@/components/PipelineStepper";import { RejectionLog, RubricChecklist } from "@/components/RubricChecklist";
import { Sidebar } from "@/components/Sidebar";
import { useLessonRun } from "@/hooks/useLessonRun";
import type { ChatSession, LessonRunSnapshot, TranscriptTurn } from "@/lib/types";

const STORAGE_KEY = "lesson-lab-chat-v1";
const SESSIONS_KEY = "lesson-lab-sessions-v1";

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const BotAvatar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2 2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const UserAvatar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default function Home() {
  const { state, run, reset, restore } = useLessonRun();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hydratedRef = useRef(false);
  const [threadId, setThreadId] = useState("");

  const hasRun = state.topic !== "" || state.result !== null || transcript.length > 0;
  const running = state.running;

  // Reload keeps every chat: current thread restores, older threads list in sidebar.
  useEffect(() => {
    const newThreadId = () =>
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
      const savedSessions = localStorage.getItem(SESSIONS_KEY);
      if (savedSessions) {
        const list = JSON.parse(savedSessions) as ChatSession[];
        if (Array.isArray(list)) setSessions(list.filter((s) => s && s.id).slice(0, 20));
      }
    } catch {
      // No saved threads — start fresh.
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          transcript?: unknown;
          live?: unknown;
          pendingTopic?: unknown;
          threadId?: unknown;
        };
        setThreadId(typeof data.threadId === "string" && data.threadId ? data.threadId : newThreadId());
        if (Array.isArray(data.transcript)) {
          setTranscript(
            data.transcript.filter(
              (t): t is TranscriptTurn =>
                !!t && typeof (t as { user?: unknown }).user === "string",
            ),
          );
        }
        const live = data.live as Partial<LessonRunSnapshot> | null;
        if (live && (live.topic || live.result)) {
          restore(live as LessonRunSnapshot);
        } else if (typeof data.pendingTopic === "string" && data.pendingTopic.trim()) {
          setInput(data.pendingTopic);
        }
      } else {
        setThreadId(newThreadId());
      }
    } catch {
      // Corrupt save — start fresh.
      setThreadId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    }
    hydratedRef.current = true;
  }, [restore]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      // Transcript and in-flight question always save; the live view only
      // saves once idle so a reload never restores a frozen spinner.
      const live =
        !running && (state.topic || state.result)
          ? {
              topic: state.topic,
              intent: state.intent,
              stages: state.stages,
              checks: state.checks,
              result: state.result,
              notice: state.notice,
              currentAttempt: state.currentAttempt,
              maxAttempts: state.maxAttempts,
            }
          : null;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          threadId: threadId,
          transcript,
          live,
          pendingTopic: running ? state.topic : "",
        }),
      );
    } catch {
      // Storage full or blocked — chat still works for this session.
    }
  }, [transcript, state, running, threadId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 20)));
    } catch {
      // Storage full or blocked — list still works for this session.
    }
  }, [sessions]);

  // Files the current thread into the sidebar list (newest first, no dupes).
  const archiveCurrent = () => {
    if (!state.topic && !state.result && transcript.length === 0) return;
    const title = (state.topic || transcript[0]?.user || "Chat").slice(0, 40);
    const live: LessonRunSnapshot | null =
      state.topic || state.result
        ? {
            topic: state.topic,
            intent: state.intent,
            stages: state.stages,
            checks: state.checks,
            result: state.result,
            notice: state.notice,
            currentAttempt: state.currentAttempt,
            maxAttempts: state.maxAttempts,
          }
        : null;
    const entry: ChatSession = {
      id: threadId,
      title,
      at: Date.now(),
      transcript,
      live,
    };
    setSessions((prev) => [entry, ...prev.filter((s) => s.id !== entry.id)].slice(0, 20));
  };

  const openSession = (id: string) => {
    if (running) return;
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    archiveCurrent();
    setThreadId(session.id);
    setTranscript(session.transcript);
    if (session.live && (session.live.topic || session.live.result)) {
      restore(session.live);
    } else {
      reset();
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setSidebarOpen(false);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const newChat = () => {
    setSidebarOpen(false);
    archiveCurrent();
    setTranscript([]);
    reset();
    setThreadId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing saved — nothing to clear.
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.steps.length, state.checks.length, state.result]);

  const submit = (topic: string) => {
    const clean = topic.trim();
    if (!clean || running) return;
    if (state.notice && state.topic) {
      const user = state.topic;
      const assistant = state.notice;
      setTranscript((prev) =>
        prev.length > 0 &&
        prev[prev.length - 1].user === user &&
        prev[prev.length - 1].kind === "chat"
          ? prev
          : [...prev, { user, assistant, kind: "chat" as const }],
      );
    } else if (state.result) {
      const user = state.topic;
      const passed = state.result.status === "pass";
      setTranscript((prev) =>
        prev.length > 0 &&
        prev[prev.length - 1].user === user &&
        prev[prev.length - 1].kind === "lesson"
          ? prev
          : [
              ...prev,
              {
                user,
                assistant: passed
                  ? `Lesson shipped on attempt ${state.result!.attempts_used} — all 6 checks passed.`
                  : `Stopped after ${state.result!.attempts_used} attempts — see the rejection log above.`,
                kind: "lesson" as const,
              },
            ],
      );
    }
    setInput("");
    const history: { role: "user" | "assistant"; content: string }[] = [];
    if (state.result?.lesson) {
      history.push({
        role: "assistant",
        content: `[Previous lesson on "${state.result.topic}"]:\n${state.result.lesson.slice(0, 3000)}`,
      });
    }
    for (const turn of transcript.slice(-4)) {
      history.push({ role: "user", content: turn.user });
      history.push({ role: "assistant", content: turn.assistant });
    }
    void run(clean, undefined, history);
  };

  const navigateTo = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      textareaRef.current?.focus();
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen((open) => !open);
    } else {
      setCollapsed((value) => !value);
    }
  };

  const result = state.result;
  const shipped = result?.status === "pass";
  const rejected = result && result.status !== "pass";
  const isChat = state.intent === "chat";
  const isLesson = state.intent === "teach";
  const showPipeline = isLesson;

  return (
    <div className={`app-layout ${collapsed ? "collapsed" : ""}`}>
      <Sidebar
        onNewChat={newChat}
        onNavigate={navigateTo}
        running={running}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        activeId={threadId}
        onOpenChat={openSession}
        onDeleteChat={deleteSession}
      />

      <main className="main-content">
        <header className="top-bar">
          <button
            className="menu-btn"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            title="Collapse / expand sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </header>

        <div className="chat-area">
          {!hasRun && (
            <div className="welcome-screen">
              <div className="blur-text-wrapper">
                <p className="blur-text-container">
                  What should I teach today?
                </p>
              </div>
              <p className="run-card-sub" style={{ marginBottom: 18, textAlign: "center" }}>
                I write a beginner lesson, grade it against 6 hard rules, and rewrite it
                until it passes — you watch every step.
              </p>

              <div className="main-input-container">
                <div className="input-box">
                  <textarea
                    ref={textareaRef}
                    className="message-input"
                    placeholder="Type a topic, e.g. Introduction to RAG…"
                    rows={1}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submit(input);
                      }
                    }}
                  />
                </div>
                <div className="input-actions">
                  <div className="input-actions-right">
                    <button
                      className="send-button"
                      aria-label="Send message"
                      onClick={() => submit(input)}
                      disabled={!input.trim() || running}
                    >
                      <SendIcon />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasRun && (
            <div className="chat-messages active">
              {transcript.map((turn, index) => (
                <div key={`past-${index}`}>
                  <div className="message user-message">
                    <div className="message-avatar">
                      <UserAvatar />
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        <p>{turn.user}</p>
                      </div>
                    </div>
                  </div>
                  <div className="message bot-message">
                    <div className="message-avatar">
                      <BotAvatar />
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        <p>{turn.assistant}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {state.topic !== "" && (
              <div className="message user-message">
                <div className="message-avatar">
                  <UserAvatar />
                </div>
                <div className="message-content">
                  <div className="message-text">
                    <p>{state.topic}</p>
                  </div>
                </div>
              </div>
              )}

              {state.notice ? (
                <div className="message bot-message">
                  <div className="message-avatar">
                    <BotAvatar />
                  </div>
                  <div className="message-content">
                    <div className="message-text">
                      <p>{state.notice}</p>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="message bot-message">
                <div className="message-avatar">
                  <BotAvatar />
                </div>
                <div className="message-content" style={{ width: "100%" }}>
                  {showPipeline && (
                  <div className="run-card" id="pipeline-stepper">
                    <div className="run-card-head">
                      <span className="run-card-title">Lesson pipeline</span>
                      <span className="run-card-sub">LangGraph · max {state.maxAttempts} attempts</span>
                    </div>
                    <PipelineStepper
                      stages={state.stages}
                      currentAttempt={state.currentAttempt}
                      maxAttempts={state.maxAttempts}
                    />
                  </div>
                  )}
                  {running && (
                    <AgentReasoning
                      steps={state.steps}
                      running={running}
                      result={result}
                      attemptEvals={state.attemptEvals}
                      currentAttempt={state.currentAttempt}
                    />
                  )}

                  {showPipeline && (state.checks.length > 0 || running) && (
                    <div className="run-card" id="pipeline-rubric">
                      <RubricChecklist checks={state.checks} running={running} />
                    </div>
                  )}

                  {rejected && result.rejection_log.length > 0 && (
                    <div className="run-card" id="pipeline-log">
                      <RejectionLog rows={result.rejection_log} />
                    </div>
                  )}

                  {state.error && (
                    <div className="run-banner is-error" role="alert">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>
                        Something went wrong. Please check your connection and try again.
                      </span>
                    </div>
                  )}

                  {result && (
                    <>
                      {shipped ? (
                        <div className="run-banner is-pass" role="status">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>
                            Shipped on attempt {result.attempts_used} — all 6 checks passed.
                            {result.rejection_log.some((r) => r.status === "rejected")
                              ? " The rejection log above shows what had to be fixed."
                              : " First attempt passed, so no fixes were needed."}
                          </span>
                        </div>
                      ) : (
                        rejected && (
                          <div className="run-banner is-fail" role="status">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>
                              Stopped after {result.attempts_used} attempts — still failing, so
                              this draft is NOT shipped. Showing the best draft below with the full
                              rejection log.
                            </span>
                          </div>
                        )
                      )}

                      {result.self_evolved_this_run.length > 0 && (
                        <div className="evolve-note">
                          <strong>Self-evolution:</strong> this run hardened the prompts —{" "}
                          {result.self_evolved_this_run.join(" ")}
                        </div>
                      )}

                      {result.lesson && (
                        <div id="pipeline-lesson">
                          <LessonCard
                            lesson={result.lesson}
                            title={result.topic}
                            attemptsUsed={result.attempts_used}
                            overallPass={result.overall_pass}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {hasRun && (
          <div className="fixed-input-area is-open">
            <div className="fixed-input-container">
              <div className="input-box">
                <textarea
                  className="message-input"
                  placeholder={
                    running
                      ? isLesson
                        ? "Working on your lesson…"
                        : isChat
                          ? "Replying…"
                          : "Thinking…"
                      : "Ask for another lesson…"
                  }
                  rows={1}
                  value={input}
                  disabled={running}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit(input);
                    }
                  }}
                />
              </div>
              <div className="input-actions">
                <div className="input-actions-left">
                  <span className="run-card-sub">
                    {running
                      ? isLesson
                        ? `Attempt ${state.currentAttempt} / ${state.maxAttempts}…`
                        : isChat
                          ? "Replying…"
                          : "Understanding your message…"
                      : "New topic starts a fresh loop"}
                  </span>
                </div>
                <div className="input-actions-right">
                  <button
                    className="send-button"
                    aria-label="Send message"
                    onClick={() => submit(input)}
                    disabled={!input.trim() || running}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <div
        className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  );
}
