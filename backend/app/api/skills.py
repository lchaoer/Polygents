# api/skills.py
"""Skill file management API — manage markdown skill files under .claude/skills/"""
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/skills", tags=["skills"])

# Injected at runtime by main.py
_skills_dir: Path | None = None


def init_skills_api(workspace_dir: Path, project_dir: Path | None = None):
    """Initialize skills directory path"""
    global _skills_dir
    # Skill files are placed in the Agent's cwd directory
    base = project_dir if project_dir else workspace_dir
    _skills_dir = base / ".claude" / "skills"
    _skills_dir.mkdir(parents=True, exist_ok=True)


def _get_skills_dir() -> Path:
    if _skills_dir is None:
        raise HTTPException(500, "Skills not initialized")
    _skills_dir.mkdir(parents=True, exist_ok=True)
    return _skills_dir


def _safe_name(name: str) -> str:
    """Sanitize filename, keep only safe characters"""
    name = name.strip()
    # Allow CJK characters, letters, digits, hyphens, underscores
    name = re.sub(r'[^\w\u4e00-\u9fff\-]', '-', name)
    return name or "untitled"


class SkillCreate(BaseModel):
    name: str
    description: str = ""
    content: str = ""


class SkillUpdate(BaseModel):
    description: str | None = None
    content: str | None = None


def _scan_skills_dir(directory: Path, source: str) -> list[dict]:
    """Scan skill files in the specified directory"""
    result = []
    if not directory.exists():
        return result
    for f in sorted(directory.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        name = f.stem
        description = ""
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                for line in parts[1].strip().splitlines():
                    if line.startswith("description:"):
                        description = line.split(":", 1)[1].strip().strip('"').strip("'")
                        break
        result.append({
            "name": name,
            "description": description,
            "source": source,
            "file": f.name,
        })
    return result


@router.get("/available")
def list_available_skills():
    """List all available skills (project-level + user-level)"""
    skills = []
    # Project-level
    skills.extend(_scan_skills_dir(_get_skills_dir(), "project"))
    # User-level
    user_skills_dir = Path.home() / ".claude" / "skills"
    skills.extend(_scan_skills_dir(user_skills_dir, "user"))
    return skills


@router.get("")
def list_skills():
    """List all skill files"""
    skills_dir = _get_skills_dir()
    result = []
    for f in sorted(skills_dir.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        name = f.stem
        description = ""
        # Parse description from frontmatter
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                for line in parts[1].strip().splitlines():
                    if line.startswith("description:"):
                        description = line.split(":", 1)[1].strip().strip('"').strip("'")
                        break
        result.append({
            "name": name,
            "description": description,
            "file": f.name,
        })
    return result


@router.get("/{name}")
def get_skill(name: str):
    """Read a single skill's content"""
    skills_dir = _get_skills_dir()
    f = skills_dir / f"{name}.md"
    if not f.exists():
        raise HTTPException(404, f"Skill '{name}' not found")
    text = f.read_text(encoding="utf-8")
    description = ""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].strip().splitlines():
                if line.startswith("description:"):
                    description = line.split(":", 1)[1].strip().strip('"').strip("'")
                    break
    return {"name": name, "description": description, "content": text}


@router.post("")
def create_skill(body: SkillCreate):
    """Create a new skill file"""
    skills_dir = _get_skills_dir()
    safe = _safe_name(body.name)
    f = skills_dir / f"{safe}.md"
    if f.exists():
        raise HTTPException(409, f"Skill '{safe}' already exists")

    # Build skill content (auto-add frontmatter if missing)
    content = body.content.strip()
    if not content.startswith("---"):
        content = f"""---
name: {body.name}
description: {body.description}
---

{content}"""

    f.write_text(content, encoding="utf-8")
    return {"name": safe, "file": f.name}


@router.put("/{name}")
def update_skill(name: str, body: SkillUpdate):
    """Update a skill file"""
    skills_dir = _get_skills_dir()
    f = skills_dir / f"{name}.md"
    if not f.exists():
        raise HTTPException(404, f"Skill '{name}' not found")

    if body.content is not None:
        f.write_text(body.content.strip(), encoding="utf-8")
    return {"name": name, "updated": True}


@router.delete("/{name}")
def delete_skill(name: str):
    """Delete a skill file"""
    skills_dir = _get_skills_dir()
    f = skills_dir / f"{name}.md"
    if not f.exists():
        raise HTTPException(404, f"Skill '{name}' not found")
    f.unlink()
    return {"name": name, "deleted": True}
