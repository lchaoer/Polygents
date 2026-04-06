# Configuration System Design

**Date:** 2026-04-01
**Status:** Implemented

## Overview

Consolidate all scattered hardcoded configurations into `backend/config.json`, enabling flexible configuration without code changes.

## Configuration File

**Path:** `backend/config.json` (not committed to git)
**Template:** `backend/config.json.example` (committed to git)

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8001
  },
  "agent": {
    "workspace_dir": "./workspace",
    "project_dir": null,
    "max_retries": 3
  },
  "git_bash": {
    "path": null
  }
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `server.host` | `127.0.0.1` | Server bind address |
| `server.port` | `8001` | Server port |
| `agent.workspace_dir` | `./workspace` (relative to backend/) | File communication directory (file_comm) |
| `agent.project_dir` | `null` | Agent SDK cwd, null = use workspace_dir |
| `agent.max_retries` | `3` | Max retry count for Dev→Evaluator closed loop |
| `git_bash.path` | `null` (auto-detect) | Windows only, bash path required by Claude Code CLI |

## Architecture

```mermaid
graph TD
    A[config.json] -->|JSON load| B[config.py]
    C[Defaults] -->|Missing fields| B
    B --> D[HOST / PORT]
    B --> E[WORKSPACE_DIR]
    B --> F[PROJECT_DIR]
    B --> G[MAX_RETRIES]
    B --> H[GIT_BASH_PATH]
    B --> I[setup_windows_env]

    D --> J[main.py<br/>uvicorn startup]
    E --> K[FileComm<br/>File communication]
    F --> L[AgentManager<br/>Agent cwd]
    G --> M[Orchestrator<br/>Retry control]
    I --> N[main.py top-level<br/>ProactorEventLoop + Git Bash]
```

## Agent cwd Logic

```mermaid
graph TD
    A{config.json<br/>has project_dir?}
    A -->|Yes| B[Agent cwd = project_dir<br/>Work in user's project directory]
    A -->|No| C[Agent cwd = workspace_dir<br/>Work in communication directory]

    D[file_comm] -->|Always| E[workspace_dir]

    style B fill:#4a9,color:#fff
    style C fill:#69c,color:#fff
```

**With project_dir:** Agent can read/write user's actual project code, run tests, search codebase
**Without project_dir:** Agent only works within workspace/ via file communication

## Modified Files

1. **`backend/config.json.example`** — Added, configuration template
2. **`backend/app/config.py`** — Rewritten, unified configuration entry point
3. **`backend/app/main.py`** — Simplified, calls `setup_windows_env()`
4. **`backend/app/engine/agent_manager.py`** — Supports project_dir as cwd
5. **`Polygents/.gitignore`** — Added, ignores config.json and WorkSpace/
