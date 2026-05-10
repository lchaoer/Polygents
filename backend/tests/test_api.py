from fastapi.testclient import TestClient


def _client(polygents_root):
    from app.main import app

    return TestClient(app)


def test_health(polygents_root):
    c = _client(polygents_root)
    r = c.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_workflow_api_crud(polygents_root):
    c = _client(polygents_root)

    assert c.get("/api/workflows").json() == []

    payload = {
        "config": {"name": "API Flow", "max_rounds": 4},
        "worker_md": "worker prompt",
        "critic_md": "critic prompt",
        "checklist_md": "- C1",
    }
    r = c.post("/api/workflows", json=payload)
    assert r.status_code == 201, r.text
    wf = r.json()
    wf_id = wf["id"]
    assert wf["config"]["max_rounds"] == 4

    r = c.get(f"/api/workflows/{wf_id}")
    assert r.status_code == 200
    assert r.json()["worker_md"] == "worker prompt"

    update = dict(payload)
    update["worker_md"] = "updated"
    r = c.put(f"/api/workflows/{wf_id}", json=update)
    assert r.status_code == 200
    assert r.json()["worker_md"] == "updated"

    r = c.get("/api/workflows")
    assert any(w["id"] == wf_id for w in r.json())

    r = c.delete(f"/api/workflows/{wf_id}")
    assert r.status_code == 204

    r = c.get(f"/api/workflows/{wf_id}")
    assert r.status_code == 404


def test_run_creation_via_api(polygents_root, monkeypatch):
    from app.engine import registry

    started: list[str] = []

    async def _fake_start(run_id: str) -> None:
        started.append(run_id)

    monkeypatch.setattr(registry, "start_run", _fake_start)

    c = _client(polygents_root)

    wf_payload = {
        "config": {"name": "Demo"},
        "worker_md": "w",
        "critic_md": "c",
        "checklist_md": "- C1",
    }
    wf_id = c.post("/api/workflows", json=wf_payload).json()["id"]

    r = c.post(f"/api/workflows/{wf_id}/run", json={"task": "do thing"})
    assert r.status_code == 201, r.text
    snap = r.json()
    run_id = snap["id"]
    assert snap["task"] == "do thing"
    assert snap["status"]["state"] == "pending"
    assert started == [run_id]

    r = c.get(f"/api/runs/{run_id}")
    assert r.status_code == 200

    r = c.get(f"/api/workflows/{wf_id}/runs")
    assert any(run["id"] == run_id for run in r.json())

    async def _fake_cancel(run_id: str) -> bool:
        return True

    monkeypatch.setattr(registry, "cancel_run", _fake_cancel)
    r = c.post(f"/api/runs/{run_id}/cancel")
    assert r.status_code == 200
    assert r.json()["state"] == "cancelled"


def test_run_for_missing_workflow(polygents_root):
    c = _client(polygents_root)
    r = c.post("/api/workflows/nope/run", json={"task": "x"})
    assert r.status_code == 404


def test_workflow_duplicate(polygents_root):
    c = _client(polygents_root)
    payload = {
        "config": {"name": "Source", "max_rounds": 5, "worker_model": "m1", "critic_model": "m2"},
        "worker_md": "W",
        "critic_md": "C",
        "checklist_md": "- C1",
    }
    src_id = c.post("/api/workflows", json=payload).json()["id"]

    r = c.post(f"/api/workflows/{src_id}/duplicate")
    assert r.status_code == 201, r.text
    dup = r.json()
    assert dup["id"] != src_id
    assert dup["config"]["name"] == "Source (copy)"
    assert dup["config"]["max_rounds"] == 5
    assert dup["worker_md"] == "W"
    assert dup["checklist_md"] == "- C1"


def test_workflow_duplicate_404(polygents_root):
    c = _client(polygents_root)
    r = c.post("/api/workflows/nope/duplicate")
    assert r.status_code == 404


def test_round_diff_endpoint(polygents_root):
    from pathlib import Path

    c = _client(polygents_root)
    wf_payload = {
        "config": {"name": "Demo"},
        "worker_md": "w",
        "critic_md": "c",
        "checklist_md": "- C1",
    }
    wf_id = c.post("/api/workflows", json=wf_payload).json()["id"]

    from app.engine import registry

    async def _fake_start(run_id: str) -> None:
        pass

    import pytest as _pt  # noqa
    from unittest.mock import patch

    with patch.object(registry, "start_run", _fake_start):
        run_id = c.post(f"/api/workflows/{wf_id}/run", json={"task": "x"}).json()["id"]

    run_dir = Path(polygents_root) / "runs" / run_id
    (run_dir / "reports" / "round-1.md").write_text("first\n", encoding="utf-8")
    (run_dir / "reports" / "round-2.md").write_text("second\n", encoding="utf-8")

    r = c.get(f"/api/runs/{run_id}/diff/report/2")
    assert r.status_code == 200
    assert "-first" in r.text
    assert "+second" in r.text

    r = c.get(f"/api/runs/{run_id}/diff/report/1")
    assert r.status_code == 200
    assert r.text == ""

    r = c.get(f"/api/runs/{run_id}/diff/bogus/1")
    assert r.status_code == 400
