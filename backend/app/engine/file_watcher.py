# engine/file_watcher.py
"""文件变化监控 — 推送到 WebSocket"""
from watchfiles import awatch, Change
from app.ws.manager import ws_manager


async def watch_workspace(path: str):
    """监控工作目录变化，广播到所有 WebSocket 客户端"""
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
