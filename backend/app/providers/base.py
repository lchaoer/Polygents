# providers/base.py
"""Provider abstract interface"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Callable, Optional


class BaseProvider(ABC):
    """LLM Provider unified abstraction"""

    @abstractmethod
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
        """Send message and get complete response"""
        ...

    @abstractmethod
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
        ...
