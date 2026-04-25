from __future__ import annotations

import re
import shutil
import uuid
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field

from app.settings import WORKFLOWS_DIR


class WorkflowConfig(BaseModel):
    name: str
    max_rounds: int = 3
    worker_model: str = "claude-sonnet-4-6"
    critic_model: str = "claude-opus-4-7"


class Workflow(BaseModel):
    id: str
    config: WorkflowConfig
    worker_md: str
    critic_md: str
    checklist_md: str


class WorkflowSummary(BaseModel):
    id: str
    name: str


class WorkflowPayload(BaseModel):
    config: WorkflowConfig
    worker_md: str = ""
    critic_md: str = ""
    checklist_md: str = ""


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(name: str) -> str:
    s = _SLUG_RE.sub("-", name.lower()).strip("-")
    return s or "workflow"


def _new_id(name: str) -> str:
    return f"{_slug(name)}-{uuid.uuid4().hex[:8]}"


def _wf_dir(workflow_id: str) -> Path:
    return WORKFLOWS_DIR / workflow_id


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def list_workflows() -> list[WorkflowSummary]:
    if not WORKFLOWS_DIR.exists():
        return []
    out: list[WorkflowSummary] = []
    for entry in sorted(WORKFLOWS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        cfg_path = entry / "config.yaml"
        if not cfg_path.exists():
            continue
        try:
            data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            name = data.get("name") or entry.name
            out.append(WorkflowSummary(id=entry.name, name=name))
        except Exception:
            continue
    return out


def get_workflow(workflow_id: str) -> Optional[Workflow]:
    d = _wf_dir(workflow_id)
    if not d.is_dir():
        return None
    cfg_path = d / "config.yaml"
    if not cfg_path.exists():
        return None
    data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    config = WorkflowConfig(**data)
    return Workflow(
        id=workflow_id,
        config=config,
        worker_md=_read_text(d / "worker.md"),
        critic_md=_read_text(d / "critic.md"),
        checklist_md=_read_text(d / "checklist.md"),
    )


def _write_workflow_files(d: Path, payload: WorkflowPayload) -> None:
    d.mkdir(parents=True, exist_ok=True)
    cfg_dict = payload.config.model_dump()
    (d / "config.yaml").write_text(
        yaml.safe_dump(cfg_dict, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    _write_text(d / "worker.md", payload.worker_md)
    _write_text(d / "critic.md", payload.critic_md)
    _write_text(d / "checklist.md", payload.checklist_md)


def create_workflow(payload: WorkflowPayload) -> Workflow:
    workflow_id = _new_id(payload.config.name)
    d = _wf_dir(workflow_id)
    _write_workflow_files(d, payload)
    wf = get_workflow(workflow_id)
    assert wf is not None
    return wf


def update_workflow(workflow_id: str, payload: WorkflowPayload) -> Optional[Workflow]:
    d = _wf_dir(workflow_id)
    if not d.is_dir():
        return None
    _write_workflow_files(d, payload)
    return get_workflow(workflow_id)


def delete_workflow(workflow_id: str) -> bool:
    d = _wf_dir(workflow_id)
    if not d.is_dir():
        return False
    shutil.rmtree(d)
    return True
