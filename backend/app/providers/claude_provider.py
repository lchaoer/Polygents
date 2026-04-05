# providers/claude_provider.py
"""Claude Agent SDK Provider — gives each Agent Claude Code-level capabilities: file I/O, shell commands, code search"""
import os
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage, AssistantMessage, TextBlock, ThinkingBlock
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

    async def send_message(
        self,
        system_prompt: str,
        prompt: str,
        tools: list[str] | None = None,
        cwd: str | None = None,
        model: str | None = None,
        max_turns: int | None = None,
        plugins: list[dict] | None = None,
        on_activity: Optional[Callable] = None,
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
            env={
                "PYTHONIOENCODING": "utf-8",
                "CLAUDE_CODE_GIT_BASH_PATH": os.environ.get(
                    "CLAUDE_CODE_GIT_BASH_PATH", r"D:\Software\Git\usr\bin\bash.exe"
                ),
            },
            plugins=plugins or [],
        )

        result_text = ""
        try:
            async for message in query(prompt=prompt, options=options):
                if on_activity and isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock) and block.text:
                            await on_activity("thinking", block.text)
                        elif isinstance(block, ThinkingBlock) and block.thinking:
                            await on_activity("thinking", block.thinking)

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
            env={
                "PYTHONIOENCODING": "utf-8",
                "CLAUDE_CODE_GIT_BASH_PATH": os.environ.get(
                    "CLAUDE_CODE_GIT_BASH_PATH", r"D:\Software\Git\usr\bin\bash.exe"
                ),
            },
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
