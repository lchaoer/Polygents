"""Stage 2 end-to-end smoke test for WorkerCriticRunner.

Run from backend/:
    POLYGENTS_ROOT=/tmp/polygents-smoke python scripts/run_smoke.py

Drives two scenarios against the real Claude Agent SDK:
  1. Easy task that should PASS in 1 round
  2. Impossible checklist that should FAIL after max_rounds

Prints round-by-round events and the final state.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import tempfile
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=ResourceWarning)


def _setup_root() -> Path:
    root = Path(os.environ.get("POLYGENTS_ROOT") or tempfile.mkdtemp(prefix="polygents-smoke-"))
    os.environ["POLYGENTS_ROOT"] = str(root)
    (root / "workflows").mkdir(parents=True, exist_ok=True)
    (root / "runs").mkdir(parents=True, exist_ok=True)
    return root


async def _print_event(event: dict) -> None:
    print(f"  [event] {event}")


async def run_scenario(name: str, workflow_payload, task: str) -> str:
    from app.engine.runner import WorkerCriticRunner
    from app.storage import run_store as rs
    from app.storage import workflow_store as ws

    print(f"\n=== {name} ===")
    wf = ws.create_workflow(workflow_payload)
    snap = rs.create_run(wf.id, task)
    assert snap is not None
    print(f"  workflow_id={wf.id}  run_id={snap.id}")

    runner = WorkerCriticRunner(snap.id, on_event=_print_event)
    state = await runner.run()
    print(f"  final state: {state}")

    final = rs.get_run(snap.id)
    print(f"  rounds executed: {final.status.current_round}")
    print(f"  reports: {final.reports}")
    print(f"  reviews: {final.reviews}")
    if final.status.error:
        print(f"  error: {final.status.error}")
    return state


def main() -> int:
    root = _setup_root()
    print(f"POLYGENTS_ROOT={root}")

    from app.storage.workflow_store import WorkflowConfig, WorkflowPayload

    pass_payload = WorkflowPayload(
        config=WorkflowConfig(
            name="Smoke Pass",
            max_rounds=2,
            worker_model="claude-sonnet-4-5-20250929",
            critic_model="claude-sonnet-4-5-20250929",
        ),
        worker_md="You are a careful writer who follows instructions exactly.",
        critic_md="You are a strict reviewer who enforces the checklist literally.",
        checklist_md=(
            "- C1: A file named hello.md exists in the workspace.\n"
            "- C2: hello.md contains the literal word 'hello' (case-insensitive)."
        ),
    )

    fail_payload = WorkflowPayload(
        config=WorkflowConfig(
            name="Smoke Fail",
            max_rounds=2,
            worker_model="claude-sonnet-4-5-20250929",
            critic_model="claude-sonnet-4-5-20250929",
        ),
        worker_md="You are a careful writer who follows instructions exactly.",
        critic_md=(
            "You are an extremely strict reviewer. Enforce every checklist item literally. "
            "Mark FAIL if ANY item is not 100% satisfied. Do not give partial credit."
        ),
        checklist_md=(
            "- C1: A file named contradiction.md exists in the workspace.\n"
            "- C2: contradiction.md contains exactly the text 'YES' on line 1.\n"
            "- C3: contradiction.md contains exactly the text 'NO' on line 1.\n"
            "  (C2 and C3 cannot both be satisfied. Mark FAIL.)"
        ),
    )

    pass_state = asyncio.run(_drive(pass_payload, "PASS scenario", "Create a file called hello.md in your cwd with the content 'hello world'."))
    fail_state = asyncio.run(_drive(fail_payload, "FAIL scenario", "Create contradiction.md whose line 1 satisfies the checklist."))

    print("\n=== summary ===")
    print(f"  PASS scenario final: {pass_state}  (expected: passed)")
    print(f"  FAIL scenario final: {fail_state}  (expected: failed)")

    ok = pass_state == "passed" and fail_state == "failed"
    if not ok:
        print("SMOKE FAILED — see events above")
        return 1
    print("SMOKE OK")
    return 0


async def _drive(payload, name: str, task_text: str) -> str:
    return await run_scenario(name, payload, task_text)


if __name__ == "__main__":
    sys.exit(main())
