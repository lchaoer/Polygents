# 01 — Overview

> Polygents is a focused two-agent collaboration tool. It turns a single LLM's "~70% quality on the first try" into a checklist-enforced loop that pushes work to "~90% on round 2 or 3."

## The one-line pitch

A **Worker** agent does a job. A **Critic** agent reviews it against a fixed checklist and votes `PASS` or `FAIL`. They iterate until `PASS` — or until `max_rounds`. The whole exchange happens through Markdown files on disk so every decision is auditable.

## The problem we set out to solve

When you ask an LLM to "produce a polished translation" or "write a config that satisfies these 8 constraints," the typical first-attempt output:

- misses 1–2 requirements out of every checklist
- drifts off-spec on subtle formatting
- invents content beyond the source
- needs a human to spot what's wrong and re-prompt

That review step is the bottleneck. Polygents automates it. A Critic with the **explicit acceptance standard** can spot the same issues a careful human would, write specific feedback, and force another iteration — without you watching.

## Why two agents — not one with self-review

Letting the Worker check its own output is unreliable: it tends to rationalize whatever it just produced. Splitting the roles forces a clean read:

- **Worker** never sees the checklist. It only sees the task. This stops it from gaming the rubric.
- **Critic** never modifies the workspace. Read-only enforces a real review, not a rewrite.
- They communicate **only through files**, never through shared memory. Every round leaves a `report-N.md` and `review-N.md` you can inspect later.

## Why two agents — not three or more

Polygents intentionally does not support multi-role pipelines (Researcher → Planner → Worker → Critic, etc.).

The product value lives in **tuning the Worker/Critic prompts and watching them iterate**, not in adding more agents. Adding a third role multiplies the prompt-tuning surface and dilutes attention. We'd rather make the 2-agent loop excellent than make a 5-agent loop adequate.

## What you actually do with it

A typical session:

1. Open the web UI, click **+ New workflow**.
2. Fill in three Markdown buffers:
   - `worker.md` — how the Worker behaves (tone, format expectations, output schema)
   - `critic.md` — how the Critic judges (strictness, tie-breaking rules)
   - `checklist.md` — the literal acceptance criteria, one bullet per item
3. Type a task in the run bar, click **Run**.
4. Watch the run page. The graph at the top lights up to show which agent is currently working. The middle column shows each round expanding as it completes. The right column shows the live token stream and the files the Worker is writing.
5. If round 1 fails, look at the Critic's feedback, edit your `worker.md` or `checklist.md`, save, and run again.

The loop is short and tight: edit prompt → run → watch the diff between rounds → repeat.

## Scope and non-goals

In scope (and well-supported):

- Worker + Critic loop with configurable models, max rounds, and prompt content per workflow
- Live visualization: workflow graph, per-round timeline, real-time agent message stream, workspace file tree
- Round-to-round diff for both reports and reviews
- Workflow duplication (so you can fork a working setup to try variants)
- Run history with filterable lists and per-workflow chips
- File-system audit trail: nothing is hidden in memory, everything is on disk

Deliberately out of scope:

- **Multi-role pipelines beyond Worker + Critic.** Locked. See [feedback memo](../../docs/README.md#historical-design-docs) — the project pivoted away from "role orchestration" toward depth on two roles.
- **Authentication, multi-user, RBAC.** Single-user local tool.
- **Cloud hosting / SaaS.** Local-first; no telemetry, no remote storage.
- **Plugin system or custom tools beyond the SDK's defaults.** Worker tools are `Read / Write / Edit / Bash / Glob / Grep`; Critic is read-only (`Read / Glob / Grep / Write` for the review file only, plus a `disallowed_tools` block on `Bash` and `Edit`).
- **Cross-run agent memory.** Each run starts fresh; long-term memory belongs to the prompt, not to a database.
- **Visual prompt builders / no-code DSLs.** Markdown is the prompt; Monaco is the editor.

## Who is this for

- Engineers iterating on **prompts that need to satisfy a structured spec** (translations, config generation, code refactors with constraints).
- Researchers comparing **prompt variants** under identical conditions (run A vs. run B with the same task and checklist).
- Anyone who has felt "the agent is *almost* right but I can't articulate the last mile" — Polygents forces you to articulate it as a checklist, then enforces it.

If your workflow is "open-ended brainstorm with one agent," Polygents is overkill. Use a normal chat for that.

## What "done" looks like for a run

A run ends in one of four states:

| State | Meaning |
|---|---|
| `passed` | Critic returned `PASS` within `max_rounds`. Workspace contains the accepted work. |
| `failed` | Critic returned `FAIL` on the final round, or the runner hit a structural error (missing report file, unparseable verdict, SDK crash). The error is recorded on the run. |
| `cancelled` | User clicked Cancel. Whatever the Worker had written so far is preserved. |
| `running` / `pending` | In-flight. SSE pushes events live. |

You can revisit any past run forever — runs are folders under `Polygents/runs/{run_id}/` with full report/review/workspace history.

## Next

- Want to know **how it's wired**? → [02 — Architecture](02-architecture.md)
- Want to know **what the UI does**? → [03 — Features](03-features.md)
- Want to **run / test / extend**? → [04 — Development](04-development.md)
