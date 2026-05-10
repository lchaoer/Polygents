# 04 — Development

> How to run, test, and extend Polygents. The conventions here are not aspirational — they're enforced by the existing test suite and the codebase itself.

## Prerequisites

- **Python 3.10+** (3.12 is what the project is developed on)
- **Node 18+ / npm**
- **An Anthropic API key** in `ANTHROPIC_API_KEY`. The Worker and Critic both call Claude through `claude-agent-sdk`, which delegates to the local `claude` CLI under the hood — that CLI reads the env var.
- **On Windows**: a Git Bash install. `claude-agent-sdk` shells out via bash; `sdk_client.py:_resolve_env()` auto-locates `bash.exe` from `D:\Software\Git\bin\bash.exe`, `C:\Program Files\Git\bin\bash.exe`, or `C:\Program Files (x86)\Git\bin\bash.exe`. Override with `CLAUDE_CODE_GIT_BASH_PATH`.

## Getting started

### One-shot dev launcher

```bash
./scripts/dev.sh
```

Boots backend on `:8001` and frontend on `:5173`, logs to `scripts/.logs/`. `Ctrl+C` stops both.

### Manual

```bash
# backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --host 127.0.0.1 --port 8001

# frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. `GET http://127.0.0.1:8001/health` should return `{"ok": true}`.

### Why no `--reload` on the backend

`uvicorn --reload` triggers `watchfiles`, which on Windows forces a Selector event loop. That breaks `asyncio.subprocess` — and `claude-agent-sdk` launches the `claude` CLI as a subprocess. The dev script runs uvicorn without reload to keep the SDK functional. Restart manually after backend changes.

## Testing

### Backend (pytest)

```bash
cd backend
python -m pytest
```

46 tests across:

| File | What it covers |
|---|---|
| `tests/test_api.py` | REST endpoint contract (workflows CRUD, run creation, duplicate, diff, cancel) |
| `tests/test_broker.py` | Pub/sub semantics: history replay, late subscribers, non-historical events, EOF, fanout, ring-buffer bound |
| `tests/test_prompts.py` | Prompt template formatting |
| `tests/test_run_store.py` | Run folder layout, status updates, file listing, **diff helper**, path-traversal protection |
| `tests/test_sdk_client.py` | `_summarize_tool_input` for every tool the agents use (Read, Write, Edit, Bash, Glob, Grep, TodoWrite, fallback, non-dict) |
| `tests/test_verdict.py` | Strict verdict parser against malformed reviews |
| `tests/test_workflow_store.py` | Workflow folder CRUD, slug generation |

The runtime side of `WorkerCriticRunner` and `AgentSession.send` is **not** unit-tested — they require a live `claude-agent-sdk` subprocess. They're exercised end-to-end via real runs in the UI.

### Frontend (vitest)

```bash
cd frontend
npm test          # run once
npm run test:watch  # watch mode
```

30 tests, all in `src/lib/runDerive.test.ts`, covering every pure derivation function:

- `buildRounds` — pairing reports + reviews by round number, sort, missing-critic edge case
- `roundBoundaries` / `tagFor` — file-mtime → round attribution
- `deriveGraphState` — every state transition (idle → running → done → failed) and verdict effects
- `summarizeMd` / `fmtDuration` / `fmtSize` — formatting

Plus 8 tests in `src/lib/diff.test.ts` for `computeUnifiedDiff` (the client-side LCS diff used by the Compare page) — identical inputs, empty-side, single-line replacement, common prefix/suffix preservation, CRLF handling, header labels.

Component rendering and SSE wiring aren't unit-tested; we rely on the unit-tested derivations + browser-driven smoke tests.

### Type checking

```bash
cd frontend
npx tsc -b      # CI gate
```

The project is strict TypeScript. Run this before committing frontend changes.

### End-to-end

No persisted `.spec.ts` E2E suite — every Polygents run hits a real Anthropic API call (we deliberately don't mock the SDK; see [Design constraints](#design-constraints-read-before-extending)), which makes a CI-runnable suite expensive and flaky. Instead we maintain a **Playwright-MCP smoke matrix** that's run-and-checked manually before any meaningful UI change. Screenshots from the most recent pass live in [`temp/screenshots/`](../../temp/screenshots/).

Last run: **2026-05-10**, 10/10 passing.

| # | Scenario | What it covers |
|---|---|---|
| 1 | Workflow CRUD | Create with sane defaults, slug `<name>-<8hex>`, appears in list, Delete confirms + removes |
| 2 | Workflow Duplicate | Server-side copy named `(copy)`, fresh id with `-copy-` infix, auto-navigates into copy |
| 3 | Dirty marker + leave-warning | `dirty-dot` renders on edit, Save un-disables, `beforeunload` listener installed. **Known gap**: top-nav `<NavLink>` bypasses the in-app `confirm()` guard — only page-internal back buttons honor it. |
| 4 | Keyboard shortcuts | `Ctrl/⌘+1/2/3` switch prompt tabs, `Ctrl/⌘+S` saves and clears dirty. (`Ctrl+Enter` save+run skipped — costs a real run.) |
| 5 | Cancel mid-run | Click Cancel → status flips to `cancelled` within ~3s |
| 6 | Runs filter chips | Workflow chip click narrows list, `.chip.active` highlights, "All" restores |
| 7 | Failed-run error card | Visible on FAILED run, shows `status.error` text |
| 8 | Workspace file viewer | Click `output.md` row opens viewer with file content; Close button dismisses |
| 9 | AgentDrawer | Click Worker node opens drawer titled `👷 Worker · all rounds` listing every round; `Esc` closes |
| 10 | Cross-run report diff | Two runs same workflow + same task: page-sub says "Same workflow + same task.", Round button appears in `.cmp-cross`, click renders client-side LCS diff with `-` red / `+` green / hunk header |

**How to extend**: when you add a UI surface, add a row here with the click sequence and the expected post-condition; the next person doing UI work runs the matrix top-to-bottom in a Playwright MCP session.

## Project conventions

### File-system discipline

- **Temporary artifacts go in `d:/dev/cc/temp/`.** Screenshots, debug logs, scratch scripts, AI tool tmp — anything ephemeral. Never leave `*.png`, `*.log`, `*.tmp` in the project root.
- **Long-keep screenshots** go in the project's own `screenshots/` subdir or `d:/dev/cc/screenshots/`.
- The `runs/` and `workflows/` directories are gitignored — they are user data, not code.

### Code conventions

- **No Chinese in code files.** Comments, TODOs, strings — all English. (User-facing UI text is also English.)
- **Tests do not mock the SDK subprocess.** If a feature needs the real Worker/Critic loop, validate it in the browser with a real run. Mocking the SDK pretends to test the runner but doesn't.
- **No backwards-compatibility shims.** This is a single-user local tool. Rename freely, delete unused code, don't keep dead imports "just in case."
- **Comments are rare.** Only when *why* is non-obvious — a hidden constraint, a workaround for a specific bug. Don't narrate *what* the code does.
- **No emojis in code or commits** unless explicitly asked. UI strings can use them sparingly (the agent role icons, status indicators).

### Memory and state

- All run state is on disk. Never add an in-memory cache that survives a request — the only allowed in-memory state is the broker's per-run subscriber list and the registry's running-task dict, both transient.
- The frontend's `useRef`-stored function refs (`saveRef`, `runRef`, etc.) are deliberate: window-level keyboard handlers must not capture stale closures.

### When changing the SSE event shape

1. Update `app.engine.runner._make_stream_emitter` and any new emit sites in `runner.py`.
2. Update `RunEvent` discriminated union in `frontend/src/types.ts`.
3. Update the `onEvent` reducer in `RunDetailPage.tsx`.
4. If the new event is structural (timeline-affecting), leave it in the broker history (default). If it's high-frequency narration, mark it non-historical: `await broker.publish(run_id, ev, historical=False)` from `registry._publish` (or extend `_STREAM_EVENT_TYPES`).
5. Add a test in `tests/test_broker.py` covering the new historical/non-historical decision.

### When adding a new run-detail UI feature

If it derives anything from `snap`, `rounds`, `verdicts`, or `activeAgent`, put the derivation in `frontend/src/lib/runDerive.ts` and add a vitest case. The page itself should stay declarative.

### When adding a new API endpoint

1. Add the route in `app/api/{workflows,runs}.py`.
2. Add a typed wrapper in `frontend/src/api/client.ts`.
3. Add a TestClient case in `tests/test_api.py`.
4. If the endpoint reads files, route through `_safe_join` to prevent path traversal.

## Design constraints (read before extending)

These are deliberate decisions — don't undo them without explicit user approval:

| Constraint | Why |
|---|---|
| **Two agents only (Worker + Critic).** No third role. | Locked. The product depth lives in tuning two roles, not in adding more. |
| **No database.** Filesystem is the source of truth. | Audit trail, grep-ability, zero-setup, single-user local tool. |
| **Light theme only.** | The user uses this in light-theme contexts; dark mode is feature-creep. |
| **No auth, no multi-user.** | Single-user local tool. |
| **No reload on the backend.** | Windows + claude-agent-sdk subprocess incompatibility. |
| **No mock SDK in tests.** | Mocked tests passed while real prod failed; we got burned and committed to integration-only for the runtime layer. |

## Common pitfalls

### "Backend changes don't show up"

Restart uvicorn manually. There's no auto-reload. Use the dev script's log file `scripts/.logs/backend.log` to see startup errors.

### "Run shows `running` forever after backend restart"

`status.json` was last written before the crash. Click **Cancel** in the UI to reset it to `cancelled`. There is no auto-recovery.

### "SSE events look stuck mid-run"

Check the browser console for SSE errors. The frontend reconnects on visibility change (when you tab back), so a backgrounded tab can lag. Refresh the page — structural events replay from the broker history.

### "Vite dev server not on IPv4"

The dev config pins `host: "127.0.0.1"`. If you see `localhost` issues on Windows (some IPv6/IPv4 weirdness), the explicit IPv4 should win. If not, set `VITE_HOST=127.0.0.1`.

### "I broke the verdict format and the run keeps failing"

`parse_verdict` is intentionally strict — `## Verdict\nPASS` exactly. Look at `app/engine/verdict.py` for the regex. The failure message in the run's error card tells you what was found instead.

### "Top-nav links navigate away while my edit page is dirty"

Known gap. `WorkflowEditPage` has a `guardedNavigate` that wraps in-page back buttons, but the `<NavLink>` elements in `App.tsx` do plain react-router navigation and bypass the guard. `beforeunload` still catches *closing the tab*, but in-app nav is unprotected. Save first, or accept the loss. Fix would be hoisting dirty state and intercepting at the router level.

## Adding a new tool to the Worker

The Worker's tool list is `WORKER_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]` in `app/engine/prompts.py`. To add e.g. `WebFetch`:

1. Append to `WORKER_TOOLS`.
2. Decide whether the Critic should also have it. Defaults: Critic gets the read-only subset.
3. Add a clause to `_summarize_tool_input` in `sdk_client.py` so the live panel shows a useful one-line hint instead of `key1=…, key2=…`.
4. Add a test case in `tests/test_sdk_client.py` for the summarizer.
5. Add an icon to `TOOL_ICON` in `frontend/src/components/LiveAgentPanel.tsx` so it gets a glyph instead of the default 🔧.

## Releasing / shipping

There's no release. This is a local tool. Pull the repo, run the dev script, you're good.

## Where to look first when something breaks

| Symptom | First place to look |
|---|---|
| Run never starts | `scripts/.logs/backend.log` |
| Worker writes nothing | The system-prompt template in `app/engine/prompts.py` — file-protocol expectations might have drifted |
| Critic verdict unparseable | `app/engine/verdict.py` regex + the actual `reviews/round-N.md` file |
| UI doesn't update mid-run | Browser DevTools network tab → SSE connection state |
| File listing wrong | `app/storage/run_store.py:list_workspace_files` + the actual `runs/{id}/workspace/` |
| Diff endpoint returns 404 | The round file doesn't exist yet — diff is best-effort, returns `""` for round 1 |

## Next

- Refresh on what the system *is* → [01 — Overview](01-overview.md)
- Architectural detail → [02 — Architecture](02-architecture.md)
- Feature reference → [03 — Features](03-features.md)
