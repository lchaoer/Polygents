# providers/claude_provider.py
"""Claude Agent SDK Provider — 让每个 Agent 像 Claude Code 一样能读写文件、执行命令、搜索代码"""
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage, AssistantMessage
from app.providers.base import BaseProvider
from typing import AsyncIterator, Callable, Optional


class ClaudeProvider(BaseProvider):
    """通过 Claude Agent SDK 调用 Claude

    核心价值：Agent SDK 不只是 LLM 对话接口，
    它让 Agent 拥有 Claude Code 的全部能力：
    - Read/Write/Edit: 读写和编辑文件
    - Bash: 执行 shell 命令
    - Glob/Grep: 搜索文件和代码
    - WebSearch/WebFetch: 搜索和获取网页内容
    """

    def __init__(self, on_activity: Optional[Callable] = None):
        self.on_activity = on_activity

    async def send_message(
        self,
        system_prompt: str,
        prompt: str,
        tools: list[str] | None = None,
        cwd: str | None = None,
        model: str | None = None,
        max_turns: int | None = None,
    ) -> str:
        """发送消息，收集完整回复"""
        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            allowed_tools=tools or ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            disallowed_tools=["Skill"],
            permission_mode="bypassPermissions",
            model=model,
            max_turns=max_turns,
            cwd=cwd,
            setting_sources=[],
            env={"PYTHONIOENCODING": "utf-8"},
        )

        result_text = ""
        async for message in query(prompt=prompt, options=options):
            if self.on_activity and isinstance(message, AssistantMessage):
                # 通知外部有活动（用于 WebSocket 实时推送）
                for block in message.content:
                    if hasattr(block, "text") and block.text:
                        preview = block.text[:100]
                        await self.on_activity("thinking", preview)

            if isinstance(message, ResultMessage):
                result_text = message.result or ""

        return result_text

    async def stream_message(
        self,
        system_prompt: str,
        prompt: str,
        tools: list[str] | None = None,
        cwd: str | None = None,
        model: str | None = None,
        max_turns: int | None = None,
    ) -> AsyncIterator[str]:
        """流式发送消息"""
        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            allowed_tools=tools or ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            disallowed_tools=["Skill"],
            permission_mode="bypassPermissions",
            model=model,
            max_turns=max_turns,
            cwd=cwd,
            setting_sources=[],
            env={"PYTHONIOENCODING": "utf-8"},
        )

        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if hasattr(block, "text"):
                        yield block.text
            elif isinstance(message, ResultMessage):
                if message.result:
                    yield message.result
