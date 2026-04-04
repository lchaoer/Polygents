# engine/orchestrator.py
"""Orchestration engine — coordinates Manager/Dev/Evaluator loop"""
import asyncio
import re
from typing import Optional, Callable, TYPE_CHECKING
from app.models.schemas import TaskItem, TaskStatus, TeamConfig
from app.engine.agent_manager import AgentManager
from app.engine.file_comm import FileComm

if TYPE_CHECKING:
    from app.engine.run_store import RunStore


def parse_sprint_markdown(sprint_md: str) -> list[TaskItem]:
    """Parse task list from Sprint markdown, supports depends_on and assignee parsing

    Format example:
      1. [ ] Implement user login @dev-agent (depends_on: task-001, task-002)
      2. [ ] Write unit tests (assignee: test-agent)
      3. [ ] Simple task
    """
    tasks = []
    pattern = r'^\d+\.\s*\[[ x]\]\s*(.+)$'
    for i, match in enumerate(re.finditer(pattern, sprint_md, re.MULTILINE)):
        raw = match.group(1).strip()
        task_id = f"task-{i+1:03d}"
        # Extract depends_on
        depends_on: list[str] = []
        dep_match = re.search(r'\(depends_on:\s*([^)]+)\)', raw)
        if dep_match:
            depends_on = [d.strip() for d in dep_match.group(1).split(",") if d.strip()]
            raw = re.sub(r'\s*\(depends_on:[^)]+\)', '', raw).strip()
        # Extract assignee: (assignee: xxx) or @xxx
        assignee = "executor"  # Default: find executor by role_type
        assign_match = re.search(r'\(assignee:\s*([^)]+)\)', raw)
        if assign_match:
            assignee = assign_match.group(1).strip()
            raw = re.sub(r'\s*\(assignee:[^)]+\)', '', raw).strip()
        else:
            at_match = re.search(r'@(\S+)', raw)
            if at_match:
                assignee = at_match.group(1).strip()
                raw = re.sub(r'\s*@\S+', '', raw).strip()
        tasks.append(TaskItem(
            id=task_id,
            description=raw,
            assignee=assignee,
            depends_on=depends_on,
        ))
    return tasks


def extract_goal(sprint_md: str) -> str:
    """Extract goal from the '## 目标' section of Sprint markdown"""
    match = re.search(
        r'##\s*目标\s*\n(.*?)(?=\n##|\Z)',
        sprint_md,
        re.DOTALL,
    )
    if match:
        return match.group(1).strip()
    return ""


class Orchestrator:
    """Orchestration engine: receives task list, assigns execution, manages feedback loop"""

    def __init__(
        self,
        agent_manager: AgentManager,
        file_comm: FileComm,
        max_retries: int = 3,
        on_status: Optional[Callable] = None,
        run_store: Optional["RunStore"] = None,
    ):
        self.agent_manager = agent_manager
        self.file_comm = file_comm
        self.max_retries = max_retries
        self.on_status = on_status
        self.on_task_update: Optional[Callable] = None
        self.run_store = run_store
        self._goal_decision: Optional[asyncio.Future] = None
        self._current_run_id: Optional[str] = None
        self._paused = asyncio.Event()
        self._paused.set()  # Initially not paused (set=running)
        self._intervention: Optional[asyncio.Future] = None
        self.execution_mode: str = "sequential"  # "sequential" | "parallel"

    async def pause(self):
        """Pause orchestration (takes effect after current task completes)"""
        self._paused.clear()
        await self._notify("paused", detail="Run paused, awaiting action...")

    async def resume(self):
        """Resume orchestration"""
        # Cancel pending intervention request if any
        if self._intervention and not self._intervention.done():
            self._intervention.set_result(None)
            self._intervention = None
        self._paused.set()
        await self._notify("running", detail="Run resumed")

    async def intervene(self, action: str, payload: dict):
        """Execute intervention: modify_task / skip_task / inject_message / modify_agent"""
        if action == "modify_task" and self._intervention and not self._intervention.done():
            self._intervention.set_result({"action": "modify_task", "description": payload.get("description", "")})
        elif action == "skip_task" and self._intervention and not self._intervention.done():
            self._intervention.set_result({"action": "skip_task"})
        elif action == "inject_message":
            # Inject message to Agent inbox
            self.file_comm.send_message(
                from_agent="user",
                to_agent=payload.get("agent_id", "dev"),
                msg_type="intervention",
                content=payload.get("content", ""),
            )
            await self._notify("running", detail=f"Intervention message sent to {payload.get('agent_id', 'dev')}")
        elif action == "modify_agent":
            agent_id = payload.get("agent_id", "")
            inst = self.agent_manager.get_agent(agent_id)
            if inst and payload.get("system_prompt"):
                inst.config.system_prompt = payload["system_prompt"]
                await self._notify("running", detail=f"Modified system prompt for {agent_id}")

    async def run(self, user_prompt: str, goal: str | None = None, run_id: str | None = None):
        """Execute full loop: Manager plans → Dev executes → Evaluator reviews → final validation"""
        self._current_run_id = run_id
        try:
            await self._run_inner(user_prompt, goal)
        except asyncio.CancelledError:
            await self._notify("cancelled", detail="Run cancelled by user")

    async def _run_inner(self, user_prompt: str, goal: str | None = None):
        """Actual execution logic"""
        # Notify status
        await self._notify("running", detail="Manager is breaking down tasks...")

        # 1. Manager breaks down tasks
        manager = self.agent_manager.get_agent_by_role_type("planner")
        if not manager:
            await self._notify("failed", detail="No Agent with planner role found")
            return
        goal_instruction = ""
        if goal:
            goal_instruction = f"\n\nUser-specified goal: {goal}\nPlease use this goal in the '## 目标' section of the Sprint plan."
        else:
            goal_instruction = "\n\nPlease derive the project goal yourself in the '## 目标' section of the Sprint plan."

        sprint_prompt = (
            f"User requirements:\n\n{user_prompt}\n\n"
            f"Please analyze the requirements and generate a Sprint plan, output to shared/sprint.md.\n"
            f"The plan must include: goals, task list (using `1. [ ] task description` format), architecture constraints, acceptance criteria."
            f"{goal_instruction}"
        )
        await manager.execute(sprint_prompt)

        # 2. Read Sprint, parse tasks + extract goal
        sprint_md = self.file_comm.read_shared("sprint.md")
        if not sprint_md:
            await self._notify("failed", detail="Manager failed to generate Sprint plan")
            return

        tasks = parse_sprint_markdown(sprint_md)
        if not tasks:
            await self._notify("failed", detail="No task list found in Sprint")
            return

        final_goal = goal or extract_goal(sprint_md)

        await self._notify("running", detail=f"Parsed {len(tasks)} tasks, goal: {final_goal[:50]}...")

        # 3. Dispatch based on execution mode
        if self.execution_mode == "parallel":
            await self._execute_parallel(tasks, sprint_md)
        else:
            for task in tasks:
                await self._execute_task_loop(task, sprint_md)

        # Write tasks_summary
        if self.run_store and self._current_run_id:
            summary = [
                {"id": t.id, "description": t.description, "status": t.status.value}
                for t in tasks
            ]
            self.run_store.update_run(self._current_run_id, tasks_summary=summary)

        # 4. Final validation
        await self._final_validation(final_goal, sprint_md)

    async def _execute_parallel(self, tasks: list[TaskItem], sprint_md: str):
        """Parallel execution mode: schedule by dependencies, gather tasks without dependencies"""
        completed_ids: set[str] = set()
        remaining = list(tasks)

        while remaining:
            # Find all tasks with satisfied dependencies (ready batch)
            ready = [t for t in remaining if all(d in completed_ids for d in t.depends_on)]
            if not ready:
                # All remaining tasks have unsatisfied dependencies, deadlock
                for t in remaining:
                    t.status = TaskStatus.rejected
                    await self._notify_task(t)
                await self._notify("running", detail="Parallel scheduling deadlock: circular dependency detected")
                break

            await self._notify("running", detail=f"Parallel batch: {len(ready)} tasks ready")

            # Execute ready batch in parallel
            results = await asyncio.gather(
                *(self._execute_task_loop(t, sprint_md) for t in ready),
                return_exceptions=True,
            )

            # Add completed task IDs to set, remove from remaining
            for t, r in zip(ready, results):
                if isinstance(r, Exception):
                    t.status = TaskStatus.rejected
                    await self._notify_task(t)
                completed_ids.add(t.id)
                remaining.remove(t)

    async def _execute_task_loop(self, task: TaskItem, sprint_md: str):
        """Single task executor → reviewer loop, supports custom role assignment"""
        # Find executor: first by ID, then by role_type
        dev = (self.agent_manager.get_agent(task.assignee)
               or self.agent_manager.get_agent_by_role_type(task.assignee)
               or self.agent_manager.get_agent_by_role_type("executor"))
        evaluator = self.agent_manager.get_agent_by_role_type("reviewer")
        if not dev:
            await self._notify("failed", detail=f"Executor '{task.assignee}' not found")
            return
        if not evaluator:
            await self._notify("failed", detail="No Agent with reviewer role found")
            return

        for attempt in range(self.max_retries):
            # Pause check: wait before task starts
            await self._paused.wait()

            # If paused, create intervention Future for user to modify tasks
            if not self._paused.is_set():
                self._intervention = asyncio.get_event_loop().create_future()
                result = await self._intervention
                self._intervention = None
                if result and result.get("action") == "skip_task":
                    task.status = TaskStatus.rejected
                    await self._notify_task(task, attempt + 1)
                    return
                if result and result.get("action") == "modify_task":
                    task.description = result["description"]

            task.status = TaskStatus.in_progress
            await self._notify_task(task, attempt + 1)
            await self._notify("running", detail=f"Executing task: {task.description} (attempt {attempt+1}, executor: {dev.config.id})")

            # Executor executes
            dev_prompt = (
                f"Current Sprint plan:\n\n{sprint_md}\n\n"
                f"Please execute the following task:\n{task.description}\n\n"
                f"Place output in the artifacts/{dev.config.id}/ directory."
            )
            if attempt > 0:
                feedback = self.file_comm.read_inbox(dev.config.id)
                if feedback:
                    last_feedback = feedback[-1]["body"]
                    dev_prompt += f"\n\nPrevious review feedback:\n{last_feedback}"

            await dev.execute(dev_prompt)

            # Evaluator evaluates
            eval_prompt = (
                f"Sprint plan:\n\n{sprint_md}\n\n"
                f"Task description: {task.description}\n\n"
                f"Please check the output in artifacts/{dev.config.id}/ directory and evaluate against acceptance criteria.\n\n"
                f"If passed, reply 'APPROVED'.\n"
                f"If not passed, reply 'REJECTED' with specific issues and improvement suggestions."
            )
            eval_result = await evaluator.execute(eval_prompt)

            if "APPROVED" in eval_result.upper():
                await self._notify("running", detail=f"Task approved: {task.description}")
                task.status = TaskStatus.completed
                await self._notify_task(task, attempt + 1)
                return
            else:
                # Write feedback
                task.status = TaskStatus.review
                await self._notify_task(task, attempt + 1)
                self.file_comm.send_message(
                    from_agent=evaluator.config.id,
                    to_agent=dev.config.id,
                    msg_type="feedback",
                    content=eval_result,
                )

        # Exceeded max retries
        task.status = TaskStatus.rejected
        await self._notify_task(task, self.max_retries)
        await self._notify("running", detail=f"Task exceeded max retries: {task.description}")

    async def _final_validation(self, goal: str, sprint_md: str):
        """Final validation: after all tasks, Evaluator validates against goal"""
        if not goal:
            await self._notify("completed", detail="All tasks completed (no goal validation)")
            return

        await self._notify("running", detail="All tasks executed, starting final validation...")

        evaluator = self.agent_manager.get_agent_by_role_type("reviewer")
        if not evaluator:
            await self._notify("failed", detail="No Agent with reviewer role found")
            return
        validation_prompt = (
            f"All tasks have been executed. Please perform overall validation against the following goal:\n\n"
            f"**Goal:**\n{goal}\n\n"
            f"**Sprint plan:**\n{sprint_md}\n\n"
            f"Please check all output under artifacts/ and determine if the goal is fully achieved.\n\n"
            f"If the goal is fully achieved, reply 'GOAL_MET'.\n"
            f"If the goal is not fully achieved, reply 'GOAL_NOT_MET' and list the specific items not met."
        )
        verdict = await evaluator.execute(validation_prompt)

        if "GOAL_MET" in verdict.upper():
            await self._notify("completed", detail="Goal achieved, run complete!")
        else:
            # Separate message type for frontend, wait for user decision
            await self._notify("goal_not_met", detail=verdict)

            # Wait for user decision via WebSocket
            self._goal_decision = asyncio.get_event_loop().create_future()
            try:
                decision = await asyncio.wait_for(self._goal_decision, timeout=600)
            except asyncio.TimeoutError:
                decision = "accept"
            finally:
                self._goal_decision = None

            if decision == "retry":
                await self._notify("running", detail="User chose to continue optimizing, re-planning...")
                # Re-run one round
                await self._run_inner(
                    user_prompt=f"Previous validation failed, feedback:\n{verdict}\n\nPlease re-plan and improve based on the feedback.",
                    goal=goal,
                )
            else:
                await self._notify("completed", detail="User accepted current results, run complete.")

    def resolve_goal_decision(self, decision: str):
        """External call: user's goal decision sent via WebSocket"""
        if self._goal_decision and not self._goal_decision.done():
            self._goal_decision.set_result(decision)

    async def _notify(self, status: str, detail: str = ""):
        """Notify status change"""
        if self.on_status:
            await self.on_status(status, detail)
        # Persist final state
        if self.run_store and self._current_run_id and status in ("completed", "failed", "cancelled"):
            self.run_store.complete_run(self._current_run_id, status, detail)

    async def _notify_task(self, task: TaskItem, attempt: int = 0):
        """Notify task status change"""
        if self.on_task_update:
            await self.on_task_update(
                task.id, task.description, task.status.value,
                task.assignee, attempt,
            )
