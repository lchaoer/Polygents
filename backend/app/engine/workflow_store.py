# engine/workflow_store.py
"""Workflow persistence — each workflow saved as a YAML file"""
import yaml
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field


class WorkflowConfig(BaseModel):
    """Workflow configuration"""
    id: str
    name: str
    description: str = ""
    type: str = "team"  # "single" | "team"
    template_id: Optional[str] = None  # Template for multi-Agent mode
    agent_config: Optional[dict] = None  # Config for single-Agent mode
    default_prompt: str = ""
    default_goal: str = ""
    created_at: str = ""
    last_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    schedule: Optional[dict] = None  # {"cron": "0 9 * * *", "enabled": True}
    enable_memory: bool = False


class WorkflowStore:
    """Manage workflow files under workspace/workflows/ directory"""

    def __init__(self, workspace_dir: Path):
        self.workflows_dir = workspace_dir / "workflows"
        self.workflows_dir.mkdir(parents=True, exist_ok=True)

    def list_workflows(self) -> list[WorkflowConfig]:
        results = []
        for p in sorted(self.workflows_dir.glob("*.yaml"), reverse=True):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data:
                    results.append(WorkflowConfig(**data))
            except Exception:
                continue
        return results

    def get_workflow(self, wf_id: str) -> Optional[WorkflowConfig]:
        path = self.workflows_dir / f"{wf_id}.yaml"
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return WorkflowConfig(**data) if data else None

    def save_workflow(self, wf: WorkflowConfig) -> WorkflowConfig:
        if not wf.created_at:
            wf.created_at = datetime.now(timezone.utc).isoformat()
        path = self.workflows_dir / f"{wf.id}.yaml"
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(
                wf.model_dump(exclude_none=True),
                f, allow_unicode=True, default_flow_style=False, sort_keys=False,
            )
        return wf

    def delete_workflow(self, wf_id: str) -> bool:
        path = self.workflows_dir / f"{wf_id}.yaml"
        if path.exists():
            path.unlink()
            return True
        return False

    def update_last_run(self, wf_id: str, status: str):
        wf = self.get_workflow(wf_id)
        if wf:
            wf.last_run_at = datetime.now(timezone.utc).isoformat()
            wf.last_run_status = status
            self.save_workflow(wf)
