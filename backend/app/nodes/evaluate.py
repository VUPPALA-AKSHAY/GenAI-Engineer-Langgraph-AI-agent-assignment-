"""Checks lessons against the quality rules."""

from __future__ import annotations

from datetime import datetime, timezone

from .. import config, llm, prompts, rubric, self_evolve
from ..state import LessonState

LLM_ONLY_IDS = {"accurate_grounded", "coherent_flow"}


def _judge(state: LessonState) -> dict:
    deterministic_pass: dict[str, str] = {}
    for result in rubric.deterministic_checks(state.get("lesson_md", ""), state.get("topic", "")):
        if result.passed:
            deterministic_pass[result.id] = result.reason

    user = prompts.evaluate_user_prompt(
        state["topic"],
        state.get("lesson_md", ""),
        deterministic_pass=deterministic_pass,
    )
    system = prompts.EVALUATE_SYSTEM.format(
        rubric=rubric.rubric_text(),
        count=len(rubric.RUBRIC_IDS),
    )
    raw = llm.chat(system, user, temperature=0.0, json_mode=True, model=config.JUDGE_MODEL)
    return llm.extract_json(raw)


def evaluate_node(state: LessonState) -> LessonState:
    lesson = state.get("lesson_md", "")
    attempt = int(state.get("attempt", 1))

    det_results = rubric.deterministic_checks(lesson, state.get("topic", ""))
    det_map = {r.id: r for r in det_results}

    judge_error = ""
    try:
        judged = _judge(state)
    except llm.LLMError as exc:
        judged = {"checks": [], "overall_pass": False, "summary": f"Evaluator error: {exc}"}
        judge_error = str(exc)

    llm_checks: dict[str, dict] = {}
    for item in judged.get("checks", []) or []:
        if isinstance(item, dict) and item.get("id"):
            llm_checks[str(item["id"])] = {
                "id": str(item["id"]),
                "pass": bool(item.get("pass", False)),
                "reason": str(item.get("reason", "") or "").strip(),
            }

    merged: list[dict] = []
    for check in rubric.RUBRIC:
        cid = check["id"]
        det = det_map.get(cid)
        llm_row = llm_checks.get(cid)

        if cid in LLM_ONLY_IDS:
            passed = bool(llm_row and llm_row["pass"])
            reason = (llm_row or {}).get("reason") or judge_error or "Evaluator did not return this check."
            layer = "llm"
        else:
            det_passed = bool(det and det.passed)
            llm_passed = bool(llm_row and llm_row["pass"])
            passed = det_passed and (llm_passed if llm_row else True)
            if det:
                reason = det.reason
                layer = det.layer
            else:
                reason = (llm_row or {}).get("reason") or "No evidence returned."
                layer = "llm"
            if det_passed and llm_row and not llm_passed:
                reason = f"{reason} (judge adds: {llm_row.get('reason', '')})"
                layer = "both"

        merged.append(
            {
                "id": cid,
                "title": check["title"],
                "pass": passed,
                "reason": reason or ("Passed" if passed else "Failed"),
                "layer": layer,
            }
        )

    overall = all(row["pass"] for row in merged)

    failed_ids = [row["id"] for row in merged if not row["pass"]]
    new_patches = self_evolve.record_and_evolve(failed_ids) if failed_ids else []
    newly_created = [
        p for p in new_patches if p.get("check_id") in failed_ids
    ]

    state["evaluation"] = {
        "checks": merged,
        "overall_pass": overall,
        "summary": (
            "All 6 checks passed — ready to ship."
            if overall
            else "Rejected: failed " + ", ".join(failed_ids) + "."
        ),
        "judge_error": judge_error,
        "attempt": attempt,
    }
    state["failed_checks"] = [row for row in merged if not row["pass"]]
    state["passed_ids"] = [row["id"] for row in merged if row["pass"]]

    pass_count = len(merged) - len(failed_ids)
    if pass_count > int(state.get("best_pass_count", -1)):
        state["best_pass_count"] = pass_count
        state["best_lesson_md"] = lesson
        state["best_attempt"] = attempt
    state["self_evolved_this_run"] = newly_created
    state["steps"] = list(state.get("steps", [])) + [
        {
            "step": "evaluate",
            "attempt": attempt,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "detail": (
                f"Attempt {attempt}: {len(merged) - len(failed_ids)}/{len(merged)} checks passed"
                + (
                    " — failed: "
                    + ", ".join(
                        next(
                            (row["title"] for row in merged if row["id"] == fid),
                            fid,
                        )
                        for fid in failed_ids
                    )
                    + "."
                    if failed_ids
                    else "."
                )
            ),
            "checks": merged,
            "overall_pass": overall,
        }
    ]
    return state
