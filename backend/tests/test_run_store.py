from pathlib import Path


def _make_workflow():
    from app.storage import workflow_store as ws

    return ws.create_workflow(
        ws.WorkflowPayload(
            config=ws.WorkflowConfig(name="Demo"),
            worker_md="# worker",
            critic_md="# critic",
            checklist_md="- C1: contains hello",
        )
    )


def test_create_run_layout(polygents_root):
    from app.storage import run_store as rs

    wf = _make_workflow()
    snap = rs.create_run(wf.id, "write hello.md")
    assert snap is not None
    assert snap.workflow_id == wf.id
    assert snap.task == "write hello.md"
    assert snap.checklist == "- C1: contains hello"
    assert snap.status.state == "pending"
    assert snap.status.current_round == 0

    run_dir = Path(polygents_root) / "runs" / snap.id
    assert (run_dir / "task.md").read_text(encoding="utf-8") == "write hello.md"
    assert (run_dir / "checklist.md").read_text(encoding="utf-8") == "- C1: contains hello"
    assert (run_dir / "workspace").is_dir()
    assert (run_dir / "reports").is_dir()
    assert (run_dir / "reviews").is_dir()
    assert (run_dir / "status.json").exists()


def test_run_status_update_and_files(polygents_root):
    from app.storage import run_store as rs

    wf = _make_workflow()
    snap = rs.create_run(wf.id, "task")
    assert snap is not None

    rs.update_status(snap.id, state="running", current_round=1)
    refreshed = rs.get_run(snap.id)
    assert refreshed.status.state == "running"
    assert refreshed.status.current_round == 1

    run_dir = Path(polygents_root) / "runs" / snap.id
    (run_dir / "reports" / "round-1.md").write_text("# r1", encoding="utf-8")
    (run_dir / "reviews" / "round-1.md").write_text("# v1", encoding="utf-8")
    (run_dir / "workspace" / "hello.md").write_text("hello", encoding="utf-8")

    again = rs.get_run(snap.id)
    assert again.reports == ["round-1.md"]
    assert again.reviews == ["round-1.md"]

    files = rs.list_workspace_files(snap.id)
    assert files is not None
    assert any(f["path"] == "hello.md" for f in files)

    content = rs.read_run_file(snap.id, "workspace/hello.md")
    assert content == "hello"


def test_read_run_file_path_traversal_blocked(polygents_root):
    from app.storage import run_store as rs

    wf = _make_workflow()
    snap = rs.create_run(wf.id, "task")
    assert snap is not None

    assert rs.read_run_file(snap.id, "../../../etc/passwd") is None
    assert rs.read_run_file(snap.id, "..\\..\\secret") is None


def test_create_run_for_missing_workflow(polygents_root):
    from app.storage import run_store as rs

    assert rs.create_run("nope", "task") is None


def test_list_runs_filtered(polygents_root):
    from app.storage import run_store as rs

    wf = _make_workflow()
    snap = rs.create_run(wf.id, "task")
    assert snap is not None

    all_runs = rs.list_runs()
    assert len(all_runs) == 1
    assert all_runs[0].id == snap.id

    filtered = rs.list_runs(workflow_id=wf.id)
    assert len(filtered) == 1

    other = rs.list_runs(workflow_id="nope")
    assert other == []
