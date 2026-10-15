"use client";

// Page-turn lesson reader with fullscreen mode.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { splitLessonPages, type LessonPage } from "@/lib/markdown";

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
    <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
    <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const CollapseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface LessonCardProps {
  lesson: string;
  title: string;
  attemptsUsed?: number;
  overallPass?: boolean;
}

export function LessonCard({
  lesson,
  title,
  attemptsUsed = 1,
  overallPass = true,
}: LessonCardProps) {
  const pages: LessonPage[] = useMemo(() => splitLessonPages(lesson), [lesson]);
  const [pageIndex, setPageIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [anim, setAnim] = useState<"none" | "in-left" | "in-right">("none");
  const containerRef = useRef<HTMLDivElement>(null);

  const lastIndex = Math.max(0, pages.length - 1);
  const safeIndex = Math.min(pageIndex, lastIndex);
  const page = pages[safeIndex];

  const goTo = useCallback(
    (next: number) => {
      const target = Math.min(Math.max(next, 0), lastIndex);
      if (target === safeIndex) return;
      // Direction sticks until the next turn so the slide plays exactly
      // once per page (keyed remount below) with no second flicker.
      setAnim(target > safeIndex ? "in-right" : "in-left");
      setPageIndex(target);
    },
    [lastIndex, safeIndex],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goTo(safeIndex + 1);
      else if (event.key === "ArrowLeft") goTo(safeIndex - 1);
      else if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, safeIndex]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const lessonRef = useRef(lesson);
  useEffect(() => {
    if (lessonRef.current !== lesson) {
      lessonRef.current = lesson;
      setPageIndex(0);
    }
  }, [lesson]);

  if (!pages.length) return null;

  const reader = (
    <div className={`lesson-reader ${fullscreen ? "is-fullscreen" : ""}`} ref={containerRef}>
      <header className="lesson-bar">
        <button
          className="lesson-bar-btn"
          onClick={() => goTo(safeIndex - 1)}
          disabled={safeIndex === 0}
          aria-label="Previous section"
        >
          <ChevronLeftIcon />
        </button>

        <div className="lesson-bar-title">
          <h3>{title}</h3>
          <p>
            <span className="lesson-badge">
              {overallPass ? "PASSED 6/6" : "DRAFT"} · attempt {attemptsUsed}
            </span>
          </p>
        </div>

        <div className="lesson-bar-actions">
          <button
            className="lesson-bar-btn lesson-fullscreen-btn"
            onClick={() => setFullscreen((value) => !value)}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
            <span>{fullscreen ? "Exit" : "Fullscreen"}</span>
          </button>
        </div>
      </header>

      <div className="lesson-panel">
        <div
          key={safeIndex}
          className={`lesson-page ${anim === "in-right" ? "slide-in-right" : ""} ${
            anim === "in-left" ? "slide-in-left" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: page?.html || "" }}
        />
      </div>

      <div className="lesson-turn">
        <button
          className="lesson-turn-btn"
          onClick={() => goTo(safeIndex - 1)}
          disabled={safeIndex === 0}
        >
          <ChevronLeftIcon /> <span>Previous</span>
        </button>

        <div className="lesson-dots" role="tablist" aria-label="Lesson sections">
          {pages.map((item, index) => (
            <button
              key={item.index}
              role="tab"
              aria-selected={index === safeIndex}
              aria-label={item.heading}
              className={`lesson-dot ${index === safeIndex ? "is-on" : ""} ${
                index < safeIndex ? "is-done" : ""
              }`}
              onClick={() => goTo(index)}
            />
          ))}
          <span className="lesson-counter">
            {safeIndex + 1} of {pages.length}
          </span>
        </div>

        <button
          className="lesson-turn-btn"
          onClick={() => goTo(safeIndex + 1)}
          disabled={safeIndex === lastIndex}
        >
          <span>Next</span> <ChevronRightIcon />
        </button>
      </div>

      <footer className="lesson-footer">
        <span className="lesson-foot-mid">
          <BookIcon /> Lesson
        </span>
        <span className={`lesson-foot-btn is-done ${overallPass ? "is-ready" : ""}`}>
          <CheckIcon /> {overallPass ? "Completed" : "Draft"}
        </span>
      </footer>
    </div>
  );

  return (
    <>
      <div className="lesson-card">{reader}</div>
      {fullscreen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="lesson-fullscreen-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Lesson fullscreen"
          >
            <div className="lesson-fullscreen-inner">{reader}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
