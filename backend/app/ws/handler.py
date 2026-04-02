# ws/handler.py
"""WebSocket 端点"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import ws_manager

router = APIRouter()

# 由 main.py 注入
_orchestrator = None


def init_ws_handler(orchestrator):
    """注入 orchestrator 引用"""
    global _orchestrator
    _orchestrator = orchestrator


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "start_run":
                await ws_manager.broadcast({
                    "type": "system",
                    "data": {"message": "运行已触发"},
                })

            elif msg_type == "goal_decision":
                # 用户对总验收结果的决定: accept / retry
                decision = data.get("decision", "accept")
                if _orchestrator:
                    _orchestrator.resolve_goal_decision(decision)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
