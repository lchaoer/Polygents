# tests/test_file_comm.py
import pytest
import tempfile
from pathlib import Path
from app.engine.file_comm import FileComm


@pytest.fixture
def workspace(tmp_path):
    """Create temporary workspace"""
    comm = FileComm(tmp_path)
    comm.init_workspace()
    return comm


def test_init_workspace(workspace):
    """Initialization should create all required directories"""
    base = workspace.base_dir
    assert (base / "inbox").is_dir()
    assert (base / "shared").is_dir()
    assert (base / "artifacts").is_dir()
    assert (base / "logs").is_dir()
    assert (base / ".polygents").is_dir()


def test_init_agent_dirs(workspace):
    """Initializing Agent should create its inbox and artifacts subdirectories"""
    workspace.init_agent("dev")
    base = workspace.base_dir
    assert (base / "inbox" / "dev").is_dir()
    assert (base / "artifacts" / "dev").is_dir()


def test_send_message(workspace):
    """Send message between Agents"""
    workspace.init_agent("manager")
    workspace.init_agent("dev")
    workspace.send_message(
        from_agent="manager",
        to_agent="dev",
        msg_type="task_assignment",
        content="## Implement Login API\n\nRequires JWT authentication",
    )
    inbox = workspace.base_dir / "inbox" / "dev"
    files = list(inbox.glob("*.md"))
    assert len(files) == 1
    content = files[0].read_text(encoding="utf-8")
    assert "from: manager" in content
    assert "to: dev" in content
    assert "JWT authentication" in content


def test_read_inbox(workspace):
    """Read Agent inbox"""
    workspace.init_agent("dev")
    workspace.send_message("manager", "dev", "task_assignment", "Task 1")
    workspace.send_message("evaluator", "dev", "feedback", "Modification suggestions")
    messages = workspace.read_inbox("dev")
    assert len(messages) == 2


def test_write_shared(workspace):
    """Write shared file"""
    workspace.write_shared("sprint.md", "# Sprint Plan\n\n## Task List")
    content = (workspace.base_dir / "shared" / "sprint.md").read_text(encoding="utf-8")
    assert "Sprint Plan" in content


def test_read_shared(workspace):
    """Read shared file"""
    workspace.write_shared("sprint.md", "# Sprint")
    content = workspace.read_shared("sprint.md")
    assert "Sprint" in content


def test_write_artifact(workspace):
    """Write artifact"""
    workspace.init_agent("dev")
    workspace.write_artifact("dev", "code/main.py", "print('hello')")
    content = (workspace.base_dir / "artifacts" / "dev" / "code" / "main.py").read_text(encoding="utf-8")
    assert "hello" in content


def test_write_log(workspace):
    """Write communication log"""
    workspace.log_communication("manager", "dev", "task_assignment", "Build an API")
    log_dir = workspace.base_dir / "logs"
    files = list(log_dir.glob("*.md"))
    assert len(files) == 1
