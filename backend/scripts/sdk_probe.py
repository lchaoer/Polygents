"""Minimal SDK connectivity probe — single round trip, no runner.

Run from backend/:
    python scripts/sdk_probe.py
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path


async def main() -> int:
    from app.engine.sdk_client import AgentSession

    cwd = Path(tempfile.mkdtemp(prefix="polygents-probe-"))
    print(f"cwd={cwd}")

    session = AgentSession(
        role="probe",
        model="claude-sonnet-4-5-20250929",
        system_prompt="You are a tool-using assistant. Respond only in English.",
        cwd=cwd,
        allowed_tools=["Write"],
    )
    await session.open()
    try:
        text = await session.send(
            "Use the Write tool to create probe.txt in the current directory with the content 'ok'. "
            "After the tool call succeeds, reply with exactly the word DONE and nothing else."
        )
        print(f"reply: {text!r}")
        probe_file = cwd / "probe.txt"
        if probe_file.exists():
            print(f"probe.txt written: {probe_file.read_text(encoding='utf-8')!r}")
        else:
            print("probe.txt NOT written")
            return 1
    finally:
        await session.close()

    print("PROBE OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
