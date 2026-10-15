"""Learns stricter prompt rules from repeated failures."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import memory
from .rubric import RUBRIC

THRESHOLD = 3

SHARPENED_RULES: dict[str, str] = {
    "accurate_grounded": (
        "EXTRA RULE (learned): state the correct order of steps explicitly for "
        "the given topic — for RAG that order is 'retrieve first, then generate' — "
        "and never describe the model as 'knowing' retrieved text; it only sees "
        "the text placed in the prompt."
    ),
    "covers_key_points": (
        "EXTRA RULE (learned): before finishing, verify all four parts exist — "
        "What / Why / How with numbered steps / Example. If one is missing, write it."
    ),
    "beginner_language": (
        "EXTRA RULE (learned): keep every sentence under 20 words. If a sentence "
        "has 'and' more than once, split it into two sentences."
    ),
    "no_unexplained_jargon": (
        "EXTRA RULE (learned): the first time a technical word appears, it MUST sit "
        "inside a sentence that also gives its plain meaning (use 'means', 'is like', "
        "'in simple words'). Never leave a technical word naked."
    ),
    "teaches_by_example": (
        "EXTRA RULE (learned): include one everyday analogy (library / exam answer key / "
        "searching a book) AND one numbered walkthrough the reader can follow line by line."
    ),
    "coherent_flow": (
        "EXTRA RULE (learned): follow the exact order What -> Why -> How -> Example -> "
        "Quick check. Do not mention a later section before an earlier one is finished."
    ),
}


def _check_title(check_id: str) -> str:
    for check in RUBRIC:
        if check["id"] == check_id:
            return check["title"]
    return check_id


def record_and_evolve(failed_ids: list[str]) -> list[dict]:
    if failed_ids:
        counts = memory.bump_failure_counts(failed_ids)
    else:
        counts = memory.fail_counts()

    patches = memory.load_patches()
    active_ids = {p.get("check_id") for p in patches}
    changed = False

    for check_id, count in sorted(counts.items()):
        if int(count) < THRESHOLD:
            continue
        if check_id in active_ids:
            continue
        rule = SHARPENED_RULES.get(check_id)
        if not rule:
            continue
        patches.append(
            {
                "check_id": check_id,
                "title": _check_title(check_id),
                "rule": rule,
                "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "reason": f"check failed {int(count)} times across runs (threshold={THRESHOLD})",
                "failure_count": int(count),
            }
        )
        active_ids.add(check_id)
        changed = True

    if changed:
        memory.save_patches(patches)
    return memory.load_patches()


def get_active_patches() -> list[str]:
    return [p["rule"] for p in memory.load_patches() if p.get("rule")]


def explain_evolution() -> list[dict]:
    counts = memory.fail_counts()
    patches: list[dict[str, Any]] = memory.load_patches()
    active = {p.get("check_id") for p in patches}
    rows: list[dict[str, Any]] = []
    for check in RUBRIC:
        cid = check["id"]
        rows.append(
            {
                "check_id": cid,
                "title": check["title"],
                "total_failures": int(counts.get(cid, 0)),
                "threshold": THRESHOLD,
                "evolved": cid in active,
                "patch": next(
                    (p["rule"] for p in patches if p.get("check_id") == cid), None
                ),
            }
        )
    return rows
