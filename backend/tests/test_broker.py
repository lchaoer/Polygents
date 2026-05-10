"""Tests for the in-process pub/sub broker."""
from __future__ import annotations

import asyncio

import pytest

from app.engine import broker


@pytest.fixture(autouse=True)
def _reset_channels():
    broker._channels.clear()
    yield
    broker._channels.clear()


async def test_subscribe_receives_published_event():
    async with broker.subscribe("run-a") as q:
        await broker.publish("run-a", {"type": "ping", "n": 1})
        ev = await asyncio.wait_for(q.get(), timeout=1)
        assert ev == {"type": "ping", "n": 1}


async def test_late_subscriber_replays_history():
    await broker.publish("run-b", {"type": "first"})
    await broker.publish("run-b", {"type": "second"})
    async with broker.subscribe("run-b") as q:
        assert (await asyncio.wait_for(q.get(), timeout=1))["type"] == "first"
        assert (await asyncio.wait_for(q.get(), timeout=1))["type"] == "second"


async def test_non_historical_events_are_not_replayed():
    await broker.publish("run-c", {"type": "stream", "x": 1}, historical=False)
    await broker.publish("run-c", {"type": "keep_me"}, historical=True)
    async with broker.subscribe("run-c") as q:
        ev = await asyncio.wait_for(q.get(), timeout=1)
        assert ev["type"] == "keep_me"
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(q.get(), timeout=0.1)


async def test_close_emits_eof_to_subscribers():
    async with broker.subscribe("run-d") as q:
        await broker.close("run-d")
        ev = await asyncio.wait_for(q.get(), timeout=1)
        assert ev == {"type": "_eof"}


async def test_multiple_subscribers_each_get_event():
    async with broker.subscribe("run-e") as q1, broker.subscribe("run-e") as q2:
        await broker.publish("run-e", {"type": "fan_out"})
        e1 = await asyncio.wait_for(q1.get(), timeout=1)
        e2 = await asyncio.wait_for(q2.get(), timeout=1)
        assert e1 == e2 == {"type": "fan_out"}


async def test_history_is_bounded():
    for i in range(broker._HISTORY_LIMIT + 50):
        await broker.publish("run-f", {"type": "n", "i": i})
    async with broker.subscribe("run-f") as q:
        first = await asyncio.wait_for(q.get(), timeout=1)
        assert first["i"] == 50
