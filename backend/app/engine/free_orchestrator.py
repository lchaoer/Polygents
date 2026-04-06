# engine/free_orchestrator.py
"""Free collaboration orchestrator — Agents autonomously choose communication targets via inbox

Unlike the standard Orchestrator (Manager assigns tasks → Executor → Reviewer loop),
FreeOrchestrator lets all Agents share the same context and decide how to communicate and collaborate.
The Orchestrator only monitors progress without enforcing task assignment.
"""
import asyncio
from typing import Optional, Callable, TYPE_CHECKING
from app.engine.agent_manager import AgentManager
from app.engine.file_comm import FileComm

if TYPE_CHECKING:
    from app.engine.run_store import RunStore

# Max collaboration rounds
MAX_ROUNDS = 10


class FreeOrchestrator:
    """Free collaboration orchestrator"""

    def __init__(
        self,
        agent_manager: AgentManager,
        file_comm: FileComm,
        max_rounds: int = MAX_ROUNDS,
        on_status: Optional[Callable] = None,
        run_store: Optional["RunStore"] = None,
    ):
        self.agent_manager = agent_manager
        self.file_comm = file_comm
        self.max_rounds = max_rounds
        self.on_status = on_status
        self.on_task_update: Optional[Callable] = None
        self.run_store = run_store
        self._current_run_id: Optional[str] = None

    async def run(self, user_prompt: str, goal: str | None = None, run_id: str | None = None, enable_memory: bool = False):
        """Free collaboration run: all Agents take turns, communicating via shared/ and inbox"""
        self._current_run_id = run_id
        self._enable_memory = enable_memory
        try:
            await self._run_inner(user_prompt, goal)
        except asyncio.CancelledError:
            await self._notify("cancelled", detail="Run cancelled by user")

    async def _run_inner(self, user_prompt: str, goal: str | None = None):
        agents = list(self.agent_manager.agents.values())
        if not agents:
            await self._notify("failed", detail="No available Agents")
            return

        await self._notify("running", detail=f"Free collaboration mode started, {len(agents)} Agents participating")

        # Initialize: write user requirements to shared/goal.md
        goal_text = goal or user_prompt
        self.file_comm.write_shared("goal.md", f"# Project Goal\n\n{goal_text}\n\n# User Requirements\n\n{user_prompt}")

        agent_ids = [a.config.id for a in agents]

        for round_num in range(1, self.max_rounds + 1):
            await self._notify("running", detail=f"Collaboration round {round_num}/{self.max_rounds}")

            all_done = True
            for agent in agents:
                # Check if Agent inbox has new messages, or if it's the first round
                inbox = self.file_comm.read_inbox(agent.config.id)
                has_new = round_num == 1 or len(inbox) > 0

                if not has_new and round_num > 1:
                    continue

                all_done = False

                # Build Agent context
                other_agents = [aid for aid in agent_ids if aid != agent.config.id]
                inbox_summary = ""
                if inbox:
                    inbox_summary = "\n\n## Your Inbox\n\n"
                    for msg in inbox[-5:]:  # Last 5 messages
                        inbox_summary += f"- From {msg['meta'].get('from', '?')}: {msg['body'][:200]}\n"

                prompt = (
                    f"## Current Project Goal\n\n{goal_text}\n\n"
                    f"## User Requirements\n\n{user_prompt}\n\n"
                    f"## Collaboration Info\n\n"
                    f"This is round {round_num} of collaboration. Team members: {', '.join(agent_ids)}\n"
                    f"You are {agent.config.id}. You can write files to artifacts/{agent.config.id}/ directory.\n"
                    f"To communicate with other Agents, write messages to inbox/<agent-id>/ directory (any .md filename)."
                    f"{inbox_summary}\n\n"
                    f"Decide your next action based on current progress. If you believe the goal is achieved, include 'GOAL_COMPLETE' in your response."
                )

                # Memory injection
                if getattr(self, "_enable_memory", False):
                    memory_content = self.file_comm.read_memory(agent.config.id)
                    if memory_content:
                        prompt += f"\n\n## Previous Context\n{memory_content}"
                    memory_file = self.file_comm.memory_path(agent.config.id)
                    prompt += (
                        f"\n\n## Memory Instruction\n"
                        f"After completing your task, write a brief summary (max 200 words) to: {memory_file}"
                    )

                result = await agent.execute(prompt)

                # Check if Agent believes goal is complete
                if "GOAL_COMPLETE" in result.upper():
                    await self._notify("running", detail=f"{agent.config.id} believes the goal is complete")

            if all_done:
                await self._notify("completed", detail="All Agents have no new actions, collaboration ended")
                return

        await self._notify("completed", detail=f"Reached max collaboration rounds ({self.max_rounds}), run ended")

    async def _notify(self, status: str, detail: str = ""):
        if self.on_status:
            await self.on_status(status, detail)
        if self.run_store and self._current_run_id and status in ("completed", "failed", "cancelled"):
            self.run_store.complete_run(self._current_run_id, status, detail)
