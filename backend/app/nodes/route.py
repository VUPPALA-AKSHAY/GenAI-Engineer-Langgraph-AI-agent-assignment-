"""Retry, routing, and shipping for the lesson loop."""

from __future__ import annotations

from datetime import datetime, timezone

from .. import memory, self_evolve
from ..state import LessonState


def route_after_evaluate(state: LessonState) -> str:
    evaluation = state.get("evaluation", {}) or {}
    if evaluation.get("overall_pass"):
        return "finalize"

    attempt = int(state.get("attempt", 1))
    max_attempts = int(state.get("max_attempts", 3))
    if attempt < max_attempts:
        return "regenerate"
    return "finalize"


def regenerate_node(state: LessonState) -> LessonState:
    attempt = int(state.get("attempt", 1))
    failed = state.get("failed_checks", []) or []

    state["attempt"] = attempt + 1
    state["rejection_log"] = list(state.get("rejection_log", [])) + [
        {
            "attempt": attempt,
            "status": "rejected",
            "failed_checks": [
                {"id": c.get("id"), "title": c.get("title"), "reason": c.get("reason")}
                for c in failed
            ],
            "fixes_applied": {
                c.get("id", ""): _fix_hint(c) for c in failed
            },
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    ]
    state["steps"] = list(state.get("steps", [])) + [
        {
            "step": "regenerate",
            "attempt": attempt,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "detail": (
                f"REJECTED attempt {attempt}. Feeding {len(failed)} "
                f"failed {'check' if len(failed) == 1 else 'checks'} "
                f"back into the generator (attempt {attempt + 1} of "
                f"{state.get('max_attempts', 3)})."
            ),
            "failed_ids": [c.get("id") for c in failed],
        }
    ]
    return state


def _fix_hint(check: dict) -> str:
    from ..rubric import FIX_HINTS

    cid = check.get("id", "")
    return FIX_HINTS.get(cid, "Rewrite that part to satisfy the check.")


def finalize_node(state: LessonState) -> LessonState:
    evaluation = state.get("evaluation", {}) or {}
    passed = bool(evaluation.get("overall_pass"))
    attempt = int(state.get("attempt", 1))

    state["status"] = "pass" if passed else "rejected_after_max_attempts"
    if passed:
        state["final_lesson_md"] = state.get("lesson_md", "")
    else:
        best = state.get("best_lesson_md", "") or state.get("lesson_md", "")
        state["final_lesson_md"] = best
    state["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    state["rejection_log"] = list(state.get("rejection_log", [])) + [
        {
            "attempt": attempt,
            "status": "passed" if passed else "rejected",
            "failed_checks": [
                {"id": c.get("id"), "title": c.get("title"), "reason": c.get("reason")}
                for c in (state.get("failed_checks") or [])
            ],
            "fixes_applied": {},
            "at": state["finished_at"],
        }
    ]

    state["steps"] = list(state.get("steps", [])) + [
        {
            "step": "finalize",
            "attempt": attempt,
            "at": state["finished_at"],
            "detail": (
                f"SHIP: lesson passed all 6 checks on attempt {attempt}."
                if passed
                else f"REJECT: still failing after {attempt} attempt(s) — returning best draft "
                f"(attempt {state.get('best_attempt', attempt)} with "
                f"{state.get('best_pass_count', 0)}/6 checks) with the full rejection log "
                "(loop terminated by MAX_ATTEMPTS)."
            ),
            "status": state["status"],
        }
    ]

    try:
        memory.append_run(
            {
                "topic": state["topic"],
                "status": state["status"],
                "attempts_used": attempt,
                "attempts": state.get("rejection_log", []),
                "final_checks": evaluation.get("checks", []),
                "final_lesson_md": state.get("final_lesson_md", ""),
                "best_attempt": state.get("best_attempt", attempt),
                "best_pass_count": state.get("best_pass_count", 0),
                "prompt_patches_active": state.get("prompt_patches", []),
                "self_evolved_this_run": [p.get("rule") for p in state.get("self_evolved_this_run", [])],
                "steps": state.get("steps", []),
            }
        )
        memory.append_rejection_log(
            state["topic"],
            state.get("rejection_log", []),
            state["status"],
        )
    except Exception as exc:
        print(f"[memory] Persist failed (run still returned): {exc!r}", flush=True)

    state["self_evolved_this_run"] = state.get("self_evolved_this_run", [])
    state["evolution_report"] = self_evolve.explain_evolution()  # type: ignore[assignment]
    return state
