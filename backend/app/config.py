"""应用配置 — 统一读取 config.json，缺失字段用默认值"""
import json
import os
import sys
from pathlib import Path

# 项目根路径（backend/）
BASE_DIR = Path(__file__).resolve().parent.parent

# ── 默认值 ──────────────────────────────────────
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

# ── 加载 config.json ────────────────────────────
_config_path = BASE_DIR / "config.json"
_user_config: dict = {}
if _config_path.exists():
    with open(_config_path, "r", encoding="utf-8") as f:
        _user_config = json.load(f)


def _get(section: str, key: str):
    """从 user config 读取，没有就用默认值"""
    return _user_config.get(section, {}).get(key, _DEFAULTS[section][key])


# ── 导出配置 ────────────────────────────────────

# 服务器
HOST: str = _get("server", "host")
PORT: int = _get("server", "port")

# 工作目录（file_comm 通信用，始终在这里）
_workspace_raw = _get("agent", "workspace_dir")
WORKSPACE_DIR: Path = (
    Path(_workspace_raw) if Path(_workspace_raw).is_absolute()
    else BASE_DIR / _workspace_raw
)

# 项目目录（Agent SDK 的 cwd，如果配了就指向用户项目）
_project_raw = _get("agent", "project_dir")
PROJECT_DIR: Path | None = (
    Path(_project_raw) if _project_raw else None
)

# Agent 重试
MAX_RETRIES: int = _get("agent", "max_retries")

# Agent 超时保护
AGENT_TIMEOUT: int = _get("agent", "timeout")
AGENT_MAX_TURNS: int | None = _get("agent", "max_turns")

# Git Bash（仅 Windows，Agent SDK / Claude Code CLI 需要）
GIT_BASH_PATH: str | None = _get("git_bash", "path")

# 预设模板目录
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


def setup_windows_env():
    """Windows 专用：设置 ProactorEventLoop + Git Bash 路径 + UTF-8 编码"""
    if sys.platform != "win32":
        return

    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    # Agent SDK 的消息可能包含 emoji 等非 GBK 字符，强制 UTF-8
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

    if "CLAUDE_CODE_GIT_BASH_PATH" not in os.environ:
        if GIT_BASH_PATH:
            # 用户在 config.json 里配了
            os.environ["CLAUDE_CODE_GIT_BASH_PATH"] = GIT_BASH_PATH
        else:
            # 自动探测常见路径
            for p in [
                r"D:\Software\Git\bin\bash.exe",
                r"C:\Program Files\Git\bin\bash.exe",
                r"C:\Program Files (x86)\Git\bin\bash.exe",
            ]:
                if os.path.exists(p):
                    os.environ["CLAUDE_CODE_GIT_BASH_PATH"] = p
                    break
