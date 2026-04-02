# engine/run_store.py
"""运行历史持久化 — 每次 run 存为 JSON 文件"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from app.models.schemas import RunRecord


class RunStore:
    """管理 workspace/runs/ 目录下的运行记录"""

    def __init__(self, workspace_dir: Path):
        self.runs_dir = workspace_dir / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def create_run(
        self,
        run_id: str,
        prompt: str,
        template_id: Optional[str] = None,
        goal: Optional[str] = None,
    ) -> RunRecord:
        record = RunRecord(
            id=run_id,
            template_id=template_id,
            prompt=prompt,
            goal=goal,
            status="running",
            start_time=datetime.now(timezone.utc).isoformat(),
        )
        self._save(record)
        return record

    def update_run(self, run_id: str, **kwargs) -> Optional[RunRecord]:
        record = self.get_run(run_id)
        if not record:
            return None
        for k, v in kwargs.items():
            if hasattr(record, k):
                setattr(record, k, v)
        self._save(record)
        return record

    def complete_run(self, run_id: str, status: str, detail: str = ""):
        self.update_run(
            run_id,
            status=status,
            detail=detail,
            end_time=datetime.now(timezone.utc).isoformat(),
        )

    def get_run(self, run_id: str) -> Optional[RunRecord]:
        path = self.runs_dir / f"{run_id}.json"
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return RunRecord.model_validate_json(f.read())

    def list_runs(self) -> list[RunRecord]:
        records = []
        for p in sorted(self.runs_dir.glob("*.json"), reverse=True):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    records.append(RunRecord.model_validate_json(f.read()))
            except Exception:
                continue
        return records

    def _save(self, record: RunRecord):
        path = self.runs_dir / f"{record.id}.json"
        with open(path, "w", encoding="utf-8") as f:
            f.write(record.model_dump_json(indent=2))
