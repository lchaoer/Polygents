# api/agents.py
"""Agent CRUD API"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.models.schemas import AgentConfig

router = APIRouter(prefix="/agents", tags=["agents"])

# Dependency injection
_agent_manager = None
_file_comm = None


def init_agents_api(agent_manager, file_comm):
    global _agent_manager, _file_comm
    _agent_manager = agent_manager
    _file_comm = file_comm


class AgentUpdateBody(BaseModel):
    system_prompt: Optional[str] = None
    tools: Optional[list[str]] = None
    model: Optional[str] = None


class AgentCreateBody(BaseModel):
    id: str
    role: str
    role_type: Optional[str] = None
    system_prompt: str = ""
    tools: list[str] = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
    model: Optional[str] = None


@router.get("")
def list_agents():
    """List all active Agents"""
    agents = []
    for agent_id, inst in _agent_manager.agents.items():
        c = inst.config
        agents.append({
            "id": c.id,
            "role": c.role,
            "role_type": c.role_type,
            "model": c.model,
            "tools": c.tools,
        })
    return agents


@router.get("/{agent_id}")
def get_agent(agent_id: str):
    """Agent details: config + communication history + artifact files"""
    inst = _agent_manager.get_agent(agent_id)
    if not inst:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    c = inst.config
    # Communication history
    inbox = _file_comm.read_inbox(agent_id)
    messages = [
        {
            "from": m["meta"].get("from", ""),
            "to": m["meta"].get("to", ""),
            "type": m["meta"].get("type", ""),
            "timestamp": m["meta"].get("timestamp", ""),
            "content": m["body"][:500],
        }
        for m in inbox
    ]

    # Artifact file list
    artifacts_dir = _file_comm.base_dir / "artifacts" / agent_id
    artifacts = []
    if artifacts_dir.exists():
        for f in sorted(artifacts_dir.rglob("*")):
            if f.is_file():
                artifacts.append(str(f.relative_to(artifacts_dir)))

    return {
        "id": c.id,
        "role": c.role,
        "role_type": c.role_type,
        "model": c.model,
        "tools": c.tools,
        "system_prompt": c.system_prompt,
        "messages": messages,
        "artifacts": artifacts,
    }


@router.put("/{agent_id}")
def update_agent(agent_id: str, body: AgentUpdateBody):
    """Modify Agent configuration at runtime"""
    inst = _agent_manager.get_agent(agent_id)
    if not inst:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    if body.system_prompt is not None:
        inst.config.system_prompt = body.system_prompt
    if body.tools is not None:
        inst.config.tools = body.tools
    if body.model is not None:
        inst.config.model = body.model

    return {"status": "updated", "agent_id": agent_id}


@router.post("")
def create_agent(body: AgentCreateBody):
    """Register a new Agent at runtime"""
    if _agent_manager.get_agent(body.id):
        raise HTTPException(409, f"Agent '{body.id}' already exists")

    config = AgentConfig(
        id=body.id,
        role=body.role,
        system_prompt=body.system_prompt,
        tools=body.tools,
        model=body.model,
        role_type=body.role_type or None,
    )
    _agent_manager.create_agent(config)
    return {"status": "created", "agent_id": body.id}


@router.delete("/{agent_id}")
def delete_agent(agent_id: str):
    """Remove an Agent"""
    if not _agent_manager.get_agent(agent_id):
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    _agent_manager.remove_agent(agent_id)
    return {"status": "deleted", "agent_id": agent_id}
