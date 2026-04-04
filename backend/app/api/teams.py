# api/teams.py
"""Team management API"""
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import yaml

from app.config import TEMPLATES_DIR

router = APIRouter(prefix="/teams", tags=["teams"])


class AgentTemplateData(BaseModel):
    id: str
    role: str
    role_type: Optional[str] = None
    model: Optional[str] = None
    system_prompt: str = ""
    tools: list[str] = []


class TemplateData(BaseModel):
    name: str
    description: str = ""
    agents: list[AgentTemplateData] = []


def _safe_id(name: str) -> str:
    """Convert name to a safe filename ID"""
    s = re.sub(r'[^\w\-]', '-', name.lower().strip())
    return re.sub(r'-+', '-', s).strip('-') or "custom-team"


def _check_role_types(agents: list[AgentTemplateData]) -> list[str]:
    """Check role_type completeness, return list of warnings"""
    role_types = {a.role_type for a in agents if a.role_type}
    warnings = []
    if "planner" not in role_types:
        warnings.append("Missing planner role")
    if "executor" not in role_types:
        warnings.append("Missing executor role")
    if "reviewer" not in role_types:
        warnings.append("Missing reviewer role")
    return warnings


@router.get("/templates")
async def list_templates():
    """List all preset team templates"""
    templates = []
    if TEMPLATES_DIR.exists():
        for f in sorted(TEMPLATES_DIR.glob("*.yaml")):
            with open(f, encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
                templates.append({
                    "id": f.stem,
                    "name": data.get("name", f.stem),
                    "description": data.get("description", ""),
                    "agents": [a.get("role", "") for a in data.get("agents", [])],
                })
    return templates


@router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get template details"""
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    with open(file_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


@router.post("/templates")
async def create_template(data: TemplateData):
    """Create a new template"""
    template_id = _safe_id(data.name)
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"

    # If same name exists, append a number
    counter = 1
    while file_path.exists():
        template_id = f"{_safe_id(data.name)}-{counter}"
        file_path = TEMPLATES_DIR / f"{template_id}.yaml"
        counter += 1

    content = {
        "name": data.name,
        "description": data.description,
        "agents": [a.model_dump(exclude_none=True) for a in data.agents],
    }
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(content, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    return {"id": template_id, "status": "created", "warnings": _check_role_types(data.agents)}


@router.put("/templates/{template_id}")
async def update_template(template_id: str, data: TemplateData):
    """Update an existing template"""
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    content = {
        "name": data.name,
        "description": data.description,
        "agents": [a.model_dump(exclude_none=True) for a in data.agents],
    }
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(content, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    return {"id": template_id, "status": "updated", "warnings": _check_role_types(data.agents)}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """Delete a template"""
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    file_path.unlink()
    return {"id": template_id, "status": "deleted"}


@router.get("/templates/{template_id}/export", response_class=PlainTextResponse)
async def export_template(template_id: str):
    """Export template as raw YAML"""
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    return file_path.read_text(encoding="utf-8")


class ImportPayload(BaseModel):
    yaml_text: str


@router.post("/templates/import")
async def import_template(payload: ImportPayload):
    """Import template from YAML text"""
    try:
        data = yaml.safe_load(payload.yaml_text)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"YAML parse failed: {e}")

    if not isinstance(data, dict) or "name" not in data:
        raise HTTPException(status_code=400, detail="YAML missing 'name' field")

    template_id = _safe_id(data["name"])
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"

    counter = 1
    while file_path.exists():
        template_id = f"{_safe_id(data['name'])}-{counter}"
        file_path = TEMPLATES_DIR / f"{template_id}.yaml"
        counter += 1

    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    return {"id": template_id, "status": "imported"}
