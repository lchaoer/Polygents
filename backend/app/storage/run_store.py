from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel

from app.settings import RUNS_DIR
from app.storage.workflow_store import get_workflow

RunState = Literal["pending", "running", "passed", "failed", "cancelled"]


class RunStatus(BaseModel):
    state: RunState = "pending"
    current_round: int = 0
    workflow_id: str
    created_at: str
    updated_at: str
    error: Optional[str] = None


class RunSummary(BaseModel):
    id: str
    workflow_id: str
    state: RunState
    current_round: int
    created_at: str


class RunSnapshot(BaseModel):
    id: str
    workflow_id: str
    status: RunStatus
    task: str
    checklist: str
    reports: list[str]
    reviews: list[str]


def _run_dir(run_id: str) -> Path:
    return RUNS_DIR / run_id


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_run_id() -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    return f"{ts}-{uuid.uuid4().hex[:6]}"


def _safe_join(base: Path, relpath: str) -> Optional[Path]:
    try:
        target = (base / relpath).resolve()
        base_resolved = base.resolve()
        target.relative_to(base_resolved)
        return target
    except (ValueError, OSError):
        return None


def create_run(workflow_id: str, task: str) -> Optional[RunSnapshot]:
    wf = get_workflow(workflow_id)
    if wf is None:
        return None

    run_id = _new_run_id()
    d = _run_dir(run_id)
    (d / "workspace").mkdir(parents=True, exist_ok=True)
    (d / "reports").mkdir(parents=True, exist_ok=True)
    (d / "reviews").mkdir(parents=True, exist_ok=True)

    (d / "task.md").write_text(task, encoding="utf-8")
    (d / "checklist.md").write_text(wf.checklist_md, encoding="utf-8")

    now = _now()
    status = RunStatus(
        state="pending",
        current_round=0,
        workflow_id=workflow_id,
        created_at=now,
        updated_at=now,
    )
    _write_status(run_id, status)
    snap = get_run(run_id)
    assert snap is not None
    return snap


def _write_status(run_id: str, status: RunStatus) -> None:
    d = _run_dir(run_id)
    (d / "status.json").write_text(
        json.dumps(status.model_dump(), indent=2), encoding="utf-8"
    )


def update_status(run_id: str, **kwargs: Any) -> Optional[RunStatus]:
    d = _run_dir(run_id)
    p = d / "status.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    data.update(kwargs)
    data["updated_at"] = _now()
    status = RunStatus(**data)
    _write_status(run_id, status)
    return status


def _read_status(run_id: str) -> Optional[RunStatus]:
    d = _run_dir(run_id)
    p = d / "status.json"
    if not p.exists():
        return None
    return RunStatus(**json.loads(p.read_text(encoding="utf-8")))


def _list_round_files(d: Path) -> list[str]:
    if not d.is_dir():
        return []
    files = [f.name for f in d.iterdir() if f.is_file() and f.suffix == ".md"]
    files.sort()
    return files


def get_run(run_id: str) -> Optional[RunSnapshot]:
    d = _run_dir(run_id)
    if not d.is_dir():
        return None
    status = _read_status(run_id)
    if status is None:
        return None
    task = (d / "task.md").read_text(encoding="utf-8") if (d / "task.md").exists() else ""
    checklist = (
        (d / "checklist.md").read_text(encoding="utf-8")
        if (d / "checklist.md").exists()
        else ""
    )
    return RunSnapshot(
        id=run_id,
        workflow_id=status.workflow_id,
        status=status,
        task=task,
        checklist=checklist,
        reports=_list_round_files(d / "reports"),
        reviews=_list_round_files(d / "reviews"),
    )


def list_runs(workflow_id: Optional[str] = None) -> list[RunSummary]:
    if not RUNS_DIR.exists():
        return []
    out: list[RunSummary] = []
    for entry in sorted(RUNS_DIR.iterdir(), reverse=True):
        if not entry.is_dir():
            continue
        status = _read_status(entry.name)
        if status is None:
            continue
        if workflow_id and status.workflow_id != workflow_id:
            continue
        out.append(
            RunSummary(
                id=entry.name,
                workflow_id=status.workflow_id,
                state=status.state,
                current_round=status.current_round,
                created_at=status.created_at,
            )
        )
    return out


def read_run_file(run_id: str, relpath: str) -> Optional[str]:
    d = _run_dir(run_id)
    if not d.is_dir():
        return None
    target = _safe_join(d, relpath)
    if target is None or not target.is_file():
        return None
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def list_workspace_files(run_id: str) -> Optional[list[dict]]:
    d = _run_dir(run_id) / "workspace"
    if not d.is_dir():
        return None
    out = []
    for p in sorted(d.rglob("*")):
        if p.is_file():
            rel = p.relative_to(d).as_posix()
            stat = p.stat()
            out.append({"path": rel, "size": stat.st_size, "mtime": stat.st_mtime})
    return out


def delete_run(run_id: str) -> bool:
    d = _run_dir(run_id)
    if not d.is_dir():
        return False
    shutil.rmtree(d)
    return True
