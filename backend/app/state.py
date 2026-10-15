"""Shared lesson data passed between pipeline steps."""

from __future__ import annotations

from typing import Any, TypedDict


class LessonState(TypedDict, total=False):
    topic: str
    history: list
    intent: str
    chat_reply: str
    attempt: int
    max_attempts: int
    lesson_md: str
    previous_lesson_md: str
    evaluation: dict[str, Any]
    failed_checks: list[dict]
    passed_ids: list[str]
    best_lesson_md: str
    best_pass_count: int
    best_attempt: int
    past_failures: list[str]
    prompt_patches: list[str]
    self_evolved_this_run: list[dict]
    status: str
    final_lesson_md: str
    rejection_log: list[dict]
    steps: list[dict]
    started_at: str
    finished_at: str
    token_estimate: int


def new_state(topic: str, max_attempts: int) -> LessonState:
    return {
        "topic": topic,
        "intent": "",
        "chat_reply": "",
        "history": [],
        "attempt": 1,
        "max_attempts": max_attempts,
        "lesson_md": "",
        "previous_lesson_md": "",
        "evaluation": {},
        "failed_checks": [],
        "passed_ids": [],
        "best_lesson_md": "",
        "best_pass_count": -1,
        "best_attempt": 0,
        "past_failures": [],
        "prompt_patches": [],
        "self_evolved_this_run": [],
        "status": "",
        "final_lesson_md": "",
        "rejection_log": [],
        "steps": [],
        "started_at": "",
        "finished_at": "",
        "token_estimate": 0,
    }
