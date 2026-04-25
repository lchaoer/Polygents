from pathlib import Path
import os

REPO_ROOT = Path(os.environ.get("POLYGENTS_ROOT", Path(__file__).resolve().parents[2]))
WORKFLOWS_DIR = REPO_ROOT / "workflows"
RUNS_DIR = REPO_ROOT / "runs"


def ensure_dirs() -> None:
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
