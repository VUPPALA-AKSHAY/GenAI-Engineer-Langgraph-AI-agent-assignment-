"""Lesson pipeline: write, check, fix, ship."""

from __future__ import annotations

from typing import Any, Optional

from langgraph.graph import END, START, StateGraph

from . import config
from .nodes.classify import classify_node, respond_chat_node, route_after_classify
from .nodes.evaluate import evaluate_node
from .nodes.generate import generate_node
from .nodes.route import finalize_node, regenerate_node, route_after_evaluate
from .state import LessonState, new_state


def build_graph():
    builder = StateGraph(LessonState)

    builder.add_node("classify", classify_node)
    builder.add_node("respond_chat", respond_chat_node)
    builder.add_node("generate", generate_node)
    builder.add_node("evaluate", evaluate_node)
    builder.add_node("regenerate", regenerate_node)
    builder.add_node("finalize", finalize_node)

    builder.add_edge(START, "classify")
    builder.add_conditional_edges(
        "classify",
        route_after_classify,
        {
            "respond_chat": "respond_chat",
            "generate": "generate",
        },
    )
    builder.add_edge("respond_chat", END)
    builder.add_edge("generate", "evaluate")
    builder.add_conditional_edges(
        "evaluate",
        route_after_evaluate,
        {
            "finalize": "finalize",
            "regenerate": "regenerate",
        },
    )
    builder.add_edge("regenerate", "generate")
    builder.add_edge("finalize", END)

    return builder.compile()


GRAPH = build_graph()


def run_lesson(
    topic: str,
    *,
    max_attempts: Optional[int] = None,
    history: Optional[list[dict]] = None,
) -> dict[str, Any]:
    from datetime import datetime, timezone

    attempts = max_attempts or config.MAX_ATTEMPTS
    initial = new_state(topic.strip(), attempts)
    initial["history"] = history or []
    initial["started_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    final_state = GRAPH.invoke(initial, config={"recursion_limit": 40})
    return _public_result(final_state)


def _public_result(state: dict) -> dict[str, Any]:
    evaluation = state.get("evaluation", {}) or {}
    return {
        "topic": state.get("topic", ""),
        "status": state.get("status", ""),
        "message": state.get("chat_reply", ""),
        "lesson": state.get("final_lesson_md", ""),
        "attempts_used": int(state.get("attempt", 1)),
        "max_attempts": int(state.get("max_attempts", config.MAX_ATTEMPTS)),
        "checks": evaluation.get("checks", []),
        "overall_pass": bool(evaluation.get("overall_pass")),
        "summary": evaluation.get("summary", ""),
        "rejection_log": state.get("rejection_log", []),
        "steps": state.get("steps", []),
        "prompt_patches_active": state.get("prompt_patches", []),
        "self_evolved_this_run": [
            p.get("rule") for p in (state.get("self_evolved_this_run") or [])
        ],
        "evolution_report": state.get("evolution_report", []),
        "started_at": state.get("started_at", ""),
        "finished_at": state.get("finished_at", ""),
    }
