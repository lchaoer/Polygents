# 在模块顶层设置 Windows 环境（必须在任何 asyncio/SDK 操作之前）
import sys
from app.config import setup_windows_env
setup_windows_env()

"""Polygents 后端入口"""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import HOST, PORT, WORKSPACE_DIR, MAX_RETRIES
from app.ws.handler import router as ws_router, init_ws_handler
from app.ws.manager import ws_manager
from app.engine.file_watcher import watch_workspace
from app.engine.file_comm import FileComm
from app.engine.agent_manager import AgentManager
from app.engine.orchestrator import Orchestrator
from app.providers.claude_provider import ClaudeProvider
from app.api.router import api_router
from app.api.runs import init_run_api
from app.engine.run_store import RunStore
from app.api.workspace import init_workspace_api

# 全局实例
file_comm = FileComm(WORKSPACE_DIR)
provider = ClaudeProvider()
agent_manager = AgentManager(provider=provider, file_comm=file_comm)
run_store = RunStore(WORKSPACE_DIR)
orchestrator = Orchestrator(
    agent_manager=agent_manager, file_comm=file_comm,
    max_retries=MAX_RETRIES, run_store=run_store,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 初始化工作目录
    file_comm.init_workspace()

    # 启动文件监控
    watcher_task = asyncio.create_task(watch_workspace(str(WORKSPACE_DIR)))

    # 连接 orchestrator 状态通知到 WebSocket
    async def on_status(status: str, detail: str):
        # goal_not_met 用独立消息类型，前端好区分
        if status == "goal_not_met":
            msg_type = "goal_validation"
        else:
            msg_type = "run_status"
        await ws_manager.broadcast({
            "type": msg_type,
            "data": {"status": status, "detail": detail},
        })
    orchestrator.on_status = on_status

    # 连接 Agent 活动通知到 WebSocket
    async def on_activity(agent_id: str, action: str, detail: str):
        await ws_manager.broadcast({
            "type": "agent_activity",
            "data": {"agent_id": agent_id, "action": action, "detail": detail},
        })
    agent_manager.on_activity = on_activity

    # 注入依赖到 API
    init_run_api(orchestrator, agent_manager, file_comm, run_store)
    init_workspace_api(WORKSPACE_DIR)

    # 注入 orchestrator 到 WebSocket handler
    init_ws_handler(orchestrator)

    print(f"Polygents backend started. Workspace: {WORKSPACE_DIR}")
    yield
    watcher_task.cancel()
    print("Polygents backend stopped.")


app = FastAPI(title="Polygents", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由
app.include_router(api_router, prefix="/api")
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn
    # Windows 下不能用 reload 模式（会重置 event loop policy 导致 subprocess 失败）
    use_reload = sys.platform != "win32"
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=use_reload)
