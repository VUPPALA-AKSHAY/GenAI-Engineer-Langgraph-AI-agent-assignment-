"""Six pass-fail quality checks for lessons."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

RUBRIC: list[dict] = [
    {
        "id": "accurate_grounded",
        "title": "Accurate & grounded",
        "question": (
            "Is every fact about the GIVEN topic correct — not facts about some "
            "other topic substituted in its place? No invented facts, no confused "
            "ordering. For RAG specifically: retrieval happens BEFORE generation, "
            "the retrieved text is put into the prompt, and the model answers "
            "using it."
        ),
        "fail_if": "Any technically wrong statement, facts about the wrong topic, or a claim not supported by how the system actually works.",
    },
    {
        "id": "covers_key_points",
        "title": "Covers the key points",
        "question": (
            "Does the lesson cover ALL of: (a) what the TOPIC is in one plain sentence, "
            "(b) why it matters / where the alternative fails, (c) how it works step by "
            "step with numbered steps, (d) one real worked example? For RAG specifically "
            "the steps must be chunk -> embed -> retrieve -> build prompt -> generate."
        ),
        "fail_if": "Any one of the four parts is missing.",
    },
    {
        "id": "beginner_language",
        "title": "Beginner-friendly language",
        "question": (
            "Can a 12th-grade graduate from India with limited English and no tech background "
            "read this without help? Short sentences, everyday words, no dense paragraphs."
        ),
        "fail_if": "Long or complex sentences, formal/academic tone, or ideas that assume prior knowledge.",
    },
    {
        "id": "no_unexplained_jargon",
        "title": "No unexplained jargon",
        "question": (
            "Every technical word (embedding, vector, chunk, database, index, prompt, token, "
            "similarity search) is explained in plain words at the moment it first appears."
        ),
        "fail_if": "Any technical word is used before its plain-English meaning is given.",
    },
    {
        "id": "teaches_by_example",
        "title": "Teaches by example",
        "question": (
            "Does it use at least one everyday analogy (library, exam notes, answer key, finding "
            "a page in a book) AND at least one step-by-step worked example the reader can follow?"
        ),
        "fail_if": "Only abstract definition with no analogy, or no step-by-step example.",
    },
    {
        "id": "coherent_flow",
        "title": "Coherent teaching flow",
        "question": (
            "Is the order clear: What is it? -> Why does it matter? -> How does it work? -> "
            "Example -> Quick check / summary? No jumping back and forth."
        ),
        "fail_if": "Sections jump around, repeat each other, or the reader cannot tell what comes next.",
    },
]

RUBRIC_IDS: list[str] = [check["id"] for check in RUBRIC]

FIX_HINTS: dict[str, str] = {
    "accurate_grounded": "Fix any facts about the wrong topic and restate the correct step order (for RAG: retrieve-then-generate).",
    "covers_key_points": "Add the missing required section(s) and the numbered how-it-works steps.",
    "beginner_language": "Split long sentences into short ones and replace formal words.",
    "no_unexplained_jargon": "Add a plain-English meaning next to each technical word at first use.",
    "teaches_by_example": "Add an everyday analogy plus a numbered step-by-step walkthrough.",
    "coherent_flow": "Reorder sections to What -> Why -> How -> Example -> Quick check.",
}

REQUIRED_SECTIONS: dict[str, list[str]] = {
    "what": ["what is it", "what is rag", "what is retrieval", "introduction", "what is "],
    "why": ["why does it matter", "why it matters", "why", "problem", "limitation"],
    "how": ["how does it work", "how it works", "how rag works", "steps"],
    "example": ["a simple example", "simple example", "example", "in practice", "walkthrough"],
}

TOPIC_STOPWORDS = {
    "introduction", "to", "what", "is", "an", "the", "a", "about", "say",
    "how", "does", "do", "and", "or", "of", "for", "in", "on", "my",
    "tell", "me", "give", "write", "lesson", "explain", "learn", "know",
}


def topic_keywords(topic: str) -> list[str]:
    words = re.findall(r"[a-z]{3,}", topic.lower())
    return [w for w in words if w not in TOPIC_STOPWORDS]


def topic_mentioned(lesson: str, topic: str) -> tuple[bool, str]:
    keywords = topic_keywords(topic)
    if not keywords:
        return True, ""
    plain = _strip_markdown(lesson)
    lesson_words = set(re.findall(r"[a-z]{4,}", plain))
    for keyword in keywords:
        if keyword in plain:
            continue
        close = any(
            SequenceMatcher(None, keyword, word).ratio() >= 0.85
            for word in lesson_words
        )
        if not close:
            return False, keyword
    return True, ""


JARGON_TERMS = [
    "embedding",
    "vector",
    "chunk",
    "index",
    "prompt",
    "token",
    "similarity search",
    "llm",
    "large language model",
]

PLAIN_MEANING_HINTS = [
    "means",
    "is a",
    "is like",
    "is a way",
    "in simple words",
    "in other words",
    "simply put",
    "think of",
    "number",
    "text turned",
    "convert",
    "converted",
    "broken into",
    "small piece",
    "short piece",
    "summary of",
    "instruction",
    "question you",
]


@dataclass
class CheckResult:
    id: str
    title: str
    passed: bool
    reason: str
    layer: str = field(default="llm")  # "deterministic" or "llm"


def _strip_markdown(text: str) -> str:
    return re.sub(r"[#*_`>|-]", " ", text).lower()


def _non_latin_ratio(text: str) -> float:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return 0.0
    non_latin = [ch for ch in letters if not ("a" <= ch.lower() <= "z")]
    return len(non_latin) / len(letters)


def deterministic_checks(lesson: str, topic: str = "") -> list[CheckResult]:
    results: list[CheckResult] = []
    plain = _strip_markdown(lesson)
    words = len(lesson.split())
    non_english = _non_latin_ratio(lesson) > 0.3

    on_topic, missing_word = topic_mentioned(lesson, topic) if topic and not non_english else (True, "")
    if not on_topic:
        results.append(
            CheckResult(
                "covers_key_points",
                "Covers the key points",
                False,
                f"Lesson is not about the requested topic — the word '{missing_word}' "
                f"never appears. Teach the given topic, not something else.",
                "deterministic",
            )
        )
        return results

    found: dict[str, bool] = {}
    for key, headings in REQUIRED_SECTIONS.items():
        found[key] = any(h in plain for h in headings)
    if non_english:
        found = {k: True for k in found}

    analogy_words = ["like a", "like ", "library", "exam", "answer key", "book", "notes", "dictionary", "search a book"]
    has_analogy = any(w in plain for w in analogy_words)
    has_steps = bool(
        re.search(r"\b(?:step\s*\d+|\d+\s*[.)])\s+\S", lesson, re.IGNORECASE)
        or re.search(r"\b(first,|then,|next,|finally,)\b", plain)
    )
    if non_english:
        has_analogy = True
        has_steps = has_steps or True
    example_ok = has_analogy and has_steps

    jargon_failures: list[str] = []
    for term in JARGON_TERMS:
        match = re.search(re.escape(term), plain)
        if not match:
            continue
        window = plain[match.start() : match.start() + 320]
        if not any(hint in window for hint in PLAIN_MEANING_HINTS):
            jargon_failures.append(term)

    sentences = [s for s in re.split(r"[.!?\n]+", lesson) if s.strip()]
    avg_sentence = (sum(len(s.split()) for s in sentences) / len(sentences)) if sentences else 0
    long_word_hits = sorted(set(re.findall(r"\b[a-z]{15,}\b", plain)))

    if words < 250:
        results.append(
            CheckResult(
                "covers_key_points",
                "Covers the key points",
                False,
                f"Lesson is only {words} words — too short to cover what/why/how/example (minimum 250).",
                "deterministic",
            )
        )
    elif not all(found.values()):
        missing = [k for k, v in found.items() if not v]
        results.append(
            CheckResult(
                "covers_key_points",
                "Covers the key points",
                False,
                f"Missing required section(s): {', '.join(missing)}. Need What / Why / How / Example.",
                "deterministic",
            )
        )
    else:
        results.append(
            CheckResult(
                "covers_key_points",
                "Covers the key points",
                True,
                "All four required parts present: What, Why, How (steps), Example.",
                "deterministic",
            )
        )

    if not example_ok:
        missing_bits = []
        if not has_analogy:
            missing_bits.append("everyday analogy")
        if not has_steps:
            missing_bits.append("step-by-step example")
        results.append(
            CheckResult(
                "teaches_by_example",
                "Teaches by example",
                False,
                f"Missing: {' and '.join(missing_bits)}.",
                "deterministic",
            )
        )
    else:
        results.append(
            CheckResult(
                "teaches_by_example",
                "Teaches by example",
                True,
                "Has an everyday analogy and a numbered step-by-step walkthrough.",
                "deterministic",
            )
        )

    if jargon_failures:
        results.append(
            CheckResult(
                "no_unexplained_jargon",
                "No unexplained jargon",
                False,
                "Used without a plain-English explanation: " + ", ".join(jargon_failures) + ".",
                "deterministic",
            )
        )
    else:
        results.append(
            CheckResult(
                "no_unexplained_jargon",
                "No unexplained jargon",
                True,
                "Every technical word is explained in plain words where it first appears.",
                "deterministic",
            )
        )

    if avg_sentence > 26 or len(long_word_hits) >= 3:
        detail = []
        if avg_sentence > 26:
            detail.append(f"average sentence is {avg_sentence:.0f} words (max 26)")
        if len(long_word_hits) >= 3:
            detail.append("hard words: " + ", ".join(long_word_hits[:5]))
        results.append(
            CheckResult(
                "beginner_language",
                "Beginner-friendly language",
                False,
                "Sentences too long — " + "; ".join(detail) + ".",
                "deterministic",
            )
        )
    else:
        results.append(
            CheckResult(
                "beginner_language",
                "Beginner-friendly language",
                True,
                f"Short sentences (average {avg_sentence:.0f} words), no unusually hard words.",
                "deterministic",
            )
        )

    return results


def rubric_text() -> str:
    lines = []
    for index, check in enumerate(RUBRIC, 1):
        lines.append(
            f'{index}. id="{check["id"]}" | {check["title"]}\n'
            f'   PASS only if: {check["question"]}\n'
            f"   FAIL if: {check['fail_if']}"
        )
    return "\n".join(lines)
