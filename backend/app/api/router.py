# api/router.py
"""REST route aggregation"""
from fastapi import APIRouter
from app.api.teams import router as teams_router
from app.api.runs import router as runs_router
from app.api.workspace import router as workspace_router
from app.api.meta_agent import router as meta_agent_router
from app.api.agents import router as agents_router
from app.api.logs import router as logs_router
from app.api.workflows import router as workflows_router
from app.api.skills import router as skills_router
from app.api.plugins import router as plugins_router

api_router = APIRouter()
api_router.include_router(teams_router)
api_router.include_router(runs_router)
api_router.include_router(workspace_router)
api_router.include_router(meta_agent_router)
api_router.include_router(agents_router)
api_router.include_router(logs_router)
api_router.include_router(workflows_router)
api_router.include_router(skills_router)
api_router.include_router(plugins_router)
