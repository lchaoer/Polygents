# engine/agent_manager.py
"""Agent lifecycle management"""
import asyncio
from app.models.schemas import AgentConfig
from app.providers.base import BaseProvider
from app.engine.file_comm import FileComm
from app.config import PROJECT_DIR, AGENT_TIMEOUT, AGENT_MAX_TURNS
from app.api.plugins import resolve_plugin_paths
from typing import Optional, Callable


class AgentInstance:
    """Running Agent instance"""

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
        """Execute a task and return result text"""
        if self.on_activity:
            await self.on_activity(self.config.id, "thinking", f"Processing: {prompt[:50]}...")

        # Bridge: forward provider-level activity to AgentManager-level on_activity
        async def _activity_bridge(action: str, detail: str):
            if self.on_activity:
                await self.on_activity(self.config.id, action, detail)

        # If project_dir is configured, Agent works in user project dir; otherwise in workspace
        cwd = str(PROJECT_DIR) if PROJECT_DIR else str(self.file_comm.base_dir)
        # Resolve plugin names to SDK format
        sdk_plugins = resolve_plugin_paths(self.config.plugins) if self.config.plugins else []
        try:
            result = await asyncio.wait_for(
                self.provider.send_message(
                    system_prompt=self.config.system_prompt,
                    prompt=prompt,
                    tools=self.config.tools,
                    cwd=cwd,
                    model=self.config.model,
                    max_turns=AGENT_MAX_TURNS,
                    plugins=sdk_plugins or None,
                    on_activity=_activity_bridge,
                ),
                timeout=AGENT_TIMEOUT,
            )
        except asyncio.TimeoutError:
            error_msg = f"Agent '{self.config.id}' execution timed out ({AGENT_TIMEOUT}s)"
            if self.on_activity:
                await self.on_activity(self.config.id, "completed", f"Timeout: {error_msg}")
            return f"[ERROR] {error_msg}"

        if self.on_activity:
            await self.on_activity(self.config.id, "completed", "Task completed")

        return result


class AgentManager:
    """Manage all Agent instances"""

    def __init__(self, provider: BaseProvider, file_comm: FileComm):
        self.provider = provider
        self.file_comm = file_comm
        self.agents: dict[str, AgentInstance] = {}
        self.on_activity: Optional[Callable] = None

    def create_agent(self, config: AgentConfig) -> AgentInstance:
        """Create Agent instance"""
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

    # Fallback mapping: legacy ID → role_type
    _LEGACY_MAP = {"manager": "planner", "dev": "executor", "evaluator": "reviewer"}

    def get_agent_by_role_type(self, role_type: str) -> Optional[AgentInstance]:
        """Find Agent by role_type, fallback to legacy ID mapping"""
        for inst in self.agents.values():
            if inst.config.role_type and inst.config.role_type == role_type:
                return inst
        # Fallback: map by ID name
        for agent_id, mapped in self._LEGACY_MAP.items():
            if mapped == role_type and agent_id in self.agents:
                return self.agents[agent_id]
        return None

    def list_agents(self) -> list[str]:
        return list(self.agents.keys())

    def remove_agent(self, agent_id: str):
        """Remove Agent instance"""
        self.agents.pop(agent_id, None)
