# api/runs.py
"""Run control API"""
import asyncio
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/runs", tags=["runs"])

# References to global instances (set in main.py)
_orchestrator = None
_free_orchestrator = None
_agent_manager = None
_file_comm = None
_run_store = None
_active_runs: dict[str, asyncio.Task] = {}


def init_run_api(orchestrator, agent_manager, file_comm, run_store=None, free_orchestrator=None):
    """Inject dependencies (called by main.py)"""
    global _orchestrator, _agent_manager, _file_comm, _run_store, _free_orchestrator
    _orchestrator = orchestrator
    _agent_manager = agent_manager
    _file_comm = file_comm
    _run_store = run_store
    _free_orchestrator = free_orchestrator


class StartRunRequest(BaseModel):
    prompt: str
    template_id: str | None = None
    goal: str | None = None


@router.post("/start")
async def start_run(req: StartRunRequest):
    """Start a run"""
    if _orchestrator is None:
        return {"error": "Engine not initialized"}

    # If a template is specified, load and create Agents
    execution_mode = "sequential"
    if req.template_id:
        from app.config import TEMPLATES_DIR
        import yaml
        template_path = TEMPLATES_DIR / f"{req.template_id}.yaml"
        if template_path.exists():
            with open(template_path, encoding="utf-8") as f:
                template = yaml.safe_load(f)
            execution_mode = template.get("execution_mode", "sequential")
            from app.models.schemas import AgentConfig
            for agent_data in template.get("agents", []):
                config = AgentConfig(**agent_data)
                if not _agent_manager.get_agent(config.id):
                    _agent_manager.create_agent(config)

    # Set execution mode
    _orchestrator.execution_mode = execution_mode

    # Create run record
    run_id = str(uuid.uuid4())[:8]
    if _run_store:
        _run_store.create_run(run_id, req.prompt, req.template_id, req.goal)

    # Select orchestrator based on execution mode
    if execution_mode == "free" and _free_orchestrator:
        runner = _free_orchestrator
    else:
        runner = _orchestrator

    # Start run in background
    task = asyncio.create_task(runner.run(req.prompt, goal=req.goal, run_id=run_id))
    _active_runs[run_id] = task
    task.add_done_callback(lambda t: _active_runs.pop(run_id, None))

    return {"status": "started", "prompt": req.prompt, "goal": req.goal, "run_id": run_id}


@router.get("/status")
async def get_status():
    """Get current run status"""
    return {
        "agents": _agent_manager.list_agents() if _agent_manager else [],
    }


@router.get("/history")
async def list_history():
    """Get run history list"""
    if not _run_store:
        return []
    return [r.model_dump() for r in _run_store.list_runs()]


@router.get("/history/{run_id}")
async def get_history(run_id: str):
    """Get details of a single run"""
    if not _run_store:
        return {"error": "RunStore not configured"}
    record = _run_store.get_run(run_id)
    if not record:
        raise HTTPException(status_code=404, detail="Run not found")
    return record.model_dump()


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str):
    """Cancel a running task"""
    task = _active_runs.get(run_id)
    if not task:
        raise HTTPException(status_code=404, detail="Run not found or already finished")
    task.cancel()
    if _run_store:
        _run_store.complete_run(run_id, "cancelled", "Manually cancelled by user")
    return {"status": "cancelled", "run_id": run_id}
