# Polygents Rewrite — Implementation Plan

**Date**: 2026-04-25
**Design doc**: [2026-04-25-polygents-rewrite-design.md](2026-04-25-polygents-rewrite-design.md)
**Goal**: Replace v1 Polygents with a Worker + Critic dual-agent loop system.

---

## Pre-flight

### P0. Snapshot v1

```bash
cd D:/dev/cc/Polygents
git add docs/plans/2026-04-25-polygents-rewrite-design.md
git commit -m "docs: design for v2 worker-critic rewrite"
git tag v1-legacy
git push origin v1-legacy   # optional, for safety
```

**Verify**: `git tag` shows `v1-legacy`. `git show v1-legacy --stat | head` shows old code.

### P1. Wipe v1 source

```bash
rm -rf Polygents/backend Polygents/frontend
rm Polygents/docs/api-reference.md
rm Polygents/docs/architecture.md
rm Polygents/docs/design.md
rm Polygents/docs/design-v2.md
rm Polygents/docs/plans/2026-03-31-phase1.md
rm Polygents/docs/plans/2026-04-01-config-system.md
rm Polygents/docs/plans/2026-04-01-goal-mechanism.md
rm Polygents/docs/plans/2026-04-06-config-simplification.md
rm Polygents/docs/plans/2026-04-06-phase3-features.md
# Keep: docs/plans/2026-04-25-polygents-rewrite-design.md, this plan, README.md (will rewrite later)
```

**Verify**: `ls Polygents/` shows only `README.md` and `docs/`. Commit: `chore: remove v1 source, keep v2 design`.

---

## Stage 1 — Backend Skeleton & Storage

**Goal**: Backend project boots, can read/write workflow + run folders. No agents yet.

### S1.1 Project scaffold

Create `Polygents/backend/`:

```
backend/
├── pyproject.toml          # python>=3.10, fastapi, uvicorn, claude-agent-sdk, pyyaml, pydantic
├── .python-version
├── app/
│   ├── __init__.py
│   ├── main.py             # FastAPI app, mount routers, CORS
│   ├── settings.py         # paths to workflows/, runs/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── workflows.py    # stub routers
│   │   └── runs.py         # stub routers
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── workflow_store.py
│   │   └── run_store.py
│   └── engine/
│       └── __init__.py     # empty for now
└── tests/
    └── test_storage.py
```

**Verify**: `uvicorn app.main:app --reload --port 8001` starts. `GET http://localhost:8001/health` returns `{"ok": true}`.

### S1.2 Storage: workflows

Implement `workflow_store.py`:

- `list_workflows() -> list[WorkflowSummary]` — scan `workflows/` dirs, read each `config.yaml` for name
- `get_workflow(id) -> Workflow` — read config + 3 .md files
- `create_workflow(payload) -> id` — generate id (slug + uuid suffix), create folder, write 4 files
- `update_workflow(id, payload)` — overwrite files
- `delete_workflow(id)` — `rm -rf workflows/{id}/`

`Workflow` model:

```python
class WorkflowConfig(BaseModel):
    name: str
    max_rounds: int = 3
    worker_model: str = "claude-sonnet-4-6"
    critic_model: str = "claude-opus-4-7"

class Workflow(BaseModel):
    id: str
    config: WorkflowConfig
    worker_md: str
    critic_md: str
    checklist_md: str
```

**Verify (test_storage.py)**:
- Create → list shows it → get returns same content
- Update → get returns new content
- Delete → list no longer shows it

### S1.3 Storage: runs

Implement `run_store.py`:

- `create_run(workflow_id, task) -> run_id` — generate `runs/{ts}-{uuid}/`, copy `checklist.md` from workflow, write `task.md`, write initial `status.json` (`{state: "pending", current_round: 0}`), create empty `workspace/`, `reports/`, `reviews/`
- `get_run(run_id) -> RunSnapshot` — read status + list reports/reviews
- `read_run_file(run_id, relpath) -> str` — safe read inside run dir (reject `..`)
- `list_runs(workflow_id) -> list[RunSummary]`
- `update_status(run_id, **kwargs)` — atomic write to status.json
- `cancel_run(run_id)` — set status to cancelled (engine kill comes later)

**Verify (test)**:
- `create_run` produces correct folder layout
- Round files can be appended via direct write, `get_run` lists them in order

### S1.4 REST API: workflows + runs (no engine yet)

Wire `api/workflows.py` and `api/runs.py` to call storage. Endpoints from design §8.1, except:

- `POST /api/workflows/:id/run` returns `{run_id}` but **does NOT actually run** yet — just creates the run folder. We'll wire the engine in Stage 2.

**Verify**: Curl/HTTPie smoke test —
1. `POST /api/workflows` create one
2. `GET /api/workflows` lists it
3. `POST /api/workflows/:id/run` returns run_id, folder exists on disk
4. `GET /api/runs/:run_id` returns the snapshot

---

## Stage 2 — WorkerCriticRunner (engine)

**Goal**: Drive a real run end-to-end via Claude Agent SDK from a Python script. No HTTP integration yet — pure engine + filesystem.

### S2.1 SDK client wrapper

`engine/sdk_client.py` — thin wrapper around `claude-agent-sdk`:

- `start_session(model, system_prompt, cwd, allowed_tools) -> session_id`
- `run(session_id, prompt) -> str` (waits for completion, returns final text — but we mostly care about file side effects)
- `resume(session_id, prompt) -> str`
- `kill(session_id)`

Read SDK docs to confirm API; adapt naming. Goal: an interface stable enough that the runner doesn't depend on SDK internals.

**Verify**: write `scripts/sdk_smoke.py` that creates a session, asks "write hello.txt with content 'hi'" in a tmp cwd, asserts file exists.

### S2.2 Prompt builders

`engine/prompts.py` — pure functions:

- `worker_round_1_prompt(task_text)` — embeds task, instructs Worker to do work in cwd and write `../reports/round-1.md` with the schema
- `worker_round_n_prompt(round_n, prev_review_path)` — instructs to read `../reviews/round-{n-1}.md`, fix, write `../reports/round-{n}.md`
- `critic_round_1_prompt(task_text, checklist_text)` — embeds task + checklist, instructs to read `../reports/round-1.md`, inspect cwd, write `../reviews/round-1.md` with schema (`## Verdict` line = `PASS` or `FAIL`)
- `critic_round_n_prompt(round_n)` — read latest report, write latest review

Critic prompt is built ONCE per run; subsequent rounds resume the session. Worker similarly.

**Verify (unit)**: snapshot tests on prompt strings — make sure schema instructions are present and word "checklist" never appears in any worker prompt.

### S2.3 Verdict parser

`engine/verdict.py`:

```python
def parse_verdict(review_md: str) -> Literal["PASS", "FAIL"]:
    # find line "## Verdict", next non-empty line must be PASS or FAIL
    # raise on malformed
```

**Verify**: tests for valid PASS, valid FAIL, missing section, weird whitespace, lowercase pass (rejected).

### S2.4 The runner

`engine/runner.py`:

```python
class WorkerCriticRunner:
    def __init__(self, run_id, workflow, run_store, sdk_client):
        ...

    async def run(self, on_event: Callable):
        # 1. update status: running, round 1
        # 2. start worker session (cwd=workspace/, allowed_tools=worker set)
        # 3. start critic session (cwd=workspace/, allowed_tools=critic set, write only to reviews/)
        # 4. loop round 1..max_rounds:
        #    a. emit round_start worker
        #    b. worker prompt (round-1 builder OR resume-round-n builder)
        #    c. emit report_written
        #    d. emit round_start critic
        #    e. critic prompt
        #    f. parse review verdict
        #    g. emit review_written with verdict
        #    h. if PASS: status=passed, break
        # 5. if loop finished without PASS: status=failed
        # 6. kill sessions
```

`on_event` callback fires SSE events later (Stage 3). For now, just print them.

**Cancellation**: runner watches an `asyncio.Event`; cancel call sets it; runner kills sessions and marks status=cancelled.

**Verify (integration script `scripts/run_smoke.py`)**:
1. Build a tiny workflow: task = "write hello.md saying hello"; checklist = "must contain word 'hello' (case-insensitive)"
2. Run end-to-end
3. Assert `runs/{id}/reports/round-1.md` exists, `reviews/round-1.md` exists with `## Verdict\nPASS`, `status.json` shows `passed`
4. Build a deliberately-failing workflow (checklist demands impossible thing) → assert ends with `failed` after max_rounds

This is the riskiest stage. **Do not move to Stage 3 until this script is green.**

---

## Stage 3 — REST + SSE Integration

**Goal**: Frontend can drive runs and see real-time progress.

### S3.1 Wire runner into API

- `POST /api/workflows/:id/run` now creates run AND launches `asyncio.create_task(runner.run(...))` in a process-wide registry `{run_id: runner_task}`
- `POST /api/runs/:id/cancel` looks up the task, signals cancel
- Server graceful shutdown cancels all running runs

**Verify**: HTTPie POST /run, watch terminal logs print round events, check files on disk.

### S3.2 SSE endpoint

`GET /api/runs/:id/events` — async generator that yields events from a per-run event broker.

Event broker: in-memory `dict[run_id, list[asyncio.Queue]]`. Runner's `on_event` callback fans out to all queues. SSE handler subscribes a queue, drains it.

Event types from design §8.2.

**Verify**:
- Open SSE in one terminal: `curl -N http://localhost:8001/api/runs/X/events`
- Trigger run in another terminal: `curl -X POST .../run`
- See events stream in first terminal

### S3.3 File tree + read endpoint

- `GET /api/runs/:id/files` — return tree of `runs/{id}/workspace/` (recursive listing, file sizes, mtimes)
- `GET /api/runs/:id/files/{path}` — already in S1.3, extend to also serve workspace files

For workspace_changed SSE event: a simple watcher polls workspace mtime each 1s during a run, diffs against last seen, emits events. (More sophisticated: `watchdog` lib. v1: polling is fine.)

**Verify**: edit a file in workspace mid-run via shell, see `workspace_changed` event arrive.

---

## Stage 4 — Frontend

**Goal**: Three working pages.

### S4.1 Project scaffold

```
frontend/
├── package.json     # react, vite, ts, react-router, monaco-editor, @tanstack/react-query
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx     # router
    ├── api/
    │   ├── client.ts          # fetch wrapper with /api base
    │   └── sse.ts             # EventSource hook
    ├── pages/
    │   ├── WorkflowListPage.tsx
    │   ├── WorkflowEditPage.tsx
    │   └── RunDetailPage.tsx
    ├── components/
    │   ├── ConfigForm.tsx
    │   ├── MdTabs.tsx
    │   ├── RunColumn.tsx      # one of three columns
    │   └── FileTree.tsx
    └── styles/
        └── index.css
```

**Verify**: `npm run dev`, visit localhost:5173, blank shell with router renders.

### S4.2 Workflow List page

- `GET /api/workflows`, render list with name + actions (Edit / Delete)
- "+ New Workflow" button → POST create → navigate to edit

**Verify**: create / list / delete works in browser.

### S4.3 Workflow Edit page

- Load `GET /api/workflows/:id` on mount
- Top: ConfigForm (name, max_rounds, worker_model, critic_model select)
- Middle: MdTabs (3 tabs: worker.md / critic.md / checklist.md), each tab hosts Monaco editor (markdown mode)
- Bottom: task textarea + "Save" + "Run"
- Save: PUT `/api/workflows/:id`
- Run: POST `/api/workflows/:id/run` with task → navigate to RunDetail

**Verify**: edit + save + reload preserves content. Run navigates correctly.

### S4.4 Run Detail page

- Load `GET /api/runs/:id` on mount
- Open SSE on `GET /api/runs/:id/events`
- Three columns:
  - **Worker reports**: list of round-N cards, click to expand markdown
  - **Critic reviews**: list of round-N cards with PASS/FAIL badge, expand to show full review
  - **Workspace files**: file tree, click to load file content into a side panel/modal
- Header: status pill + cancel button (if running)
- On `report_written` / `review_written`: refetch run snapshot or merge from event payload
- On `status_changed`: update header pill

**Verify (manual end-to-end)**:
1. Create a workflow in UI
2. Run it
3. Watch all three columns update live
4. Cancel mid-run, confirm status flips

---

## Stage 5 — Polish

- README rewrite for v2 (replace existing showcase README)
- `.gitignore` adds `workflows/` and `runs/` (user data, not committed)
- Error toasts for failed API calls
- Empty states (no workflows, no runs)
- Confirm dialog on Delete Workflow
- Friendly error if SSE drops (auto-reconnect on visibility change)
- Run Detail: jump-to-latest-round on load
- Workflow Edit: warn-on-unsaved-changes when navigating away

**Verify**: full happy-path demo with a real task (e.g., "write a daily standup template that always has 3 sections"); checklist enforces section count.

---

## Out-of-scope for v1 (deferred)

Same as design §12. Plus:

- Auth / multi-user
- Hot-reload of workflow during a run
- Run replay / clone

---

## Estimated effort (rough)

| Stage | Time |
|-------|------|
| Pre-flight | 30 min |
| Stage 1 (backend skeleton + storage) | 3-4 hr |
| Stage 2 (runner) | 4-6 hr — biggest risk |
| Stage 3 (REST + SSE) | 2-3 hr |
| Stage 4 (frontend) | 4-6 hr |
| Stage 5 (polish) | 2 hr |
| **Total** | **~16-22 hr of focused work** |

Solo dev, single-session granularity. Plan assumes Claude Agent SDK behaves; if SDK has surprises, Stage 2 can blow up.

---

## Verification gates

Don't proceed to next stage until:

- **Pre-flight**: `v1-legacy` tag exists, source dirs gone
- **Stage 1**: storage tests green, REST CRUD works
- **Stage 2**: `run_smoke.py` produces both PASS and FAIL runs as expected
- **Stage 3**: SSE delivers events to curl
- **Stage 4**: Manual end-to-end demo works in browser

---

## First commit checkpoints

Suggested commit messages by stage:

1. `chore: remove v1 source, tag v1-legacy`
2. `feat(backend): scaffold + storage layer`
3. `feat(backend): rest api for workflows and runs (no engine)`
4. `feat(engine): worker-critic runner end-to-end`
5. `feat(backend): wire runner + SSE`
6. `feat(frontend): scaffold + workflow list page`
7. `feat(frontend): workflow edit page`
8. `feat(frontend): run detail page with sse`
9. `chore: polish, error states, readme rewrite`
