# ws/handler.py
"""WebSocket endpoint"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import ws_manager

router = APIRouter()

# Injected by main.py
_orchestrator = None


def init_ws_handler(orchestrator):
    """Inject orchestrator reference"""
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
                    "data": {"message": "Run triggered"},
                })

            elif msg_type == "goal_decision":
                # User's decision on final validation result: accept / retry
                decision = data.get("decision", "accept")
                if _orchestrator:
                    _orchestrator.resolve_goal_decision(decision)

            elif msg_type == "pause_run":
                if _orchestrator:
                    await _orchestrator.pause()

            elif msg_type == "resume_run":
                if _orchestrator:
                    await _orchestrator.resume()

            elif msg_type == "intervene":
                if _orchestrator:
                    action = data.get("action", "")
                    payload = data.get("payload", {})
                    await _orchestrator.intervene(action, payload)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
