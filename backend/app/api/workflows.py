# api/workflows.py
"""Workflow CRUD + run API"""
import asyncio
import re
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Injected by main.py
_workflow_store = None
_single_runner = None
_orchestrator = None
_free_orchestrator = None
_agent_manager = None
_file_comm = None
_run_store = None
_active_runs: dict[str, asyncio.Task] = {}


def init_workflow_api(workflow_store, single_runner, orchestrator, agent_manager, file_comm, run_store, free_orchestrator=None):
    global _workflow_store, _single_runner, _orchestrator, _agent_manager, _file_comm, _run_store, _free_orchestrator
    _workflow_store = workflow_store
    _single_runner = single_runner
    _orchestrator = orchestrator
    _agent_manager = agent_manager
    _file_comm = file_comm
    _run_store = run_store
    _free_orchestrator = free_orchestrator


def _safe_id(name: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff-]", "-", name).strip("-")
    return s[:64] or "workflow"


class WorkflowCreateRequest(BaseModel):
    name: str
    description: str = ""
    type: str = "team"  # "single" | "team"
    template_id: Optional[str] = None
    agent_config: Optional[dict] = None
    default_prompt: str = ""
    default_goal: str = ""


class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    template_id: Optional[str] = None
    agent_config: Optional[dict] = None
    default_prompt: Optional[str] = None
    default_goal: Optional[str] = None


@router.get("")
async def list_workflows():
    if not _workflow_store:
        return []
    return [w.model_dump() for w in _workflow_store.list_workflows()]


@router.get("/{wf_id}")
async def get_workflow(wf_id: str):
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf.model_dump()


@router.post("")
async def create_workflow(req: WorkflowCreateRequest):
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")

    from app.engine.workflow_store import WorkflowConfig

    wf_id = _safe_id(req.name)
    # Avoid ID conflicts
    base_id = wf_id
    counter = 1
    while _workflow_store.get_workflow(wf_id):
        wf_id = f"{base_id}-{counter}"
        counter += 1

    wf = WorkflowConfig(
        id=wf_id,
        name=req.name,
        description=req.description,
        type=req.type,
        template_id=req.template_id,
        agent_config=req.agent_config,
        default_prompt=req.default_prompt,
        default_goal=req.default_goal,
    )
    _workflow_store.save_workflow(wf)
    return wf.model_dump()


@router.put("/{wf_id}")
async def update_workflow(wf_id: str, req: WorkflowUpdateRequest):
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    for field, value in req.model_dump(exclude_none=True).items():
        setattr(wf, field, value)

    _workflow_store.save_workflow(wf)
    return wf.model_dump()


@router.delete("/{wf_id}")
async def delete_workflow(wf_id: str):
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    if not _workflow_store.delete_workflow(wf_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"status": "deleted"}


@router.post("/{wf_id}/run")
async def run_workflow(wf_id: str):
    """One-click workflow execution"""
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")

    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if not wf.default_prompt.strip():
        raise HTTPException(status_code=400, detail="Workflow has no preset task description")

    run_id = str(uuid.uuid4())[:8]

    if wf.type == "single":
        # Single Agent execution
        if not _single_runner:
            raise HTTPException(status_code=500, detail="SingleRunner not initialized")

        task = asyncio.create_task(_single_runner.run(wf, run_id=run_id))
        _active_runs[run_id] = task
        task.add_done_callback(lambda t: _on_run_done(wf_id, run_id, t))

    else:
        # Multi-Agent team execution
        if not _orchestrator:
            raise HTTPException(status_code=500, detail="Orchestrator not initialized")

        # Load template Agents
        if wf.template_id:
            from app.config import TEMPLATES_DIR
            import yaml
            template_path = TEMPLATES_DIR / f"{wf.template_id}.yaml"
            if template_path.exists():
                with open(template_path, encoding="utf-8") as f:
                    template = yaml.safe_load(f)
                execution_mode = template.get("execution_mode", "sequential")
                from app.models.schemas import AgentConfig
                for agent_data in template.get("agents", []):
                    config = AgentConfig(**agent_data)
                    if not _agent_manager.get_agent(config.id):
                        _agent_manager.create_agent(config)

                _orchestrator.execution_mode = execution_mode

        if _run_store:
            _run_store.create_run(run_id, wf.default_prompt, wf.template_id, wf.default_goal or None)

        # Select orchestrator
        execution_mode = getattr(_orchestrator, "execution_mode", "sequential")
        if execution_mode == "free" and _free_orchestrator:
            runner = _free_orchestrator
        else:
            runner = _orchestrator

        task = asyncio.create_task(runner.run(wf.default_prompt, goal=wf.default_goal or None, run_id=run_id))
        _active_runs[run_id] = task
        task.add_done_callback(lambda t: _on_run_done(wf_id, run_id, t))

    return {"status": "started", "run_id": run_id, "workflow_id": wf_id}


def _on_run_done(wf_id: str, run_id: str, task: asyncio.Task):
    _active_runs.pop(run_id, None)
    try:
        exc = task.exception()
        status = "failed" if exc else "completed"
    except (asyncio.CancelledError, Exception):
        status = "cancelled"
    if _workflow_store:
        _workflow_store.update_last_run(wf_id, status)
