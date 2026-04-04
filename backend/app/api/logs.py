# api/logs.py
"""Communication logs API"""
import re
from pathlib import Path
from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/logs", tags=["logs"])

_workspace_dir: Optional[Path] = None


def init_logs_api(workspace_dir: Path):
    global _workspace_dir
    _workspace_dir = workspace_dir


def _parse_log_entries(content: str) -> list[dict]:
    """Parse communication entries from log markdown"""
    pattern = r'###\s*\[(\d{2}:\d{2}:\d{2})\]\s*(\S+)\s*→\s*(\S+)\s*\((\S+)\)\s*\n\n(.*?)(?=\n###|\Z)'
    entries = []
    for m in re.finditer(pattern, content, re.DOTALL):
        entries.append({
            "timestamp": m.group(1),
            "from": m.group(2),
            "to": m.group(3),
            "type": m.group(4),
            "content": m.group(5).strip(),
        })
    return entries


@router.get("")
def list_logs(
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD"),
    from_agent: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    msg_type: Optional[str] = Query(None, alias="type"),
):
    """Return communication logs, supports filtering by date/agent/type"""
    logs_dir = _workspace_dir / "logs"
    if not logs_dir.exists():
        return []

    all_entries = []

    if date:
        log_file = logs_dir / f"{date}.md"
        if log_file.exists():
            content = log_file.read_text(encoding="utf-8")
            entries = _parse_log_entries(content)
            for e in entries:
                e["date"] = date
            all_entries.extend(entries)
    else:
        for log_file in sorted(logs_dir.glob("*.md"), reverse=True):
            d = log_file.stem
            content = log_file.read_text(encoding="utf-8")
            entries = _parse_log_entries(content)
            for e in entries:
                e["date"] = d
            all_entries.extend(entries)

    # Filter
    if from_agent:
        all_entries = [e for e in all_entries if e["from"] == from_agent]
    if to:
        all_entries = [e for e in all_entries if e["to"] == to]
    if msg_type:
        all_entries = [e for e in all_entries if e["type"] == msg_type]

    return all_entries


@router.get("/{date}")
def get_logs_by_date(date: str):
    """Get logs for a specific date"""
    log_file = _workspace_dir / "logs" / f"{date}.md"
    if not log_file.exists():
        return []
    content = log_file.read_text(encoding="utf-8")
    entries = _parse_log_entries(content)
    for e in entries:
        e["date"] = date
    return entries
