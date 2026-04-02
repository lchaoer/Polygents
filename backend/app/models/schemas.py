"""数据模型定义"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    review = "review"
    completed = "completed"
    rejected = "rejected"


class RoleType(str, Enum):
    """Agent 角色类型 — 编排引擎按此查找 Agent"""
    planner = "planner"
    executor = "executor"
    reviewer = "reviewer"


class AgentConfig(BaseModel):
    """Agent 配置"""
    id: str
    role: str
    system_prompt: str
    tools: list[str] = Field(default_factory=list)
    provider: str = "claude"
    model: Optional[str] = None  # e.g. "claude-sonnet-4-6", "claude-opus-4-6"
    role_type: Optional[RoleType] = None


class TeamConfig(BaseModel):
    """团队配置"""
    name: str
    agents: list[AgentConfig]
    max_retries: int = 3


class TaskItem(BaseModel):
    """任务项"""
    id: str
    description: str
    assignee: str
    depends_on: list[str] = Field(default_factory=list)
    output: Optional[str] = None
    status: TaskStatus = TaskStatus.pending


class SprintPlan(BaseModel):
    """Manager 生成的 Sprint 规划"""
    goal: str
    tasks: list[TaskItem]
    constraints: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)


class RunStatus(BaseModel):
    """运行状态"""
    id: str
    team_name: str
    status: str  # "idle" | "running" | "completed" | "failed"
    current_task: Optional[str] = None
    completed_tasks: list[str] = Field(default_factory=list)
    retry_count: int = 0


class FileChangeEvent(BaseModel):
    """文件变更事件"""
    type: str = "file_change"
    change: str  # "created" | "modified" | "deleted"
    path: str


class AgentActivityEvent(BaseModel):
    """Agent 活动事件"""
    type: str = "agent_activity"
    agent_id: str
    action: str  # "thinking" | "writing" | "reading" | "completed"
    detail: str = ""


class WSMessage(BaseModel):
    """WebSocket 消息统一格式"""
    type: str
    data: dict = Field(default_factory=dict)


class RunRecord(BaseModel):
    """运行历史记录"""
    id: str
    template_id: Optional[str] = None
    prompt: str
    goal: Optional[str] = None
    status: str = "running"  # "running" | "completed" | "failed"
    start_time: str = ""
    end_time: Optional[str] = None
    tasks_summary: list[dict] = Field(default_factory=list)
    detail: str = ""
