from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.engine import registry
from app.storage import workflow_store as ws
from app.storage import run_store as rs

router = APIRouter()


@router.get("")
def list_workflows() -> list[ws.WorkflowSummary]:
    return ws.list_workflows()


@router.post("", status_code=201)
def create_workflow(payload: ws.WorkflowPayload) -> ws.Workflow:
    return ws.create_workflow(payload)


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str) -> ws.Workflow:
    wf = ws.get_workflow(workflow_id)
    if wf is None:
        raise HTTPException(404, "workflow not found")
    return wf


@router.put("/{workflow_id}")
def update_workflow(workflow_id: str, payload: ws.WorkflowPayload) -> ws.Workflow:
    wf = ws.update_workflow(workflow_id, payload)
    if wf is None:
        raise HTTPException(404, "workflow not found")
    return wf


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str) -> None:
    if not ws.delete_workflow(workflow_id):
        raise HTTPException(404, "workflow not found")


@router.post("/{workflow_id}/duplicate", status_code=201)
def duplicate_workflow(workflow_id: str) -> ws.Workflow:
    src = ws.get_workflow(workflow_id)
    if src is None:
        raise HTTPException(404, "workflow not found")
    payload = ws.WorkflowPayload(
        config=ws.WorkflowConfig(
            name=f"{src.config.name} (copy)",
            max_rounds=src.config.max_rounds,
            worker_model=src.config.worker_model,
            critic_model=src.config.critic_model,
        ),
        worker_md=src.worker_md,
        critic_md=src.critic_md,
        checklist_md=src.checklist_md,
    )
    return ws.create_workflow(payload)


class RunRequest(BaseModel):
    task: str


@router.post("/{workflow_id}/run", status_code=201)
async def run_workflow(workflow_id: str, req: RunRequest) -> rs.RunSnapshot:
    snap = rs.create_run(workflow_id, req.task)
    if snap is None:
        raise HTTPException(404, "workflow not found")
    await registry.start_run(snap.id)
    return snap


@router.get("/{workflow_id}/runs")
def list_runs_for_workflow(workflow_id: str) -> list[rs.RunSummary]:
    if ws.get_workflow(workflow_id) is None:
        raise HTTPException(404, "workflow not found")
    return rs.list_runs(workflow_id)
