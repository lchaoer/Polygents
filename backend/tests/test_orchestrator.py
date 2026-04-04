# tests/test_orchestrator.py
import pytest
from app.models.schemas import AgentConfig, TeamConfig, TaskItem, TaskStatus


def test_parse_sprint_tasks():
    """Parse task list from sprint markdown"""
    from app.engine.orchestrator import parse_sprint_markdown

    sprint_md = """# Sprint: TODO App

## 目标
Build a TODO application

## 任务列表
1. [ ] Design data model
2. [ ] Implement CRUD logic
3. [ ] Write tests
"""
    tasks = parse_sprint_markdown(sprint_md)
    assert len(tasks) == 3
    assert tasks[0].description == "Design data model"
    assert tasks[0].status == TaskStatus.pending


def test_assign_task_to_dev():
    """Tasks are assigned to dev by default"""
    from app.engine.orchestrator import parse_sprint_markdown

    sprint_md = """# Sprint
## 任务列表
1. [ ] Write code
"""
    tasks = parse_sprint_markdown(sprint_md)
    assert tasks[0].assignee == "dev"


def test_extract_goal():
    """Extract goal from sprint markdown"""
    from app.engine.orchestrator import extract_goal

    sprint_md = """# Sprint: TODO App

## 目标
Build a TODO app with CRUD support

## 任务列表
1. [ ] Design data model
"""
    goal = extract_goal(sprint_md)
    assert "TODO" in goal
    assert "CRUD" in goal


def test_extract_goal_empty():
    """Return empty string when no goal section exists"""
    from app.engine.orchestrator import extract_goal

    sprint_md = """# Sprint
## 任务列表
1. [ ] Write code
"""
    goal = extract_goal(sprint_md)
    assert goal == ""


def test_extract_goal_multiline():
    """Multi-line goal extraction"""
    from app.engine.orchestrator import extract_goal

    sprint_md = """# Sprint

## 目标
First line of goal
Second line supplementary description

## 任务列表
1. [ ] Design
"""
    goal = extract_goal(sprint_md)
    assert "First line of goal" in goal
    assert "Second line supplementary description" in goal
