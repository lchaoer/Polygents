# 03 — Features

> Every UI surface and interaction. If you're trying to remember "what does the thing do" or "where do I click for X," this is the doc.

## Top-level navigation

A persistent header with three links: **Workflows**, **Runs**, **Settings**. The active section gets a soft mint chip.

## Workflows page (`/`)

Lists every saved workflow as a row.

Each row shows:

- Workflow name (large) + id (small monospace)
- **Runs** count (how many runs this workflow has produced)
- **Last run** state-dot + relative time (`5m ago`, `13d ago`)
- Two row-actions: **Duplicate** and **Delete**

| Action | Behavior |
|---|---|
| Click row | Open the workflow in edit mode |
| Click `+ New workflow` | Go to a fresh edit page seeded with sane defaults |
| **Duplicate** | Server-side copy. New workflow named `"<name> (copy)"` with identical config + prompts. Auto-navigates into the copy so you can immediately edit it. |
| **Delete** | Confirm dialog. Removes the workflow folder; existing runs are kept so historical work isn't orphaned. |

Empty state: a small SVG illustration + "Click + New workflow to create your first one."

## Workflow edit page (`/workflows/new` or `/workflows/:id`)

Three areas, top to bottom:

### Config row

Name · Max rounds · Worker model · Critic model. All inline editable.

### Prompt editor

A 3-tab Monaco editor for the three Markdown buffers:

- **`worker.md`** — the Worker system prompt (the user's voice for how Worker should behave)
- **`critic.md`** — the Critic system prompt
- **`checklist.md`** — bullets the Critic checks one by one

Each tab has a kbd hint in the corner (`⌘1` / `⌘2` / `⌘3`). A help line under the tabs explains what each prompt is for, so first-timers don't need to guess.

The editor uses a custom `polygents-light` theme — mint accent on cursor, line-number active state, and selection highlight, to keep visual cohesion with the rest of the app.

A small dirty-dot (`•`) appears next to the title when there are unsaved changes. Browser unload is guarded with a `beforeunload` warning. In-app navigation is guarded by a `confirm()` dialog ("You have unsaved changes. Discard them?").

### Run bar

A textarea + green **▶ Run** button. Type the task, click Run, and the run starts immediately.

If the workflow is unsaved or dirty, Run will save it first (creating the workflow if needed), then start the run, then navigate to the run page.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘S` / `Ctrl+S` | Save the workflow |
| `⌘Enter` / `Ctrl+Enter` | Save (if needed) + Run |
| `⌘1` | Switch to `worker.md` tab |
| `⌘2` | Switch to `critic.md` tab |
| `⌘3` | Switch to `checklist.md` tab |

All shortcuts are visible on their respective buttons / tabs as inline kbd badges, so they're discoverable without docs.

## Runs page (`/runs`)

Reverse-chronological list of every run across every workflow.

- Each row: state-dot · workflow name · run-id-suffix · `round N` · `Xm ago` · state pill
- A chip-row at the top filters by workflow (only workflows that actually have runs appear as chips, with counts)
- "All" chip is the default

Empty state: a small SVG of a circle-square-circle dotted-line illustration + "Open a workflow and hit ▶ Run to start one."

## Run detail page (`/runs/:id`)

The most information-dense surface. Three layers stacked vertically:

### 1. Run header card

- Run id (last 6 chars, italic display)
- State pill (`PASSED` / `FAILED` / `RUNNING` / etc.)
- Round counter
- Started timestamp (relative)
- **← Workflow** back link
- **Cancel** button (only when running/pending)

### 2. Task card

The task text the user typed, in a serif-feeling collapsible box. Long tasks (>280 chars) clamp to ~4 lines with a fade gradient and a "Show all (N chars)" toggle.

### 3. Error card (only when something broke)

Red-tinted card showing `status.error` for runs that hit a structural failure (missing report file, bad verdict, SDK crash). Otherwise hidden.

### 4. Workflow graph (live)

A 4-node graph: **📥 Task → 👷 Worker → 🔍 Critic → ✅ Done**.

Built with **react-flow**. Each node has four states reflected in styling:

| State | Visual |
|---|---|
| `idle` | grey, subdued |
| `running` | mint border, soft mint glow, animated outer pulse ring |
| `done` | mint border, light mint fill |
| `failed` | warm red border + tint |

Edges:

- `Task → Worker` — animated dashed when Worker is running
- `Worker → Critic` (label: `report`) — animates as work flows forward
- `Critic → Worker` (label: `FAIL`) — appears as a feedback loop, gets a dashed warm-red highlight on FAIL verdicts; otherwise dimmed and label-hidden
- `Critic → Done` (label: `PASS`) — animates green on PASS

Worker and Critic nodes display their **current round** below the role name (`round 1`, `round 2`).

#### Click a node → AgentDrawer

Click the **Worker** or **Critic** node and a centered modal slides in:

- Title: `👷 Worker · all rounds` (or Critic)
- A list of every round this role has appeared in
- Each row: round number · duration · verdict pill (Critic only) · `→` arrow
- Click a row to jump to that round's step in the timeline (auto-expands it)
- `Esc` or click backdrop to close

The Task and Done nodes are not clickable — they're endpoints, no detail to show.

### 5. Timeline (left column)

A vertical sequence of round cards. Each round card shows:

- `Round N` · total duration · `running…` indicator while in flight
- `pulse` dot animation when this round is the active one
- Inside the card: a Worker step and (once it appears) a Critic step

Each step is a collapsible row:

- Header: role icon + role name + first non-heading line of the report/review (truncated to ~120 chars) + duration + verdict pill (Critic only)
- Click to expand. When open, a tab strip appears: **Content** / **Diff vs prev**

#### Content tab

The full Markdown file, monospace, no formatting (raw `.md`). For round 1 the only tab.

#### Diff vs prev tab (round 2+ only)

Lazy-fetches `GET /api/runs/:id/diff/{report|review}/N` and renders a unified diff:

- `---` / `+++` headers in muted grey
- `@@` hunk lines in soft sky-blue, bold
- `-` lines warm red, light red bg
- `+` lines mint green, light mint bg
- Context lines normal text

Shows "No previous round to diff against." for round 1 (it's still selectable but informative). Shows `Loading diff…` while fetching.

### 6. Live agent panel (right column, top)

The "what is the agent doing right now" surface.

When a run is in flight:

- Header: role icon + name + active round + dot animation + `streaming…` tag
- Body: a scrolling feed of message-level events:
  - **Text** blocks rendered as plain text
  - **Tool calls** rendered as a one-line entry: `📖 Read · path/to/file.ts` or `▶ Bash · pytest tests/` (input truncated to ~120 chars)
  - **Tool results** rendered only when there's an error
  - **Thinking** blocks (extended reasoning) get a faint italic style with a `thinking` tag
- Auto-scrolls to bottom as new events arrive

When idle (no agent currently running):

- Header shows `No agent active` or the last-active role with a `history` tag

#### History replay

A `<select>` dropdown in the panel header lets you pick a prior round of the same session to re-view that round's stream.

- Default is `Live` (or `—` if nothing is currently active)
- Each completed `<role> · round N` becomes an option
- Selecting one switches the panel to show that round's recorded stream
- Selecting `Live` snaps back to whatever is currently active (or no agent)

Stream history persists for the lifetime of the page. Refreshing loses the live narration (SSE stream events aren't replayed on reconnect by design — see [Architecture § Event stream](02-architecture.md#event-stream-sse)).

### 7. Workspace files panel (right column, bottom)

A flat list of every file the Worker wrote to `workspace/`.

Each row: filename · round tag (`R1` / `R2`) · size.

The round tag is computed client-side: a file's `mtime` falls into round N's `[start, end]` window where `start` is the previous review's mtime (or `run.created_at` for round 1) and `end` is this round's review/report mtime. So you can see which round produced or last touched each file.

Click a filename to open a viewer overlay below:

- Header: file path + Close button
- Body: monospace pre-formatted text content

The viewer is shared across panel clicks (clicking another file replaces the content) and is dismissed by clicking Close, the same row, or by selecting `null` from elsewhere.

## Toasts

Every error or success uses a toast. Toasts:

- Slide up from the bottom-right
- Have a close (×) button
- Show a thin progress bar that drains over 5 seconds, after which they auto-dismiss
- Stack vertically when multiple are active

Errors are red-tinted, info messages are mint-tinted.

## Settings page (`/settings`)

Currently minimal — exists as a route stub for future config (API keys, default models, etc.) without architectural commitment.

## Visual design language

The app uses a single design token set called **Misty Mint**:

- Primary accent: mint `#4fb39b`, deep mint `#2f8f7a`
- Secondary: sky `#6da5c4`
- Warm fail: `#c97a7a`
- Type: Plus Jakarta Sans for UI, JetBrains Mono for code/IDs/timestamps
- Radii: 8px for chips/buttons, 12–14px for cards, 14px for the modal
- Shadows: very soft `0 1px 2px rgba(20,40,50,0.04)` on cards, deeper on modals

Light theme only by intent — the project is local-tool, used in contexts where dark/light follows OS rather than per-app.

## Accessibility notes

- All interactive controls are real `<button>` elements (no `div onClick`).
- Keyboard shortcuts are exposed visually next to their actions, not hidden in tooltips.
- Focus styles are preserved (no global `outline: 0`).
- The graph nodes are reachable via tab once `elementsSelectable` is on (it's on when `onNodeClick` is provided).

Known gaps: there's no SR live region for the streaming panel, and the diff colors don't have non-color affordances. Both are open improvements.

## Next

- Want to know how to run, test, or change this code? → [04 — Development](04-development.md)
- Want the architectural picture? → [02 — Architecture](02-architecture.md)
