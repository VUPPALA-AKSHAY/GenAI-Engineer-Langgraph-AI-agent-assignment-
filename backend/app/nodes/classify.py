"""Decides lesson request or casual chat."""

from __future__ import annotations

from datetime import datetime, timezone

from .. import llm, prompts
from ..state import LessonState


def classify_node(state: LessonState) -> LessonState:
    message = state.get("topic", "")
    history = state.get("history", []) or []
    intent = "teach"
    clean_topic = message.strip()
    reply = ""

    try:
        raw = llm.chat(
            prompts.CLASSIFY_SYSTEM,
            prompts.classify_user_prompt(message, history),
            temperature=0.0,
            max_tokens=512,
        )
        parsed = llm.extract_json(raw)
        if isinstance(parsed, dict):
            if parsed.get("intent") in ("teach", "chat"):
                intent = str(parsed["intent"])
            if intent == "teach" and str(parsed.get("topic", "")).strip():
                clean_topic = str(parsed["topic"]).strip()
            if intent == "chat":
                reply = str(parsed.get("reply", "") or "").strip()
    except llm.LLMError as exc:
        intent = "teach"
        reply = f"Classifier error, defaulting to lesson: {exc}"

    if intent == "chat" and not reply:
        reply = (
            "Hi there! Tell me what you'd like to learn — for example, "
            "'Introduction to RAG'."
        )

    state["intent"] = intent
    state["topic"] = clean_topic
    state["chat_reply"] = reply
    state["token_estimate"] = int(state.get("token_estimate", 0)) + 1
    state["steps"] = list(state.get("steps", [])) + [
        {
            "step": "classify",
            "attempt": 1,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "detail": (
                f"Understood: casual chat — replying directly, no lesson loop."
                if intent == "chat"
                else f"Understood: lesson request — topic is '{clean_topic}'."
            ),
            "intent": intent,
        }
    ]
    return state


def route_after_classify(state: LessonState) -> str:
    return "respond_chat" if state.get("intent") == "chat" else "generate"


def respond_chat_node(state: LessonState) -> LessonState:
    message = state.get("topic", "")
    history = state.get("history", []) or []
    reply = state.get("chat_reply", "") or ""
    try:
        reply = llm.chat(
            prompts.CHAT_SYSTEM,
            prompts.chat_user_prompt(message, history),
            temperature=0.7,
            max_tokens=1024,
        )
    except llm.LLMError:
        if not reply:
            reply = (
                "Hi there! Tell me what you'd like to learn — for example, "
                "'Introduction to RAG'."
            )
    state["chat_reply"] = reply
    state["status"] = "chat"
    state["final_lesson_md"] = ""
    state["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    state["steps"] = list(state.get("steps", [])) + [
        {
            "step": "finalize",
            "attempt": 1,
            "at": state["finished_at"],
            "detail": "Replied conversationally — no lesson was requested.",
            "status": "chat",
        }
    ]
    return state
