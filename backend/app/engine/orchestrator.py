# engine/orchestrator.py
"""编排引擎 — 协调 Manager/Dev/Evaluator 闭环"""
import asyncio
import re
from typing import Optional, Callable, TYPE_CHECKING
from app.models.schemas import TaskItem, TaskStatus, TeamConfig
from app.engine.agent_manager import AgentManager
from app.engine.file_comm import FileComm

if TYPE_CHECKING:
    from app.engine.run_store import RunStore


def parse_sprint_markdown(sprint_md: str) -> list[TaskItem]:
    """从 Sprint markdown 中解析任务列表"""
    tasks = []
    pattern = r'^\d+\.\s*\[[ x]\]\s*(.+)$'
    for i, match in enumerate(re.finditer(pattern, sprint_md, re.MULTILINE)):
        tasks.append(TaskItem(
            id=f"task-{i+1:03d}",
            description=match.group(1).strip(),
            assignee="dev",
        ))
    return tasks


def extract_goal(sprint_md: str) -> str:
    """从 Sprint markdown 的 '## 目标' 段提取 goal"""
    match = re.search(
        r'##\s*目标\s*\n(.*?)(?=\n##|\Z)',
        sprint_md,
        re.DOTALL,
    )
    if match:
        return match.group(1).strip()
    return ""


class Orchestrator:
    """编排引擎：接收任务列表，分配执行，管理闭环"""

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
        self.run_store = run_store
        self._goal_decision: Optional[asyncio.Future] = None
        self._current_run_id: Optional[str] = None

    async def run(self, user_prompt: str, goal: str | None = None, run_id: str | None = None):
        """执行完整闭环：Manager拆解 → Dev执行 → Evaluator评估 → 总验收"""
        self._current_run_id = run_id
        # 通知状态
        await self._notify("running", detail="Manager 正在拆解任务...")

        # 1. Manager 拆解任务
        manager = self.agent_manager.get_agent_by_role_type("planner")
        if not manager:
            await self._notify("failed", detail="未找到 planner 角色的 Agent")
            return
        goal_instruction = ""
        if goal:
            goal_instruction = f"\n\n用户指定的目标：{goal}\n请在 Sprint 规划的「## 目标」部分使用此目标。"
        else:
            goal_instruction = "\n\n请在 Sprint 规划的「## 目标」部分自行提炼项目目标。"

        sprint_prompt = (
            f"用户需求如下：\n\n{user_prompt}\n\n"
            f"请分析需求并生成 Sprint 规划，输出到 shared/sprint.md。\n"
            f"规划必须包含：目标、任务列表（用 `1. [ ] 任务描述` 格式）、架构约束、验收标准。"
            f"{goal_instruction}"
        )
        await manager.execute(sprint_prompt)

        # 2. 读取 Sprint，解析任务 + 提取 goal
        sprint_md = self.file_comm.read_shared("sprint.md")
        if not sprint_md:
            await self._notify("failed", detail="Manager 未能生成 Sprint 规划")
            return

        tasks = parse_sprint_markdown(sprint_md)
        if not tasks:
            await self._notify("failed", detail="Sprint 中未找到任务列表")
            return

        final_goal = goal or extract_goal(sprint_md)

        await self._notify("running", detail=f"解析到 {len(tasks)} 个任务，目标：{final_goal[:50]}...")

        # 3. 逐个任务执行 Dev → Evaluator 闭环
        for task in tasks:
            await self._execute_task_loop(task, sprint_md)

        # 4. 总验收
        await self._final_validation(final_goal, sprint_md)

    async def _execute_task_loop(self, task: TaskItem, sprint_md: str):
        """单个任务的 Dev → Evaluator 闭环"""
        dev = self.agent_manager.get_agent_by_role_type("executor")
        evaluator = self.agent_manager.get_agent_by_role_type("reviewer")
        if not dev or not evaluator:
            await self._notify("failed", detail="未找到 executor 或 reviewer 角色的 Agent")
            return

        for attempt in range(self.max_retries):
            await self._notify("running", detail=f"执行任务: {task.description} (第{attempt+1}轮)")

            # Dev 执行
            dev_prompt = (
                f"当前 Sprint 规划：\n\n{sprint_md}\n\n"
                f"请执行以下任务：\n{task.description}\n\n"
                f"将产出放到 artifacts/dev/ 目录下。"
            )
            if attempt > 0:
                feedback = self.file_comm.read_inbox("dev")
                if feedback:
                    last_feedback = feedback[-1]["body"]
                    dev_prompt += f"\n\n上一轮评审反馈：\n{last_feedback}"

            await dev.execute(dev_prompt)

            # Evaluator 评估
            eval_prompt = (
                f"Sprint 规划：\n\n{sprint_md}\n\n"
                f"任务描述：{task.description}\n\n"
                f"请检查 artifacts/dev/ 目录下的产出，对照验收标准评估。\n\n"
                f"如果通过，回复 'APPROVED'。\n"
                f"如果不通过，回复 'REJECTED'，并说明具体问题和修改建议。"
            )
            eval_result = await evaluator.execute(eval_prompt)

            if "APPROVED" in eval_result.upper():
                await self._notify("running", detail=f"任务通过: {task.description}")
                task.status = TaskStatus.completed
                return
            else:
                # 写入反馈
                self.file_comm.send_message(
                    from_agent="evaluator",
                    to_agent="dev",
                    msg_type="feedback",
                    content=eval_result,
                )

        # 超过重试次数
        task.status = TaskStatus.rejected
        await self._notify("running", detail=f"任务超过重试次数: {task.description}")

    async def _final_validation(self, goal: str, sprint_md: str):
        """总验收：所有任务完成后，Evaluator 对照 goal 做整体验收"""
        if not goal:
            await self._notify("completed", detail="所有任务已完成（无 goal 验收）")
            return

        await self._notify("running", detail="所有任务已执行完毕，开始总验收...")

        evaluator = self.agent_manager.get_agent_by_role_type("reviewer")
        if not evaluator:
            await self._notify("failed", detail="未找到 reviewer 角色的 Agent")
            return
        validation_prompt = (
            f"所有任务已执行完毕。请对照以下目标做整体验收：\n\n"
            f"**目标：**\n{goal}\n\n"
            f"**Sprint 规划：**\n{sprint_md}\n\n"
            f"请检查 artifacts/ 下的所有产出，判断目标是否完整达成。\n\n"
            f"如果目标完整达成，回复 'GOAL_MET'。\n"
            f"如果目标未完整达成，回复 'GOAL_NOT_MET'，并列出未达成的具体项。"
        )
        verdict = await evaluator.execute(validation_prompt)

        if "GOAL_MET" in verdict.upper():
            await self._notify("completed", detail="目标达成，运行完成！")
        else:
            # 独立消息类型通知前端，等待用户决定
            await self._notify("goal_not_met", detail=verdict)

            # 等待用户通过 WebSocket 发送决定
            self._goal_decision = asyncio.get_event_loop().create_future()
            try:
                decision = await asyncio.wait_for(self._goal_decision, timeout=600)
            except asyncio.TimeoutError:
                decision = "accept"
            finally:
                self._goal_decision = None

            if decision == "retry":
                await self._notify("running", detail="用户选择继续优化，重新规划...")
                # 重跑一轮
                await self.run(
                    user_prompt=f"上一轮验收未通过，反馈如下：\n{verdict}\n\n请根据反馈重新规划并改进。",
                    goal=goal,
                )
            else:
                await self._notify("completed", detail="用户接受当前结果，运行完成。")

    def resolve_goal_decision(self, decision: str):
        """外部调用：用户通过 WebSocket 发来的 goal 决定"""
        if self._goal_decision and not self._goal_decision.done():
            self._goal_decision.set_result(decision)

    async def _notify(self, status: str, detail: str = ""):
        """通知状态变更"""
        if self.on_status:
            await self.on_status(status, detail)
        # 持久化终态
        if self.run_store and self._current_run_id and status in ("completed", "failed"):
            self.run_store.complete_run(self._current_run_id, status, detail)
