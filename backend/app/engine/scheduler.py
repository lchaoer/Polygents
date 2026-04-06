# engine/scheduler.py
"""Simple asyncio-based workflow scheduler"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, Awaitable, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.engine.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


def _cron_matches(cron: str, now: datetime) -> bool:
    """Check if a cron expression matches the current time (minute-level).

    Supports simple cron: "M H * * *" where M=minute, H=hour.
    Also supports "M H * * 1-5" for weekdays, "M H * * 0,6" for weekends, etc.
    """
    parts = cron.strip().split()
    if len(parts) != 5:
        return False

    minute_spec, hour_spec, _, _, dow_spec = parts

    # Check minute
    if minute_spec != "*" and int(minute_spec) != now.minute:
        return False

    # Check hour
    if hour_spec != "*" and int(hour_spec) != now.hour:
        return False

    # Check day of week (0=Mon ... 6=Sun in Python, cron uses 0=Sun or 1=Mon)
    if dow_spec != "*":
        py_dow = now.weekday()  # 0=Mon, 6=Sun
        # Convert to cron-style where 0=Sun, 1=Mon...6=Sat
        cron_dow = (py_dow + 1) % 7
        allowed = set()
        for part in dow_spec.split(","):
            if "-" in part:
                start, end = part.split("-")
                allowed.update(range(int(start), int(end) + 1))
            else:
                allowed.add(int(part))
        if cron_dow not in allowed:
            return False

    return True


class WorkflowScheduler:
    """Simple asyncio-based workflow scheduler.

    Periodically checks all workflows for due schedules and triggers execution.
    Uses a 60-second polling loop aligned to minute boundaries.
    """

    def __init__(
        self,
        workflow_store: "WorkflowStore",
        run_workflow_fn: Callable[[str], Awaitable[None]],
    ):
        self.workflow_store = workflow_store
        self.run_workflow_fn = run_workflow_fn
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._last_triggered: dict[str, str] = {}  # wf_id -> "HH:MM" last triggered

    async def start(self):
        """Start the scheduler loop."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("WorkflowScheduler started")

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("WorkflowScheduler stopped")

    async def _loop(self):
        """Main scheduler loop — checks every 60 seconds."""
        while self._running:
            try:
                await self._check_and_run()
            except Exception:
                logger.exception("Scheduler check failed")
            await asyncio.sleep(60)

    async def _check_and_run(self):
        """Check all workflows for due schedules and trigger execution."""
        now = datetime.now(timezone.utc)
        current_key = f"{now.hour:02d}:{now.minute:02d}"

        workflows = self.workflow_store.list_workflows()
        for wf in workflows:
            if not wf.schedule or not wf.schedule.get("enabled"):
                continue

            cron = wf.schedule.get("cron", "")
            if not cron:
                continue

            # Avoid duplicate triggers within the same minute
            if self._last_triggered.get(wf.id) == current_key:
                continue

            if _cron_matches(cron, now):
                logger.info(f"Scheduler triggering workflow '{wf.name}' (id={wf.id})")
                self._last_triggered[wf.id] = current_key
                try:
                    await self.run_workflow_fn(wf.id)
                except Exception:
                    logger.exception(f"Scheduled run failed for workflow {wf.id}")
