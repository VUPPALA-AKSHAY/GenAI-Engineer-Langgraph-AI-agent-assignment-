"""Backend API for lessons and chat."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app import config, memory, self_evolve
from app.graph import GRAPH, _public_result, run_lesson
from app.state import new_state

app = FastAPI(
    title="Self-Evaluating Lesson Content Generator",
    description=(
        "Agentic generate → evaluate → regenerate loop with a hard pass/fail rubric, "
        "cross-run memory and self-evolving prompts."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        config.FRONTEND_ORIGIN,
        "https://lesson-content-generator.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatTurn(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., max_length=4000)


class GenerateRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=300, description="Lesson topic or chat message")
    max_attempts: int | None = Field(
        default=None, ge=1, le=5, description="Loop bound (default from .env, 3 = 1 + 2 retries)"
    )
    history: list[ChatTurn] = Field(
        default_factory=list,
        description="Previous turns, oldest first (follow-ups + chat context)",
    )


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model": config.MODEL,
        "gateway": config.GATEWAY_URL.split("/v1/")[0],
        "max_attempts": config.MAX_ATTEMPTS,
        "rubric_size": 6,
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


@app.post("/api/generate-lesson")
def generate_lesson(body: GenerateRequest) -> dict[str, Any]:
    return run_lesson(
        body.topic,
        max_attempts=body.max_attempts,
        history=[turn.model_dump() for turn in body.history],
    )


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.post("/api/generate-lesson/stream")
async def generate_lesson_stream(body: GenerateRequest) -> StreamingResponse:
    async def events() -> AsyncIterator[str]:
        attempts = body.max_attempts or config.MAX_ATTEMPTS
        state = new_state(body.topic.strip(), attempts)
        state["history"] = [turn.model_dump() for turn in body.history]
        state["started_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        seen_steps = 0
        emitted_eval_attempt: int | None = None
        last_state: dict = state

        yield _sse(
            {
                "type": "start",
                "topic": state["topic"],
                "max_attempts": attempts,
                "at": state["started_at"],
            }
        )
        try:
            async for values in GRAPH.astream(
                state, stream_mode="values", config={"recursion_limit": 40}
            ):
                if not isinstance(values, dict):
                    continue
                last_state = values

                new_steps = values.get("steps") or []
                for item in new_steps[seen_steps:]:
                    payload = {"type": "step", **item}
                    payload.pop("checks", None)
                    yield _sse(payload)
                seen_steps = len(new_steps)

                evaluation = values.get("evaluation") or {}
                attempt_no = evaluation.get("attempt")
                if evaluation and attempt_no != emitted_eval_attempt:
                    emitted_eval_attempt = attempt_no
                    yield _sse(
                        {
                            "type": "evaluation",
                            "attempt": attempt_no,
                            "overall_pass": evaluation.get("overall_pass"),
                            "checks": evaluation.get("checks", []),
                            "summary": evaluation.get("summary", ""),
                        }
                    )
                await asyncio.sleep(0)

            yield _sse({"type": "done", "result": _public_result(last_state)})
        except Exception as exc:
            print(f"[stream] Run failed: {type(exc).__name__}: {exc}", flush=True)
            yield _sse({"type": "error", "message": "The run failed before finishing."})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/history")
def history(limit: int = 10) -> dict[str, Any]:
    runs = memory.load_runs()
    return {"count": len(runs), "runs": runs[-limit:]}


@app.get("/api/rejection-log")
def rejection_log() -> dict[str, Any]:
    return {"log": memory.read_rejection_log(), "path": str(memory.REJECTION_FILE)}


@app.get("/api/evolution")
def evolution() -> dict[str, Any]:
    return {
        "threshold": self_evolve.THRESHOLD,
        "active_patches": memory.load_patches(),
        "report": self_evolve.explain_evolution(),
    }


@app.get("/api/lesson/latest")
def latest_lesson() -> dict[str, Any]:
    runs = memory.load_runs()
    for run in reversed(runs):
        if run.get("status") == "pass":
            for attempt in reversed(run.get("attempts", [])):
                if attempt.get("status") == "passed":
                    return {"topic": run.get("topic"), "run": run}
    return {"topic": None, "run": None}
