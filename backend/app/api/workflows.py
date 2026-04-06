# api/workflows.py
"""Workflow CRUD + run API"""
import asyncio
import json
import re
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app.models.schemas import AgentConfig

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
    enable_memory: bool = False


class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    template_id: Optional[str] = None
    agent_config: Optional[dict] = None
    default_prompt: Optional[str] = None
    default_goal: Optional[str] = None
    schedule: Optional[dict] = None
    enable_memory: Optional[bool] = None


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
        enable_memory=req.enable_memory,
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

    for field, value in req.model_dump(exclude_unset=True).items():
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


class QuickTaskRequest(BaseModel):
    prompt: str
    model: Optional[str] = None


@router.post("/quick-task")
async def quick_task(req: QuickTaskRequest):
    """Quick task: instant single-agent execution with SSE streaming"""
    if not _agent_manager:
        raise HTTPException(status_code=500, detail="AgentManager not initialized")

    agent_id = f"quick-{str(uuid.uuid4())[:8]}"

    async def event_stream():
        agent = None
        try:
            config = AgentConfig(
                id=agent_id,
                role="QuickTask",
                system_prompt="You are a helpful assistant. Complete the user's task directly and concisely.",
                tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                model=req.model,
            )
            agent = _agent_manager.create_agent(config)
            result = await agent.execute(req.prompt)
            yield f"data: {json.dumps({'type': 'text_delta', 'content': result}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'completed'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            if agent and _agent_manager:
                _agent_manager.agents.pop(agent_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{wf_id}/clone")
async def clone_workflow(wf_id: str):
    """Clone a workflow"""
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    from app.engine.workflow_store import WorkflowConfig

    new_name = f"{wf.name} (Copy)"
    new_id = _safe_id(new_name)
    base_id = new_id
    counter = 1
    while _workflow_store.get_workflow(new_id):
        new_id = f"{base_id}-{counter}"
        counter += 1

    clone = WorkflowConfig(
        id=new_id,
        name=new_name,
        description=wf.description,
        type=wf.type,
        template_id=wf.template_id,
        agent_config=wf.agent_config,
        default_prompt=wf.default_prompt,
        default_goal=wf.default_goal,
    )
    _workflow_store.save_workflow(clone)
    return clone.model_dump()


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

        task = asyncio.create_task(runner.run(wf.default_prompt, goal=wf.default_goal or None, run_id=run_id, enable_memory=getattr(wf, "enable_memory", False)))
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


async def run_workflow_by_id(wf_id: str):
    """Trigger a workflow run by ID — used by scheduler and API."""
    if not _workflow_store:
        return
    wf = _workflow_store.get_workflow(wf_id)
    if not wf or not wf.default_prompt.strip():
        return

    run_id = str(uuid.uuid4())[:8]

    if wf.type == "single":
        if not _single_runner:
            return
        task = asyncio.create_task(_single_runner.run(wf, run_id=run_id))
    else:
        if not _orchestrator:
            return
        if wf.template_id:
            from app.config import TEMPLATES_DIR
            import yaml
            template_path = TEMPLATES_DIR / f"{wf.template_id}.yaml"
            if template_path.exists():
                with open(template_path, encoding="utf-8") as f:
                    template = yaml.safe_load(f)
                execution_mode = template.get("execution_mode", "sequential")
                for agent_data in template.get("agents", []):
                    config = AgentConfig(**agent_data)
                    if not _agent_manager.get_agent(config.id):
                        _agent_manager.create_agent(config)
                _orchestrator.execution_mode = execution_mode

        if _run_store:
            _run_store.create_run(run_id, wf.default_prompt, wf.template_id, wf.default_goal or None)

        execution_mode = getattr(_orchestrator, "execution_mode", "sequential")
        if execution_mode == "free" and _free_orchestrator:
            runner = _free_orchestrator
        else:
            runner = _orchestrator
        task = asyncio.create_task(runner.run(wf.default_prompt, goal=wf.default_goal or None, run_id=run_id, enable_memory=getattr(wf, "enable_memory", False)))

    _active_runs[run_id] = task
    task.add_done_callback(lambda t: _on_run_done(wf_id, run_id, t))


class ScheduleRequest(BaseModel):
    enabled: bool = True
    cron: str = "0 9 * * *"


@router.post("/{wf_id}/schedule")
async def update_schedule(wf_id: str, req: ScheduleRequest):
    """Enable or update schedule for a workflow."""
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf.schedule = {"enabled": req.enabled, "cron": req.cron}
    _workflow_store.save_workflow(wf)
    return {"status": "ok", "schedule": wf.schedule}


@router.delete("/{wf_id}/schedule")
async def disable_schedule(wf_id: str):
    """Disable schedule for a workflow."""
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf.schedule = None
    _workflow_store.save_workflow(wf)
    return {"status": "ok"}
