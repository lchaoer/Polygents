from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from app.storage import run_store as rs

router = APIRouter()


@router.get("")
def list_runs() -> list[rs.RunSummary]:
    return rs.list_runs()


@router.get("/{run_id}")
def get_run(run_id: str) -> rs.RunSnapshot:
    snap = rs.get_run(run_id)
    if snap is None:
        raise HTTPException(404, "run not found")
    return snap


@router.get("/{run_id}/workspace")
def list_workspace(run_id: str) -> list[dict]:
    files = rs.list_workspace_files(run_id)
    if files is None:
        raise HTTPException(404, "run not found")
    return files


@router.get("/{run_id}/files/{path:path}", response_class=PlainTextResponse)
def read_file(run_id: str, path: str) -> str:
    content = rs.read_run_file(run_id, path)
    if content is None:
        raise HTTPException(404, "file not found")
    return content


@router.post("/{run_id}/cancel")
def cancel_run(run_id: str) -> rs.RunStatus:
    status = rs.update_status(run_id, state="cancelled")
    if status is None:
        raise HTTPException(404, "run not found")
    return status
