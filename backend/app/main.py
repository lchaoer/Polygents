# Setup Windows environment at module level (must run before any asyncio/SDK operations)
import sys
from app.config import setup_windows_env
setup_windows_env()

"""Polygents backend entry point"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import HOST, PORT, WORKSPACE_DIR, PROJECT_DIR, MAX_RETRIES
from app.ws.handler import router as ws_router, init_ws_handler
from app.ws.manager import ws_manager
from app.engine.file_watcher import watch_workspace
from app.engine.file_comm import FileComm
from app.engine.agent_manager import AgentManager
from app.engine.orchestrator import Orchestrator
from app.providers.claude_provider import ClaudeProvider
from app.api.router import api_router
from app.api.runs import init_run_api
from app.engine.run_store import RunStore
from app.api.workspace import init_workspace_api
from app.engine.meta_agent import MetaAgent
from app.api.meta_agent import init_meta_agent_api
from app.api.agents import init_agents_api
from app.api.logs import init_logs_api
from app.engine.free_orchestrator import FreeOrchestrator
from app.engine.workflow_store import WorkflowStore
from app.engine.single_runner import SingleRunner
from app.api.workflows import init_workflow_api
from app.api.skills import init_skills_api

# Global instances
file_comm = FileComm(WORKSPACE_DIR)
provider = ClaudeProvider()
agent_manager = AgentManager(provider=provider, file_comm=file_comm)
run_store = RunStore(WORKSPACE_DIR)
workflow_store = WorkflowStore(WORKSPACE_DIR)
orchestrator = Orchestrator(
    agent_manager=agent_manager, file_comm=file_comm,
    max_retries=MAX_RETRIES, run_store=run_store,
)
free_orchestrator = FreeOrchestrator(
    agent_manager=agent_manager, file_comm=file_comm,
    run_store=run_store,
)
single_runner = SingleRunner(
    agent_manager=agent_manager, file_comm=file_comm,
    run_store=run_store,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize workspace directory
    file_comm.init_workspace()

    # Start file watcher
    watcher_task = asyncio.create_task(watch_workspace(str(WORKSPACE_DIR)))

    # Connect orchestrator status notifications to WebSocket
    async def on_status(status: str, detail: str):
        run_id = (
            orchestrator._current_run_id
            or single_runner._current_run_id
            or free_orchestrator._current_run_id
        )
        ts = datetime.now(timezone.utc).isoformat()
        # goal_not_met uses a separate message type for frontend distinction
        if status == "goal_not_met":
            msg_type = "goal_validation"
        else:
            msg_type = "run_status"
        await ws_manager.broadcast({
            "type": msg_type,
            "data": {"status": status, "detail": detail, "run_id": run_id, "timestamp": ts},
        })
    orchestrator.on_status = on_status
    free_orchestrator.on_status = on_status
    single_runner.on_status = on_status

    # Connect Agent activity notifications to WebSocket
    async def on_activity(agent_id: str, action: str, detail: str):
        run_id = (
            orchestrator._current_run_id
            or single_runner._current_run_id
            or free_orchestrator._current_run_id
        )
        ts = datetime.now(timezone.utc).isoformat()
        await ws_manager.broadcast({
            "type": "agent_activity",
            "data": {"agent_id": agent_id, "action": action, "detail": detail, "run_id": run_id, "timestamp": ts},
        })
    agent_manager.on_activity = on_activity

    # Connect task status notifications to WebSocket
    async def on_task_update(task_id: str, description: str, status: str, assignee: str, attempt: int):
        run_id = (
            orchestrator._current_run_id
            or single_runner._current_run_id
            or free_orchestrator._current_run_id
        )
        ts = datetime.now(timezone.utc).isoformat()
        await ws_manager.broadcast({
            "type": "task_update",
            "data": {
                "task_id": task_id, "description": description,
                "status": status, "assignee": assignee,
                "attempt": attempt, "run_id": run_id, "timestamp": ts,
            },
        })
    orchestrator.on_task_update = on_task_update

    # Inject dependencies into API
    init_run_api(orchestrator, agent_manager, file_comm, run_store, free_orchestrator=free_orchestrator)
    init_workspace_api(WORKSPACE_DIR)
    init_agents_api(agent_manager, file_comm)
    init_logs_api(WORKSPACE_DIR)
    meta_agent = MetaAgent(provider=provider, agent_manager=agent_manager, file_comm=file_comm)
    init_meta_agent_api(meta_agent)
    init_workflow_api(
        workflow_store, single_runner, orchestrator,
        agent_manager, file_comm, run_store,
        free_orchestrator=free_orchestrator,
    )
    init_skills_api(WORKSPACE_DIR, PROJECT_DIR)

    # Inject orchestrator into WebSocket handler
    init_ws_handler(orchestrator)

    print(f"Polygents backend started. Workspace: {WORKSPACE_DIR}")
    yield
    watcher_task.cancel()
    print("Polygents backend stopped.")


app = FastAPI(title="Polygents", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(api_router, prefix="/api")
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn
    # Cannot use reload mode on Windows (resets event loop policy, causing subprocess failures)
    use_reload = sys.platform != "win32"
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=use_reload)
