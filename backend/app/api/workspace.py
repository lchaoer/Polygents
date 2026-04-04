# api/workspace.py
"""Workspace file browser API"""
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/workspace", tags=["workspace"])

_workspace_dir: Path | None = None


def init_workspace_api(workspace_dir: Path):
    global _workspace_dir
    _workspace_dir = workspace_dir


def _build_tree(root: Path, rel: Path | None = None) -> list[dict]:
    """Recursively build directory tree (excluding .polygents and runs directories)"""
    base = root / rel if rel else root
    if not base.is_dir():
        return []

    items = []
    try:
        entries = sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return []

    for entry in entries:
        name = entry.name
        if name.startswith(".") or name == "__pycache__" or name == "runs":
            continue

        relative = str(entry.relative_to(root)).replace("\\", "/")

        if entry.is_dir():
            items.append({
                "name": name,
                "path": relative,
                "type": "directory",
                "children": _build_tree(root, Path(relative)),
            })
        else:
            items.append({
                "name": name,
                "path": relative,
                "type": "file",
                "size": entry.stat().st_size,
            })
    return items


@router.get("/tree")
async def get_tree():
    """Return workspace directory tree"""
    if not _workspace_dir or not _workspace_dir.exists():
        return []
    return _build_tree(_workspace_dir)


@router.get("/file")
async def get_file(path: str = Query(..., description="Relative file path")):
    """Read file content"""
    if not _workspace_dir:
        raise HTTPException(status_code=500, detail="Workspace not configured")

    # Path traversal protection
    full = (_workspace_dir / path).resolve()
    if not str(full).startswith(str(_workspace_dir.resolve())):
        raise HTTPException(status_code=403, detail="Path out of bounds")

    if not full.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Size limit 1MB
    if full.stat().st_size > 1_048_576:
        raise HTTPException(status_code=413, detail="File too large (>1MB)")

    try:
        content = full.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = "(Binary file, cannot preview)"

    return {"path": path, "content": content}
