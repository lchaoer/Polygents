"""Poll workspace mtimes during a run, emit workspace_changed events."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Awaitable, Callable, Dict

POLL_INTERVAL = 1.0


def _scan(root: Path) -> Dict[str, float]:
    snap: Dict[str, float] = {}
    if not root.exists():
        return snap
    for p in root.rglob("*"):
        if p.is_file():
            try:
                snap[str(p.relative_to(root)).replace("\\", "/")] = p.stat().st_mtime
            except OSError:
                continue
    return snap


async def watch_workspace(
    workspace: Path,
    publish: Callable[[dict], Awaitable[None]],
) -> None:
    last = _scan(workspace)
    try:
        while True:
            await asyncio.sleep(POLL_INTERVAL)
            current = _scan(workspace)
            for path, mtime in current.items():
                if path not in last or last[path] != mtime:
                    await publish(
                        {
                            "type": "workspace_changed",
                            "path": path,
                            "kind": "added" if path not in last else "modified",
                        }
                    )
            for path in last:
                if path not in current:
                    await publish(
                        {"type": "workspace_changed", "path": path, "kind": "deleted"}
                    )
            last = current
    except asyncio.CancelledError:
        return
