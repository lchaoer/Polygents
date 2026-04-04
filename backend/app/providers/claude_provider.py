# providers/claude_provider.py
"""Claude Agent SDK Provider — gives each Agent Claude Code-level capabilities: file I/O, shell commands, code search"""
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage, AssistantMessage
from app.providers.base import BaseProvider
from typing import AsyncIterator, Callable, Optional


class ClaudeProvider(BaseProvider):
    """Call Claude via Agent SDK

    Core value: Agent SDK is not just an LLM chat interface,
    it gives Agents full Claude Code capabilities:
    - Read/Write/Edit: read, write and edit files
    - Bash: execute shell commands
    - Glob/Grep: search files and code
    - WebSearch/WebFetch: search and fetch web content
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
        plugins: list[dict] | None = None,
    ) -> str:
        """Send message and collect complete response"""
        effective_tools = tools or ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
        disallowed = [] if "Skill" in effective_tools else ["Skill"]
        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            allowed_tools=effective_tools,
            disallowed_tools=disallowed,
            permission_mode="bypassPermissions",
            model=model,
            max_turns=max_turns,
            cwd=cwd,
            setting_sources=["user", "project"],
            env={"PYTHONIOENCODING": "utf-8"},
            plugins=plugins or [],
        )

        result_text = ""
        try:
            async for message in query(prompt=prompt, options=options):
                if self.on_activity and isinstance(message, AssistantMessage):
                    # Notify external listeners (for WebSocket real-time push)
                    for block in message.content:
                        if hasattr(block, "text") and block.text:
                            preview = block.text[:100]
                            await self.on_activity("thinking", preview)

                if isinstance(message, ResultMessage):
                    result_text = message.result or ""
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise

        return result_text

    async def stream_message(
        self,
        system_prompt: str,
        prompt: str,
        tools: list[str] | None = None,
        cwd: str | None = None,
        model: str | None = None,
        max_turns: int | None = None,
        plugins: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        """Stream message"""
        effective_tools = tools or ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
        disallowed = [] if "Skill" in effective_tools else ["Skill"]
        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            allowed_tools=effective_tools,
            disallowed_tools=disallowed,
            permission_mode="bypassPermissions",
            model=model,
            max_turns=max_turns,
            cwd=cwd,
            setting_sources=["user", "project"],
            env={"PYTHONIOENCODING": "utf-8"},
            plugins=plugins or [],
        )

        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if hasattr(block, "text"):
                        yield block.text
            elif isinstance(message, ResultMessage):
                if message.result:
                    yield message.result
