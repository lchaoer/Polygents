# api/router.py
"""REST 路由聚合"""
from fastapi import APIRouter
from app.api.teams import router as teams_router
from app.api.runs import router as runs_router
from app.api.workspace import router as workspace_router

api_router = APIRouter()
api_router.include_router(teams_router)
api_router.include_router(runs_router)
api_router.include_router(workspace_router)
