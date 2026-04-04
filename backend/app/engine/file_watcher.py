# engine/file_watcher.py
"""File change watcher — push to WebSocket"""
from watchfiles import awatch, Change
from app.ws.manager import ws_manager


async def watch_workspace(path: str):
    """Watch workspace for changes, broadcast to all WebSocket clients"""
    change_map = {
        Change.added: "created",
        Change.modified: "modified",
        Change.deleted: "deleted",
    }
    async for changes in awatch(path):
        for change_type, file_path in changes:
            await ws_manager.broadcast({
                "type": "file_change",
                "change": change_map[change_type],
                "path": file_path,
            })
