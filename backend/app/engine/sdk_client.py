from __future__ import annotations

import asyncio
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

logger = logging.getLogger(__name__)


_DEFAULT_GIT_BASH_CANDIDATES = [
    r"D:\Software\Git\bin\bash.exe",
    r"C:\Program Files\Git\bin\bash.exe",
    r"C:\Program Files (x86)\Git\bin\bash.exe",
]


def _summarize_tool_input(name: str, raw: object) -> str:
    """One-line human-readable hint for a tool call (no full payload)."""
    if not isinstance(raw, dict):
        return ""
    if name in ("Read", "Write"):
        p = raw.get("file_path") or raw.get("path") or ""
        return str(p)
    if name == "Edit":
        p = raw.get("file_path") or ""
        return str(p)
    if name == "Bash":
        cmd = str(raw.get("command", ""))
        return cmd[:120] + ("…" if len(cmd) > 120 else "")
    if name == "Glob":
        return str(raw.get("pattern", ""))
    if name == "Grep":
        return str(raw.get("pattern", ""))
    if name in ("TodoWrite",):
        return ""
    keys = list(raw.keys())[:2]
    return ", ".join(f"{k}=…" for k in keys)


def _resolve_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if sys.platform == "win32":
        existing = os.environ.get("CLAUDE_CODE_GIT_BASH_PATH")
        if existing and Path(existing).is_file():
            env["CLAUDE_CODE_GIT_BASH_PATH"] = existing
        else:
            for candidate in _DEFAULT_GIT_BASH_CANDIDATES:
                if Path(candidate).is_file():
                    env["CLAUDE_CODE_GIT_BASH_PATH"] = candidate
                    break
    return env


@dataclass
class AgentSession:
    """Long-lived Claude Agent session for one role within one run.

    A single session keeps conversation context across multiple `send()` calls,
    which is exactly the resume-across-rounds behavior Polygents needs.
    """

    role: str
    model: str
    system_prompt: str
    cwd: Path
    allowed_tools: list[str]
    disallowed_tools: list[str] | None = None
    permission_mode: str = "bypassPermissions"

    _client: Optional[ClaudeSDKClient] = None

    async def open(self) -> None:
        options = ClaudeAgentOptions(
            model=self.model,
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": self.system_prompt,
            },
            cwd=str(self.cwd),
            allowed_tools=self.allowed_tools,
            disallowed_tools=self.disallowed_tools or [],
            permission_mode=self.permission_mode,
            setting_sources=None,
            env=_resolve_env(),
            stderr=lambda line: logger.warning("sdk[%s] %s", self.role, line.rstrip()),
        )
        self._client = ClaudeSDKClient(options)
        await self._client.connect()

    async def send(
        self,
        prompt: str,
        on_stream: Optional[Callable[[dict], Awaitable[None]]] = None,
    ) -> str:
        if self._client is None:
            raise RuntimeError(f"session {self.role} not opened")
        await self._client.query(prompt)
        chunks: list[str] = []

        async def emit(ev: dict) -> None:
            if on_stream is None:
                return
            try:
                await on_stream(ev)
            except Exception:
                logger.exception("stream callback failed")

        async for msg in self._client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        chunks.append(block.text)
                        await emit({"kind": "text", "text": block.text})
                    elif isinstance(block, ToolUseBlock):
                        await emit(
                            {
                                "kind": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": _summarize_tool_input(block.name, block.input),
                            }
                        )
                    elif isinstance(block, ThinkingBlock):
                        await emit({"kind": "thinking", "text": block.thinking})
            elif isinstance(msg, UserMessage):
                content = msg.content
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, ToolResultBlock):
                            await emit(
                                {
                                    "kind": "tool_result",
                                    "id": block.tool_use_id,
                                    "is_error": bool(block.is_error),
                                }
                            )
            elif isinstance(msg, ResultMessage):
                break
        return "".join(chunks)

    async def close(self) -> None:
        """Best-effort disconnect that survives SDK cancel-scope leakage.

        The SDK's Windows subprocess disconnect can leak anyio cancel-scope
        cancellations into the calling task. We run disconnect in a fresh
        event loop on a worker thread so it can never touch our task tree.
        """
        if self._client is None:
            return
        client = self._client
        self._client = None

        def _disconnect_in_thread() -> None:
            try:
                asyncio.run(client.disconnect())
            except BaseException as exc:
                logger.debug("disconnect[%s] swallowed: %r", self.role, exc)

        loop = asyncio.get_running_loop()
        try:
            await asyncio.wait_for(
                loop.run_in_executor(None, _disconnect_in_thread),
                timeout=5.0,
            )
        except (asyncio.TimeoutError, BaseException) as exc:
            logger.debug("close[%s] outer swallowed: %r", self.role, exc)

    async def interrupt(self) -> None:
        if self._client is not None:
            try:
                await self._client.interrupt()
            except Exception:
                pass
