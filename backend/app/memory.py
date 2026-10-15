"""Saves past runs so lessons keep getting better."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config

MEMORY_DIR: Path = config.MEMORY_DIR
RUNS_FILE = MEMORY_DIR / "runs.json"
REJECTION_FILE = MEMORY_DIR / "rejection_log.md"
FAIL_COUNTS_FILE = MEMORY_DIR / "fail_counts.json"
PATCHES_FILE = MEMORY_DIR / "prompt_patches.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _atomic_write(path: Path, text: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(text)
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
    except OSError as exc:
        print(f"[memory] Write skipped ({exc.filename}): {exc.strerror}", flush=True)


def _read_json(path: Path, default: Any) -> Any:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        pass
    return default


def load_runs() -> list[dict]:
    data = _read_json(RUNS_FILE, [])
    return data if isinstance(data, list) else []


def append_run(record: dict) -> None:
    runs = load_runs()
    record = dict(record)
    record.setdefault("saved_at", _now())
    runs.append(record)
    _atomic_write(RUNS_FILE, json.dumps(runs, indent=2, ensure_ascii=False))


def load_recent_failures(topic: str, limit: int = 5) -> list[str]:
    out: list[str] = []
    for run in reversed(load_runs()):
        if run.get("topic", "").lower() != topic.lower():
            continue
        for attempt in run.get("attempts", []):
            for check in attempt.get("failed_checks", []) or []:
                if not isinstance(check, dict):
                    continue
                reason = check.get("reason", "")
                if reason:
                    out.append(f"[{run.get('topic')}] {check.get('id')}: {reason}")
            if len(out) >= limit:
                return out[:limit]
    return out[:limit]


def bump_failure_counts(failed_ids: list[str]) -> dict[str, int]:
    counts: dict[str, int] = _read_json(FAIL_COUNTS_FILE, {})
    if not isinstance(counts, dict):
        counts = {}
    for check_id in failed_ids:
        counts[check_id] = int(counts.get(check_id, 0)) + 1
    _atomic_write(FAIL_COUNTS_FILE, json.dumps(counts, indent=2, sort_keys=True))
    return counts


def fail_counts() -> dict[str, int]:
    counts = _read_json(FAIL_COUNTS_FILE, {})
    return counts if isinstance(counts, dict) else {}


def load_patches() -> list[dict]:
    data = _read_json(PATCHES_FILE, [])
    return data if isinstance(data, list) else []


def save_patches(patches: list[dict]) -> None:
    _atomic_write(PATCHES_FILE, json.dumps(patches, indent=2, ensure_ascii=False))


def append_rejection_log(topic: str, attempts: list[dict], status: str) -> None:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    lines.append(f"\n## Run at {_now()} — topic: {topic}")
    lines.append(f"**Final status:** {status}")
    lines.append(f"**Attempts used:** {len(attempts)}\n")

    for attempt in attempts:
        number = attempt.get("attempt", "?")
        ok = attempt.get("status") == "passed"
        lines.append(f"### Attempt {number} — {'PASSED' if ok else 'REJECTED'}")
        failed = attempt.get("failed_checks", []) or []
        if failed:
            lines.append("| Check that failed | Why | Fix instructed for retry |")
            lines.append("|---|---|---|")
            for check in failed:
                fix = attempt.get("fixes_applied", {}).get(check.get("id"), "-")
                lines.append(
                    f"| {check.get('id')} | {check.get('reason', '')} | {fix} |"
                )
        else:
            lines.append("_All 6 checks passed. No change needed._")
        lines.append("")

    existing = ""
    if REJECTION_FILE.exists():
        try:
            existing = REJECTION_FILE.read_text(encoding="utf-8")
        except OSError:
            existing = ""
    if not existing:
        existing = (
            "# Rejection Log\n\n"
            "Every run of the self-evaluating lesson generator, newest section last.\n"
            "Columns: what failed -> why -> what we changed on the retry.\n"
        )
    _atomic_write(REJECTION_FILE, existing + "\n".join(lines))


def read_rejection_log() -> str:
    if REJECTION_FILE.exists():
        try:
            return REJECTION_FILE.read_text(encoding="utf-8")
        except OSError:
            return ""
    return ""


def rebuild_rejection_log() -> str:
    runs = load_runs()
    text = (
        "# Rejection Log\n\n"
        "Every run of the self-evaluating lesson generator, newest section last.\n"
        "Columns: what failed -> why -> what we changed on the retry.\n"
    )
    for run in runs:
        topic = run.get("topic", "")
        status = run.get("status", "")
        attempts = run.get("attempts", []) or []
        lines = [
            "",
            f"## Run — topic: {topic}",
            f"**Final status:** {status}",
            f"**Attempts used:** {run.get('attempts_used', len(attempts))}",
            "",
        ]
        for attempt in attempts:
            number = attempt.get("attempt", "?")
            ok = attempt.get("status") == "passed"
            lines.append(f"### Attempt {number} — {'PASSED' if ok else 'REJECTED'}")
            failed = attempt.get("failed_checks", []) or []
            if failed:
                lines.append("| Check that failed | Why | Fix instructed for retry |")
                lines.append("|---|---|---|")
                for check in failed:
                    fix = (attempt.get("fixes_applied", {}) or {}).get(check.get("id"), "-")
                    lines.append(
                        f"| {check.get('id')} | {check.get('reason', '')} | {fix} |"
                    )
            else:
                lines.append("_All 6 checks passed. No change needed._")
            lines.append("")
        text += "\n".join(lines)
    _atomic_write(REJECTION_FILE, text)
    return text
