"""Process-wide registry of running WorkerCriticRunner tasks."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

from app.engine import broker
from app.engine.runner import WorkerCriticRunner
from app.engine.workspace_watcher import watch_workspace
from app.settings import RUNS_DIR

logger = logging.getLogger(__name__)

_runners: Dict[str, Tuple[WorkerCriticRunner, asyncio.Task]] = {}
_lock = asyncio.Lock()


async def _publish(run_id: str, event: dict) -> None:
    await broker.publish(run_id, event)


async def _drive(run_id: str, runner: WorkerCriticRunner) -> None:
    workspace = RUNS_DIR / run_id / "workspace"
    watcher = asyncio.create_task(
        watch_workspace(workspace, lambda evt: broker.publish(run_id, evt))
    )
    try:
        await runner.run()
    except Exception:
        logger.exception("runner %s crashed", run_id)
    finally:
        watcher.cancel()
        try:
            await watcher
        except (asyncio.CancelledError, Exception):
            pass
        await broker.close(run_id)
        async with _lock:
            _runners.pop(run_id, None)


async def start_run(run_id: str) -> None:
    async with _lock:
        if run_id in _runners:
            return
        runner = WorkerCriticRunner(
            run_id,
            on_event=lambda evt: _publish(run_id, evt),
        )
        task = asyncio.create_task(_drive(run_id, runner))
        _runners[run_id] = (runner, task)


async def cancel_run(run_id: str) -> bool:
    async with _lock:
        entry = _runners.get(run_id)
    if entry is None:
        return False
    runner, _task = entry
    runner.cancel()
    return True


async def shutdown_all() -> None:
    async with _lock:
        entries = list(_runners.items())
    for _run_id, (runner, _task) in entries:
        runner.cancel()
    for _run_id, (_runner, task) in entries:
        try:
            await asyncio.wait_for(task, timeout=10)
        except (asyncio.TimeoutError, Exception):
            task.cancel()
