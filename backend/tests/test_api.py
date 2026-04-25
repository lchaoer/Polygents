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


def test_run_creation_via_api(polygents_root):
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

    r = c.get(f"/api/runs/{run_id}")
    assert r.status_code == 200

    r = c.get(f"/api/workflows/{wf_id}/runs")
    assert any(run["id"] == run_id for run in r.json())

    r = c.post(f"/api/runs/{run_id}/cancel")
    assert r.status_code == 200
    assert r.json()["state"] == "cancelled"


def test_run_for_missing_workflow(polygents_root):
    c = _client(polygents_root)
    r = c.post("/api/workflows/nope/run", json={"task": "x"})
    assert r.status_code == 404
