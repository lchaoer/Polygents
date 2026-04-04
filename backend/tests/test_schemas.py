# tests/test_schemas.py
import pytest
from app.models.schemas import AgentConfig, TeamConfig, TaskItem, RunStatus


def test_agent_config_minimal():
    agent = AgentConfig(
        id="dev",
        role="Developer",
        system_prompt="You are a developer",
        tools=["read_file", "write_file"],
    )
    assert agent.id == "dev"
    assert agent.provider == "claude"  # default


def test_agent_config_full():
    agent = AgentConfig(
        id="dev",
        role="Developer",
        system_prompt="You are a developer",
        tools=["read_file", "write_file"],
        provider="claude",
    )
    assert agent.provider == "claude"


def test_team_config():
    team = TeamConfig(
        name="Dev Team",
        agents=[
            AgentConfig(id="manager", role="Manager", system_prompt="...", tools=["read_file", "write_file"]),
            AgentConfig(id="dev", role="Developer", system_prompt="...", tools=["read_file", "write_file"]),
            AgentConfig(id="evaluator", role="Reviewer", system_prompt="...", tools=["read_file"]),
        ],
    )
    assert len(team.agents) == 3


def test_task_item():
    task = TaskItem(id="task-001", description="Implement login API", assignee="dev")
    assert task.status == "pending"


def test_run_status():
    run = RunStatus(id="run-001", team_name="Dev Team", status="running")
    assert run.current_task is None
