"""Application config — reads config.json with fallback defaults"""
import json
import os
import sys
from pathlib import Path

# Project root path (backend/)
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Defaults ──────────────────────────────────────
_DEFAULTS = {
    "server": {
        "host": "127.0.0.1",
        "port": 8001,
    },
    "agent": {
        "workspace_dir": "./workspace",
        "project_dir": None,
        "max_retries": 3,
        "timeout": 300,
        "max_turns": None,
    },
    "git_bash": {
        "path": None,
    },
}

# ── Load config.json ────────────────────────────
_config_path = BASE_DIR / "config.json"
_user_config: dict = {}
if _config_path.exists():
    with open(_config_path, "r", encoding="utf-8") as f:
        _user_config = json.load(f)


def _get(section: str, key: str):
    """Read from user config, fallback to defaults"""
    return _user_config.get(section, {}).get(key, _DEFAULTS[section][key])


# ── Export config ────────────────────────────────

# Server
HOST: str = _get("server", "host")
PORT: int = _get("server", "port")

# Workspace directory (used by file_comm for inter-agent communication)
_workspace_raw = _get("agent", "workspace_dir")
WORKSPACE_DIR: Path = (
    Path(_workspace_raw) if Path(_workspace_raw).is_absolute()
    else BASE_DIR / _workspace_raw
)

# Project directory (Agent SDK cwd, points to user project if configured)
_project_raw = _get("agent", "project_dir")
PROJECT_DIR: Path | None = (
    Path(_project_raw) if _project_raw else None
)

# Agent retries
MAX_RETRIES: int = _get("agent", "max_retries")

# Agent timeout protection
AGENT_TIMEOUT: int = _get("agent", "timeout")
AGENT_MAX_TURNS: int | None = _get("agent", "max_turns")

# Git Bash (Windows only, required by Agent SDK / Claude Code CLI)
GIT_BASH_PATH: str | None = _get("git_bash", "path")

# Preset template directory
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


def setup_windows_env():
    """Windows-specific: setup ProactorEventLoop + Git Bash path + UTF-8 encoding"""
    if sys.platform != "win32":
        return

    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    # Agent SDK messages may contain emoji and non-GBK chars, force UTF-8
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

    if "CLAUDE_CODE_GIT_BASH_PATH" not in os.environ:
        if GIT_BASH_PATH:
            # User configured in config.json
            os.environ["CLAUDE_CODE_GIT_BASH_PATH"] = GIT_BASH_PATH
        else:
            # Auto-detect common paths
            for p in [
                r"D:\Software\Git\bin\bash.exe",
                r"C:\Program Files\Git\bin\bash.exe",
                r"C:\Program Files (x86)\Git\bin\bash.exe",
            ]:
                if os.path.exists(p):
                    os.environ["CLAUDE_CODE_GIT_BASH_PATH"] = p
                    break
