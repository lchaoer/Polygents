# providers/base.py
"""Provider 抽象接口"""
from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseProvider(ABC):
    """LLM Provider 统一抽象"""

    @abstractmethod
    async def send_message(
        self,
        system_prompt: str,
        prompt: str,
        tools: list[str] | None = None,
        cwd: str | None = None,
        model: str | None = None,
        max_turns: int | None = None,
    ) -> str:
        """发送消息，获取完整回复"""
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
    ) -> AsyncIterator[str]:
        """流式发送消息"""
        ...
