# engine/agent_manager.py
"""Agent 生命周期管理"""
import asyncio
from app.models.schemas import AgentConfig
from app.providers.base import BaseProvider
from app.engine.file_comm import FileComm
from app.config import PROJECT_DIR, AGENT_TIMEOUT, AGENT_MAX_TURNS
from typing import Optional, Callable


class AgentInstance:
    """运行中的 Agent 实例"""

    def __init__(
        self,
        config: AgentConfig,
        provider: BaseProvider,
        file_comm: FileComm,
        on_activity: Optional[Callable] = None,
    ):
        self.config = config
        self.provider = provider
        self.file_comm = file_comm
        self.on_activity = on_activity

    async def execute(self, prompt: str) -> str:
        """执行一个任务，返回结果文本"""
        if self.on_activity:
            await self.on_activity(self.config.id, "thinking", f"正在处理: {prompt[:50]}...")

        # 如果配了 project_dir，Agent 在用户项目目录工作；否则在 workspace 内
        cwd = str(PROJECT_DIR) if PROJECT_DIR else str(self.file_comm.base_dir)
        try:
            result = await asyncio.wait_for(
                self.provider.send_message(
                    system_prompt=self.config.system_prompt,
                    prompt=prompt,
                    tools=self.config.tools,
                    cwd=cwd,
                    model=self.config.model,
                    max_turns=AGENT_MAX_TURNS,
                ),
                timeout=AGENT_TIMEOUT,
            )
        except asyncio.TimeoutError:
            error_msg = f"Agent '{self.config.id}' 执行超时 ({AGENT_TIMEOUT}s)"
            if self.on_activity:
                await self.on_activity(self.config.id, "completed", f"超时: {error_msg}")
            return f"[ERROR] {error_msg}"

        if self.on_activity:
            await self.on_activity(self.config.id, "completed", "任务完成")

        return result


class AgentManager:
    """管理所有 Agent 实例"""

    def __init__(self, provider: BaseProvider, file_comm: FileComm):
        self.provider = provider
        self.file_comm = file_comm
        self.agents: dict[str, AgentInstance] = {}
        self.on_activity: Optional[Callable] = None

    def create_agent(self, config: AgentConfig) -> AgentInstance:
        """创建 Agent 实例"""
        self.file_comm.init_agent(config.id)
        instance = AgentInstance(
            config=config,
            provider=self.provider,
            file_comm=self.file_comm,
            on_activity=self.on_activity,
        )
        self.agents[config.id] = instance
        return instance

    def get_agent(self, agent_id: str) -> Optional[AgentInstance]:
        return self.agents.get(agent_id)

    # 兜底映射：旧 ID → role_type
    _LEGACY_MAP = {"manager": "planner", "dev": "executor", "evaluator": "reviewer"}

    def get_agent_by_role_type(self, role_type: str) -> Optional[AgentInstance]:
        """按 role_type 查找 Agent，兜底按旧 ID 映射"""
        for inst in self.agents.values():
            if inst.config.role_type and inst.config.role_type.value == role_type:
                return inst
        # 兜底：按 ID 名映射
        for agent_id, mapped in self._LEGACY_MAP.items():
            if mapped == role_type and agent_id in self.agents:
                return self.agents[agent_id]
        return None

    def list_agents(self) -> list[str]:
        return list(self.agents.keys())
