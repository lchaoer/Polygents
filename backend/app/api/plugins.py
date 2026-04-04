# api/plugins.py
"""Plugin discovery API — reads installed Claude Code plugins for frontend selection"""
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/plugins", tags=["plugins"])


def _read_installed_plugins() -> dict:
    """Read ~/.claude/plugins/installed_plugins.json"""
    path = Path.home() / ".claude" / "plugins" / "installed_plugins.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("plugins", {})
    except (json.JSONDecodeError, OSError):
        return {}


@router.get("/available")
def list_available_plugins():
    """List all installed Claude Code plugins"""
    plugins_map = _read_installed_plugins()
    result = []
    for key, entries in plugins_map.items():
        # key format: "name@source", e.g. "playwright@claude-plugins-official"
        name = key.split("@")[0] if "@" in key else key
        for entry in entries:
            result.append({
                "name": name,
                "scope": entry.get("scope", "user"),
                "install_path": entry.get("installPath", ""),
                "version": entry.get("version", ""),
            })
    return result


def resolve_plugin_paths(plugin_names: list[str]) -> list[dict]:
    """Resolve plugin name list to SDK format [{type: "local", path: "..."}]"""
    if not plugin_names:
        return []
    plugins_map = _read_installed_plugins()
    result = []
    for pname in plugin_names:
        for key, entries in plugins_map.items():
            key_name = key.split("@")[0] if "@" in key else key
            if key_name == pname and entries:
                install_path = entries[0].get("installPath", "")
                if install_path:
                    result.append({"type": "local", "path": install_path})
                break
    return result
