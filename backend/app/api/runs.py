# api/runs.py
"""运行控制 API"""
import asyncio
import uuid
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/runs", tags=["runs"])

# 引用全局实例（在 main.py 中设置）
_orchestrator = None
_agent_manager = None
_file_comm = None
_run_store = None
_background_tasks: set[asyncio.Task] = set()


def init_run_api(orchestrator, agent_manager, file_comm, run_store=None):
    """注入依赖（由 main.py 调用）"""
    global _orchestrator, _agent_manager, _file_comm, _run_store
    _orchestrator = orchestrator
    _agent_manager = agent_manager
    _file_comm = file_comm
    _run_store = run_store


class StartRunRequest(BaseModel):
    prompt: str
    template_id: str | None = None
    goal: str | None = None


@router.post("/start")
async def start_run(req: StartRunRequest):
    """启动一次运行"""
    if _orchestrator is None:
        return {"error": "Engine not initialized"}

    # 如果指定了模板，加载并创建 Agent
    if req.template_id:
        from app.config import TEMPLATES_DIR
        import yaml
        template_path = TEMPLATES_DIR / f"{req.template_id}.yaml"
        if template_path.exists():
            with open(template_path, encoding="utf-8") as f:
                template = yaml.safe_load(f)
            from app.models.schemas import AgentConfig
            for agent_data in template.get("agents", []):
                config = AgentConfig(**agent_data)
                _agent_manager.create_agent(config)

    # 创建运行记录
    run_id = str(uuid.uuid4())[:8]
    if _run_store:
        _run_store.create_run(run_id, req.prompt, req.template_id, req.goal)

    # 在后台启动运行
    task = asyncio.create_task(_orchestrator.run(req.prompt, goal=req.goal, run_id=run_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return {"status": "started", "prompt": req.prompt, "goal": req.goal, "run_id": run_id}


@router.get("/status")
async def get_status():
    """获取当前运行状态"""
    return {
        "agents": _agent_manager.list_agents() if _agent_manager else [],
    }


@router.get("/history")
async def list_history():
    """获取运行历史列表"""
    if not _run_store:
        return []
    return [r.model_dump() for r in _run_store.list_runs()]


@router.get("/history/{run_id}")
async def get_history(run_id: str):
    """获取单次运行详情"""
    if not _run_store:
        return {"error": "RunStore not configured"}
    record = _run_store.get_run(run_id)
    if not record:
        return {"error": "Run not found"}
    return record.model_dump()
