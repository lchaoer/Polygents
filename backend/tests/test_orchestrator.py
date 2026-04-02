# tests/test_orchestrator.py
import pytest
from app.models.schemas import AgentConfig, TeamConfig, TaskItem, TaskStatus


def test_parse_sprint_tasks():
    """从 sprint markdown 解析任务列表"""
    from app.engine.orchestrator import parse_sprint_markdown

    sprint_md = """# Sprint: TODO App

## 目标
做一个 TODO 应用

## 任务列表
1. [ ] 设计数据模型
2. [ ] 实现 CRUD 逻辑
3. [ ] 编写测试
"""
    tasks = parse_sprint_markdown(sprint_md)
    assert len(tasks) == 3
    assert tasks[0].description == "设计数据模型"
    assert tasks[0].status == TaskStatus.pending


def test_assign_task_to_dev():
    """任务默认分配给 dev"""
    from app.engine.orchestrator import parse_sprint_markdown

    sprint_md = """# Sprint
## 任务列表
1. [ ] 写代码
"""
    tasks = parse_sprint_markdown(sprint_md)
    assert tasks[0].assignee == "dev"


def test_extract_goal():
    """从 sprint markdown 提取目标"""
    from app.engine.orchestrator import extract_goal

    sprint_md = """# Sprint: TODO App

## 目标
构建一个支持增删改查的 TODO 应用

## 任务列表
1. [ ] 设计数据模型
"""
    goal = extract_goal(sprint_md)
    assert "TODO" in goal
    assert "增删改查" in goal


def test_extract_goal_empty():
    """没有目标段时返回空字符串"""
    from app.engine.orchestrator import extract_goal

    sprint_md = """# Sprint
## 任务列表
1. [ ] 写代码
"""
    goal = extract_goal(sprint_md)
    assert goal == ""


def test_extract_goal_multiline():
    """多行目标提取"""
    from app.engine.orchestrator import extract_goal

    sprint_md = """# Sprint

## 目标
第一行目标
第二行补充说明

## 任务列表
1. [ ] 设计
"""
    goal = extract_goal(sprint_md)
    assert "第一行目标" in goal
    assert "第二行补充说明" in goal
