import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture
def polygents_root(tmp_path, monkeypatch):
    from app import settings
    from app.storage import run_store, workflow_store

    workflows_dir = tmp_path / "workflows"
    runs_dir = tmp_path / "runs"
    workflows_dir.mkdir()
    runs_dir.mkdir()

    monkeypatch.setattr(settings, "WORKFLOWS_DIR", workflows_dir)
    monkeypatch.setattr(settings, "RUNS_DIR", runs_dir)
    monkeypatch.setattr(workflow_store, "WORKFLOWS_DIR", workflows_dir)
    monkeypatch.setattr(run_store, "RUNS_DIR", runs_dir)

    return tmp_path
