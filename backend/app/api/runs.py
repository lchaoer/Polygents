import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.engine import broker, registry
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


@router.get("/{run_id}/diff/{kind}/{round_n}", response_class=PlainTextResponse)
def get_round_diff(run_id: str, kind: str, round_n: int) -> str:
    if kind not in ("report", "review"):
        raise HTTPException(400, "kind must be 'report' or 'review'")
    if rs.get_run(run_id) is None:
        raise HTTPException(404, "run not found")
    out = rs.diff_round(run_id, round_n, kind=kind)
    if out is None:
        raise HTTPException(404, "round not found")
    return out


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str) -> rs.RunStatus:
    if rs.get_run(run_id) is None:
        raise HTTPException(404, "run not found")
    await registry.cancel_run(run_id)
    status = rs.update_status(run_id, state="cancelled")
    return status


async def _event_stream(run_id: str):
    async with broker.subscribe(run_id) as queue:
        yield ": connected\n\n"
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            if event.get("type") == "_eof":
                yield "event: end\ndata: {}\n\n"
                return
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.get("/{run_id}/events")
async def run_events(run_id: str):
    if rs.get_run(run_id) is None:
        raise HTTPException(404, "run not found")
    return StreamingResponse(
        _event_stream(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
