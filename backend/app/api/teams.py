# api/teams.py
"""团队管理 API"""
import re
from fastapi import APIRouter, HTTPException
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
    """将名称转化为安全的文件名 ID"""
    s = re.sub(r'[^\w\-]', '-', name.lower().strip())
    return re.sub(r'-+', '-', s).strip('-') or "custom-team"


@router.get("/templates")
async def list_templates():
    """列出所有预设团队模板"""
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
    """获取模板详情"""
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    with open(file_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


@router.post("/templates")
async def create_template(data: TemplateData):
    """创建新模板"""
    template_id = _safe_id(data.name)
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"

    # 如果已存在同名，追加数字
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

    return {"id": template_id, "status": "created"}


@router.put("/templates/{template_id}")
async def update_template(template_id: str, data: TemplateData):
    """更新现有模板"""
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

    return {"id": template_id, "status": "updated"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """删除模板"""
    file_path = TEMPLATES_DIR / f"{template_id}.yaml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    file_path.unlink()
    return {"id": template_id, "status": "deleted"}
