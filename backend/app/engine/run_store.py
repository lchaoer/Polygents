# engine/run_store.py
"""Run history persistence — each run saved as a JSON file"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from app.models.schemas import RunRecord


class RunStore:
    """Manage run records under workspace/runs/ directory"""

    def __init__(self, workspace_dir: Path):
        self.workspace_dir = workspace_dir
        self.runs_dir = workspace_dir / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self._file_snapshots: dict[str, dict[str, float]] = {}  # run_id -> {path: mtime}

    def _snapshot_workspace(self, run_id: str):
        """Take a snapshot of workspace files (path -> (mtime, size)) before a run starts."""
        snapshot: dict[str, tuple[float, int]] = {}
        for root, dirs, files in os.walk(self.workspace_dir):
            # Skip the runs/ directory itself and hidden dirs
            rel_root = Path(root).relative_to(self.workspace_dir).as_posix()
            if rel_root == ".":
                rel_root = ""
            if rel_root.startswith("runs") or (rel_root and rel_root.startswith(".")):
                continue
            # Also skip hidden subdirs from traversal
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "runs"]
            for fname in files:
                if fname.startswith("."):
                    continue
                full = Path(root) / fname
                rel = full.relative_to(self.workspace_dir).as_posix()
                try:
                    st = full.stat()
                    snapshot[rel] = (st.st_mtime, st.st_size)
                except OSError:
                    pass
        self._file_snapshots[run_id] = snapshot

    def _collect_output_files(self, run_id: str) -> list[dict]:
        """Compare current workspace against pre-run snapshot to find new/modified files."""
        old_snapshot = self._file_snapshots.pop(run_id, {})
        output_files: list[dict] = []

        for root, dirs, files in os.walk(self.workspace_dir):
            rel_root = Path(root).relative_to(self.workspace_dir).as_posix()
            if rel_root == ".":
                rel_root = ""
            if rel_root.startswith("runs") or (rel_root and rel_root.startswith(".")):
                continue
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "runs"]
            for fname in files:
                if fname.startswith("."):
                    continue
                full = Path(root) / fname
                rel = full.relative_to(self.workspace_dir).as_posix()
                try:
                    st = full.stat()
                except OSError:
                    continue
                if rel not in old_snapshot:
                    output_files.append({"path": rel, "size": st.st_size, "action": "created"})
                else:
                    old_mtime, old_size = old_snapshot[rel]
                    if st.st_mtime > old_mtime or st.st_size != old_size:
                        output_files.append({"path": rel, "size": st.st_size, "action": "modified"})

        return output_files

    def create_run(
        self,
        run_id: str,
        prompt: str,
        template_id: Optional[str] = None,
        goal: Optional[str] = None,
    ) -> RunRecord:
        # Snapshot workspace before run starts
        self._snapshot_workspace(run_id)

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
        # Collect output files by diffing against snapshot
        output_files = self._collect_output_files(run_id)

        self.update_run(
            run_id,
            status=status,
            detail=detail,
            end_time=datetime.now(timezone.utc).isoformat(),
            output_files=output_files,
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
