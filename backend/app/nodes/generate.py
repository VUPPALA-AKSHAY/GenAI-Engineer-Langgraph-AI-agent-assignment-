"""Writes the beginner lesson."""

from __future__ import annotations

from datetime import datetime, timezone

from .. import llm, prompts
from ..state import LessonState


def generate_node(state: LessonState) -> LessonState:
    attempt = int(state.get("attempt", 1))

    if attempt == 1:
        if not state.get("past_failures"):
            from .. import memory

            state["past_failures"] = memory.load_recent_failures(state["topic"], limit=5)
        if not state.get("prompt_patches"):
            from .. import self_evolve

            state["prompt_patches"] = self_evolve.get_active_patches()

    retry_feedback = state.get("failed_checks") or []
    passed_ids = state.get("passed_ids") or []

    user_prompt = prompts.generate_user_prompt(
        state["topic"],
        past_failures=state.get("past_failures") or [],
        prompt_patches=state.get("prompt_patches") or [],
        retry_feedback=retry_feedback,
        passed_ids=passed_ids,
        previous_lesson=state.get("previous_lesson_md") or None,
        attempt=attempt,
    )

    lesson = llm.chat(prompts.GENERATE_SYSTEM, user_prompt, temperature=0.7)

    state["previous_lesson_md"] = state.get("lesson_md", "")
    state["lesson_md"] = lesson
    state["token_estimate"] = int(state.get("token_estimate", 0)) + len(lesson) // 4
    state["steps"] = list(state.get("steps", [])) + [
        {
            "step": "generate",
            "attempt": attempt,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "detail": (
                f"Attempt {attempt}: draft written ({len(lesson.split())} words, "
                f"rewriting with {len(retry_feedback)} "
                f"{'failure reason' if len(retry_feedback) == 1 else 'failure reasons'} fed back in)."
                if attempt > 1
                else f"Attempt {attempt}: first draft written ({len(lesson.split())} words)."
            ),
        }
    ]
    return state
