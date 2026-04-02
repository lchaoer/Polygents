# tests/test_file_comm.py
import pytest
import tempfile
from pathlib import Path
from app.engine.file_comm import FileComm


@pytest.fixture
def workspace(tmp_path):
    """创建临时工作目录"""
    comm = FileComm(tmp_path)
    comm.init_workspace()
    return comm


def test_init_workspace(workspace):
    """初始化应创建所有必需目录"""
    base = workspace.base_dir
    assert (base / "inbox").is_dir()
    assert (base / "shared").is_dir()
    assert (base / "artifacts").is_dir()
    assert (base / "logs").is_dir()
    assert (base / ".polygents").is_dir()


def test_init_agent_dirs(workspace):
    """初始化 Agent 应创建其 inbox 和 artifacts 子目录"""
    workspace.init_agent("dev")
    base = workspace.base_dir
    assert (base / "inbox" / "dev").is_dir()
    assert (base / "artifacts" / "dev").is_dir()


def test_send_message(workspace):
    """Agent 间发送消息"""
    workspace.init_agent("manager")
    workspace.init_agent("dev")
    workspace.send_message(
        from_agent="manager",
        to_agent="dev",
        msg_type="task_assignment",
        content="## 实现登录接口\n\n需要 JWT 认证",
    )
    inbox = workspace.base_dir / "inbox" / "dev"
    files = list(inbox.glob("*.md"))
    assert len(files) == 1
    content = files[0].read_text(encoding="utf-8")
    assert "from: manager" in content
    assert "to: dev" in content
    assert "JWT 认证" in content


def test_read_inbox(workspace):
    """读取 Agent 收件箱"""
    workspace.init_agent("dev")
    workspace.send_message("manager", "dev", "task_assignment", "任务1")
    workspace.send_message("evaluator", "dev", "feedback", "修改建议")
    messages = workspace.read_inbox("dev")
    assert len(messages) == 2


def test_write_shared(workspace):
    """写入共享文件"""
    workspace.write_shared("sprint.md", "# Sprint Plan\n\n## 任务列表")
    content = (workspace.base_dir / "shared" / "sprint.md").read_text(encoding="utf-8")
    assert "Sprint Plan" in content


def test_read_shared(workspace):
    """读取共享文件"""
    workspace.write_shared("sprint.md", "# Sprint")
    content = workspace.read_shared("sprint.md")
    assert "Sprint" in content


def test_write_artifact(workspace):
    """写入工件"""
    workspace.init_agent("dev")
    workspace.write_artifact("dev", "code/main.py", "print('hello')")
    content = (workspace.base_dir / "artifacts" / "dev" / "code" / "main.py").read_text(encoding="utf-8")
    assert "hello" in content


def test_write_log(workspace):
    """写入通信日志"""
    workspace.log_communication("manager", "dev", "task_assignment", "做个API")
    log_dir = workspace.base_dir / "logs"
    files = list(log_dir.glob("*.md"))
    assert len(files) == 1
