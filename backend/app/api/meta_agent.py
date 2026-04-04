# api/meta_agent.py
"""Meta-Agent conversational team creation API"""
import uuid
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import TEMPLATES_DIR
from app.api.teams import _safe_id

router = APIRouter(prefix="/meta-agent", tags=["meta-agent"])

# Injected by main.py
_meta_agent = None


def init_meta_agent_api(meta_agent):
    global _meta_agent
    _meta_agent = meta_agent


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str


class FinalizeRequest(BaseModel):
    session_id: str


@router.post("/chat")
async def chat(req: ChatRequest):
    """SSE streaming chat endpoint"""
    if _meta_agent is None:
        raise HTTPException(status_code=500, detail="MetaAgent not initialized")

    session_id = req.session_id or str(uuid.uuid4())[:8]

    async def event_stream():
        # Send session_id first (client needs this on first creation)
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

        async for event in _meta_agent.chat(session_id, req.message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/finalize")
async def finalize(req: FinalizeRequest):
    """[Fallback] Manual finalize — in normal flow, chat already completes this automatically"""
    if _meta_agent is None:
        raise HTTPException(status_code=500, detail="MetaAgent not initialized")

    # If already auto-created, return directly
    template_id = _meta_agent._session_templates.get(req.session_id)
    if template_id:
        name = "custom-team"
        # Try to read the correct name from template file
        template_path = TEMPLATES_DIR / f"{template_id}.yaml"
        if template_path.exists():
            import yaml as _yaml
            with open(template_path, encoding="utf-8") as f:
                data = _yaml.safe_load(f)
            name = data.get("name", name) if data else name
        _meta_agent.clear_session(req.session_id)
        return {"template_id": template_id, "status": "already_created", "name": name}

    # Fallback: legacy logic
    config = _meta_agent.get_team_config(req.session_id)
    if not config:
        raise HTTPException(status_code=400, detail="No valid team configuration found in session")

    # Save as template YAML
    import yaml
    name = config.get("name", "custom-team")
    template_id = _safe_id(name)
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"

    counter = 1
    while file_path.exists():
        template_id = f"{_safe_id(name)}-{counter}"
        file_path = TEMPLATES_DIR / f"{template_id}.yaml"
        counter += 1

    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    # Clean up session
    _meta_agent.clear_session(req.session_id)

    return {"template_id": template_id, "status": "created", "name": name}
