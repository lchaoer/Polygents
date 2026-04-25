def test_workflow_crud(polygents_root):
    from app.storage import workflow_store as ws

    assert ws.list_workflows() == []

    payload = ws.WorkflowPayload(
        config=ws.WorkflowConfig(name="My Flow", max_rounds=2),
        worker_md="# worker",
        critic_md="# critic\nread checklist.md",
        checklist_md="- C1: must contain hello",
    )
    wf = ws.create_workflow(payload)
    assert wf.id.startswith("my-flow-")
    assert wf.config.max_rounds == 2

    summaries = ws.list_workflows()
    assert len(summaries) == 1
    assert summaries[0].id == wf.id
    assert summaries[0].name == "My Flow"

    fetched = ws.get_workflow(wf.id)
    assert fetched is not None
    assert fetched.worker_md == "# worker"
    assert fetched.checklist_md == "- C1: must contain hello"

    updated = ws.update_workflow(
        wf.id,
        ws.WorkflowPayload(
            config=ws.WorkflowConfig(name="My Flow", max_rounds=5),
            worker_md="# worker v2",
            critic_md=fetched.critic_md,
            checklist_md=fetched.checklist_md,
        ),
    )
    assert updated is not None
    assert updated.config.max_rounds == 5
    assert updated.worker_md == "# worker v2"

    assert ws.delete_workflow(wf.id) is True
    assert ws.list_workflows() == []
    assert ws.get_workflow(wf.id) is None


def test_get_missing_workflow(polygents_root):
    from app.storage import workflow_store as ws

    assert ws.get_workflow("nope") is None
    assert ws.delete_workflow("nope") is False
    assert ws.update_workflow("nope", ws.WorkflowPayload(config=ws.WorkflowConfig(name="x"))) is None
