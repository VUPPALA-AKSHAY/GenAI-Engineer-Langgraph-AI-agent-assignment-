"""Backend settings and AI model names."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

GATEWAY_URL = os.getenv("AI_GATEWAY_URL", "https://ai-gateway.vercel.sh/v1/chat/completions")
GATEWAY_KEY = os.getenv("AI_GATEWAY_KEY", "")
MODEL = os.getenv("AI_MODEL", "deepseek/deepseek-v4-pro")

FAST_MODEL = os.getenv("AI_FAST_MODEL", "deepseek/deepseek-v4-flash")
JUDGE_MODEL = os.getenv("AI_JUDGE_MODEL", FAST_MODEL)

MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "3"))
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT_SECONDS", "180"))

MEMORY_DIR = Path(os.getenv("MEMORY_DIR", "/tmp/memory" if os.path.isdir("/tmp") else str(BACKEND_DIR / "memory")))

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
