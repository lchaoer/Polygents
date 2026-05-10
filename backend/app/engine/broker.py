"""In-process pub/sub broker for run events.

Each run has a list of subscriber asyncio.Queues. The runner publishes events
via ``publish``; SSE handlers subscribe via ``subscribe`` (async context
manager) and drain their queue.

Recent events are kept in a small ring buffer per run so a late subscriber
sees what already happened (helps the frontend show round 1 even if it
connects after round 1 finished).
"""
from __future__ import annotations

import asyncio
from collections import deque
from contextlib import asynccontextmanager
from typing import AsyncIterator, Deque, Dict, List

_HISTORY_LIMIT = 200


class _RunChannel:
    def __init__(self) -> None:
        self.history: Deque[dict] = deque(maxlen=_HISTORY_LIMIT)
        self.subscribers: List[asyncio.Queue] = []
        self.closed = False


_channels: Dict[str, _RunChannel] = {}
_lock = asyncio.Lock()


async def _get_channel(run_id: str) -> _RunChannel:
    async with _lock:
        ch = _channels.get(run_id)
        if ch is None:
            ch = _RunChannel()
            _channels[run_id] = ch
        return ch


async def publish(run_id: str, event: dict, *, historical: bool = True) -> None:
    ch = await _get_channel(run_id)
    if historical:
        ch.history.append(event)
    for q in list(ch.subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


async def close(run_id: str) -> None:
    ch = await _get_channel(run_id)
    ch.closed = True
    for q in list(ch.subscribers):
        q.put_nowait({"type": "_eof"})


@asynccontextmanager
async def subscribe(run_id: str) -> AsyncIterator[asyncio.Queue]:
    ch = await _get_channel(run_id)
    queue: asyncio.Queue = asyncio.Queue(maxsize=1024)
    for past in ch.history:
        queue.put_nowait(past)
    if ch.closed:
        queue.put_nowait({"type": "_eof"})
    ch.subscribers.append(queue)
    try:
        yield queue
    finally:
        if queue in ch.subscribers:
            ch.subscribers.remove(queue)
