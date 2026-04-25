from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional

from app.engine.prompts import (
    CRITIC_SYSTEM_TEMPLATE,
    CRITIC_TOOLS,
    WORKER_SYSTEM_TEMPLATE,
    WORKER_TOOLS,
    critic_round_1_prompt,
    critic_round_n_prompt,
    worker_round_1_prompt,
    worker_round_n_prompt,
)
from app.engine.sdk_client import AgentSession
from app.engine.verdict import VerdictParseError, parse_verdict
from app.settings import RUNS_DIR
from app.storage import run_store as rs
from app.storage import workflow_store as ws

logger = logging.getLogger(__name__)

EventCallback = Callable[[dict], Awaitable[None]]


class WorkerCriticRunner:
    def __init__(
        self,
        run_id: str,
        on_event: Optional[EventCallback] = None,
    ) -> None:
        self.run_id = run_id
        self.on_event = on_event
        self._cancel = asyncio.Event()
        self._worker: Optional[AgentSession] = None
        self._critic: Optional[AgentSession] = None

    def cancel(self) -> None:
        self._cancel.set()

    async def _emit(self, event: dict) -> None:
        if self.on_event is not None:
            try:
                await self.on_event(event)
            except Exception:
                logger.exception("event callback failed")

    async def run(self) -> str:
        snap = rs.get_run(self.run_id)
        if snap is None:
            raise RuntimeError(f"run {self.run_id} not found")
        wf = ws.get_workflow(snap.workflow_id)
        if wf is None:
            raise RuntimeError(f"workflow {snap.workflow_id} not found")

        run_dir = RUNS_DIR / self.run_id
        workspace = run_dir / "workspace"
        reports_dir = run_dir / "reports"
        reviews_dir = run_dir / "reviews"

        rs.update_status(self.run_id, state="running", current_round=0)
        await self._emit({"type": "status_changed", "state": "running"})

        self._worker = AgentSession(
            role="worker",
            model=wf.config.worker_model,
            system_prompt=WORKER_SYSTEM_TEMPLATE.format(user_prompt=wf.worker_md),
            cwd=workspace,
            allowed_tools=WORKER_TOOLS,
        )
        self._critic = AgentSession(
            role="critic",
            model=wf.config.critic_model,
            system_prompt=CRITIC_SYSTEM_TEMPLATE.format(user_prompt=wf.critic_md),
            cwd=workspace,
            allowed_tools=CRITIC_TOOLS,
            disallowed_tools=["Bash", "Edit"],
        )

        final_state = "failed"
        try:
            await self._worker.open()
            await self._critic.open()

            for round_n in range(1, wf.config.max_rounds + 1):
                if self._cancel.is_set():
                    final_state = "cancelled"
                    break

                rs.update_status(self.run_id, current_round=round_n)
                await self._emit(
                    {"type": "round_start", "round": round_n, "role": "worker"}
                )

                if round_n == 1:
                    worker_prompt = worker_round_1_prompt(snap.task)
                else:
                    worker_prompt = worker_round_n_prompt(round_n)
                await self._worker.send(worker_prompt)

                report_path = reports_dir / f"round-{round_n}.md"
                if not report_path.exists():
                    rs.update_status(
                        self.run_id,
                        state="failed",
                        error=f"worker did not write report round-{round_n}.md",
                    )
                    final_state = "failed"
                    break
                await self._emit({"type": "report_written", "round": round_n})

                if self._cancel.is_set():
                    final_state = "cancelled"
                    break

                await self._emit(
                    {"type": "round_start", "round": round_n, "role": "critic"}
                )
                if round_n == 1:
                    critic_prompt = critic_round_1_prompt()
                else:
                    critic_prompt = critic_round_n_prompt(round_n)
                await self._critic.send(critic_prompt)

                review_path = reviews_dir / f"round-{round_n}.md"
                if not review_path.exists():
                    rs.update_status(
                        self.run_id,
                        state="failed",
                        error=f"critic did not write review round-{round_n}.md",
                    )
                    final_state = "failed"
                    break

                review_text = review_path.read_text(encoding="utf-8")
                try:
                    verdict = parse_verdict(review_text)
                except VerdictParseError as exc:
                    rs.update_status(
                        self.run_id,
                        state="failed",
                        error=f"verdict parse failed at round {round_n}: {exc}",
                    )
                    final_state = "failed"
                    break

                await self._emit(
                    {
                        "type": "review_written",
                        "round": round_n,
                        "verdict": verdict,
                    }
                )

                if verdict == "PASS":
                    final_state = "passed"
                    break
            else:
                final_state = "failed"

        except Exception as exc:
            logger.exception("runner crashed")
            rs.update_status(self.run_id, state="failed", error=str(exc))
            final_state = "failed"
        finally:
            if self._worker is not None:
                await self._worker.close()
            if self._critic is not None:
                await self._critic.close()

        if rs.get_run(self.run_id).status.state == "running":
            rs.update_status(self.run_id, state=final_state)
        await self._emit({"type": "status_changed", "state": final_state})
        return final_state
