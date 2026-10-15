"use client";

// Side navigation with new-chat and pipeline links.
import { useEffect } from "react";

import type { ChatSession } from "@/lib/types";

interface SidebarProps {
  onNewChat: () => void;
  onNavigate: (targetId: string) => void;
  running: boolean;
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeId: string;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export function Sidebar({
  onNewChat,
  onNavigate,
  running,
  open,
  onClose,
  sessions,
  activeId,
  onOpenChat,
  onDeleteChat,
}: SidebarProps) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-open", open);
    return () => document.body.classList.remove("sidebar-open");
  }, [open ]);

  return (
    <aside className={`sidebar ${open ? "active" : ""}`} id="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">
          Lesson Lab
          <span className="run-card-sub" style={{ display: "block", fontSize: "0.68rem", fontWeight: 500 }}>
            Agentic lesson generator · LangGraph
          </span>
        </span>
      </div>

      <button
        className="new-chat-btn"
        onClick={() => {
          onNewChat();
          onClose();
        }}
        disabled={running}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>New Chat</span>
      </button>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <h3 className="section-label">Chats</h3>
          <div className="links-list">
            {sessions.length === 0 && (
              <span className="run-card-sub" style={{ padding: "4px 12px" }}>
                Past chats appear here
              </span>
            )}
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <a
                  href={`#chat-${session.id}`}
                  title={session.title}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!running) onOpenChat(session.id);
                  }}
                  className={session.id === activeId ? "active" : ""}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <span
                    className="link-icon"
                    style={{ fontSize: "0.85rem", fontWeight: 700 }}
                  >
                    {(session.title || "C")[0]?.toUpperCase()}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {session.title || "Chat"}
                  </span>
                </a>
                <button
                  onClick={() => onDeleteChat(session.id)}
                  aria-label={`Delete ${session.title || "chat"}`}
                  title="Delete chat"
                  style={{
                    flex: "0 0 auto",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                    padding: "8px",
                    borderRadius: 8,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="section-label">How it works</h3>
          <div className="links-list">
            <a
              href="#pipeline-stepper"
              title="Jump to the live pipeline"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("pipeline-stepper");
                onClose();
              }}
            >
              <span className="link-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </span>
              <span>1. Generate the lesson</span>
            </a>
            <a
              href="#pipeline-rubric"
              title="Jump to the rubric checks"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("pipeline-rubric");
                onClose();
              }}
            >
              <span className="link-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </span>
              <span>2. Evaluate: 6 hard checks</span>
            </a>
            <a
              href="#pipeline-log"
              title="Jump to the rejection log"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("pipeline-log");
                onClose();
              }}
            >
              <span className="link-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-3-6.7" />
                  <path d="M21 3v6h-6" />
                </svg>
              </span>
              <span>3. Regenerate on failure</span>
            </a>
            <a
              href="#pipeline-lesson"
              title="Jump to the finished lesson"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("pipeline-lesson");
                onClose();
              }}
            >
              <span className="link-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span>4. Ship only if all pass</span>
            </a>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <p className="run-card-sub" style={{ textAlign: "center" }}>
          Agentic · LangGraph
        </p>
      </div>
    </aside>
  );
}
