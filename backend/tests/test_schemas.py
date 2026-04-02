# tests/test_schemas.py
import pytest
from app.models.schemas import AgentConfig, TeamConfig, TaskItem, RunStatus


def test_agent_config_minimal():
    agent = AgentConfig(
        id="dev",
        role="开发工程师",
        system_prompt="你是开发工程师",
        tools=["read_file", "write_file"],
    )
    assert agent.id == "dev"
    assert agent.provider == "claude"  # 默认值


def test_agent_config_full():
    agent = AgentConfig(
        id="dev",
        role="开发工程师",
        system_prompt="你是开发工程师",
        tools=["read_file", "write_file"],
        provider="claude",
    )
    assert agent.provider == "claude"


def test_team_config():
    team = TeamConfig(
        name="开发团队",
        agents=[
            AgentConfig(id="manager", role="经理", system_prompt="...", tools=["read_file", "write_file"]),
            AgentConfig(id="dev", role="开发", system_prompt="...", tools=["read_file", "write_file"]),
            AgentConfig(id="evaluator", role="评审", system_prompt="...", tools=["read_file"]),
        ],
    )
    assert len(team.agents) == 3


def test_task_item():
    task = TaskItem(id="task-001", description="实现登录接口", assignee="dev")
    assert task.status == "pending"


def test_run_status():
    run = RunStatus(id="run-001", team_name="开发团队", status="running")
    assert run.current_task is None
