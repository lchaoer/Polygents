# engine/single_runner.py
"""Single Agent runner — bypasses Orchestrator's planner/reviewer loop"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional, Callable

from app.models.schemas import AgentConfig
from app.engine.agent_manager import AgentManager
from app.engine.file_comm import FileComm
from app.engine.run_store import RunStore
from app.engine.workflow_store import WorkflowConfig


class SingleRunner:
    """Direct single Agent execution"""

    def __init__(
        self,
        agent_manager: AgentManager,
        file_comm: FileComm,
        run_store: Optional[RunStore] = None,
        on_status: Optional[Callable] = None,
    ):
        self.agent_manager = agent_manager
        self.file_comm = file_comm
        self.run_store = run_store
        self.on_status: Optional[Callable] = on_status
        self._current_run_id: Optional[str] = None

    async def run(self, workflow: WorkflowConfig, run_id: Optional[str] = None) -> str:
        """Execute single Agent workflow"""
        run_id = run_id or str(uuid.uuid4())[:8]
        self._current_run_id = run_id

        agent_cfg = workflow.agent_config or {}
        agent_id = agent_cfg.get("id", f"single-{workflow.id}")

        # Create run record
        if self.run_store:
            self.run_store.create_run(
                run_id, workflow.default_prompt,
                template_id=None, goal=workflow.default_goal or None,
            )

        # Notify run started
        if self.on_status:
            await self.on_status("running", f"Single Agent workflow '{workflow.name}' started")

        # Create or get Agent instance
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            config = AgentConfig(
                id=agent_id,
                role=agent_cfg.get("role", workflow.name),
                system_prompt=agent_cfg.get("system_prompt", "You are a general-purpose assistant."),
                tools=agent_cfg.get("tools", ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
                model=agent_cfg.get("model"),
            )
            agent = self.agent_manager.create_agent(config)

        # Build prompt
        prompt = workflow.default_prompt
        if workflow.default_goal:
            prompt += f"\n\nGoal: {workflow.default_goal}"

        # Memory injection
        if getattr(workflow, "enable_memory", False):
            memory_content = self.file_comm.read_memory(agent_id)
            if memory_content:
                prompt += f"\n\n## Previous Context\n{memory_content}"
            memory_file = self.file_comm.memory_path(agent_id)
            prompt += (
                f"\n\n## Memory Instruction\n"
                f"After completing your task, write a brief summary (max 200 words) of what you did "
                f"and key outcomes to: {memory_file}\n"
                f"This summary will be available to you in future runs as context."
            )

        try:
            result = await agent.execute(prompt)

            # Completed
            if self.on_status:
                await self.on_status("completed", f"Workflow '{workflow.name}' completed")
            if self.run_store:
                self.run_store.complete_run(run_id, "completed", result[:500])

            return result

        except Exception as e:
            error_msg = str(e)
            if self.on_status:
                await self.on_status("failed", f"Workflow '{workflow.name}' failed: {error_msg}")
            if self.run_store:
                self.run_store.complete_run(run_id, "failed", error_msg)
            return f"[ERROR] {error_msg}"
        finally:
            self._current_run_id = None
