"""Prints the exact prompts the pipeline would send right now."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import memory, prompts, self_evolve

topic = sys.argv[1] if len(sys.argv) > 1 else "Introduction to RAG"
attempt = int(sys.argv[2]) if len(sys.argv) > 2 else 1

past = memory.load_recent_failures(topic, limit=5)
patches = self_evolve.get_active_patches()

print("=" * 70)
print("GENERATE — SYSTEM MESSAGE")
print("=" * 70)
print(prompts.GENERATE_SYSTEM)
print()
print("=" * 70)
print(f"GENERATE — USER MESSAGE (attempt {attempt})")
print("=" * 70)
print(
    prompts.generate_user_prompt(
        topic,
        past_failures=past,
        prompt_patches=patches,
        retry_feedback=[],
        passed_ids=[],
        previous_lesson=None,
        attempt=attempt,
    )
)
print()
print("=" * 70)
print("MEMORY STATE")
print("=" * 70)
print("past failures fed in:", len(past))
for f in past:
    print("  -", f[:120])
print("active patches fed in:", len(patches))
for p in patches:
    print("  -", p[:120])
print("fail counts:", memory.fail_counts())
