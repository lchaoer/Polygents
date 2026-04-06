# Config Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the cognitive burden of creating teams and workflows by adding Basic/Advanced mode, role_type smart presets, and workflow clone functionality.

**Architecture:** Three independent frontend changes: (1) CreatePage gets a Basic/Advanced toggle that hides complex fields and auto-fills defaults based on role_type selection, (2) WorkflowListPage gets a Clone button on each card that duplicates a workflow via API, (3) Backend workflows API gets a clone endpoint. No schema changes needed.

**Tech Stack:** React 19 / TypeScript / FastAPI / Playwright (E2E testing)

---

## Task 1: Add role_type presets constant

**Files:**
- Create: `frontend/src/constants/rolePresets.ts`

**Step 1: Create the presets file**

```typescript
// Role type presets: auto-fill tools + system_prompt when a role_type is selected
export const ROLE_PRESETS: Record<string, {
  tools: string[];
  system_prompt: string;
}> = {
  planner: {
    tools: ["Read", "Write", "Glob", "Grep"],
    system_prompt:
      "You are a project manager. Analyze user requirements, break them down into a clear sprint plan with numbered tasks, architecture constraints, and acceptance criteria. Output the plan to shared/sprint.md.",
  },
  executor: {
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    system_prompt:
      "You are a senior engineer. Follow the sprint plan, implement each assigned task with high-quality, runnable code. Place outputs in the artifacts/ directory. Notify the reviewer when done.",
  },
  reviewer: {
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
    system_prompt:
      "You are a strict quality reviewer. Evaluate outputs against the sprint acceptance criteria. Dimensions: feature completeness, code quality, requirement compliance. Pass or reject with specific feedback.",
  },
  tester: {
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    system_prompt:
      "You are a QA engineer. Write and run tests for the produced code. Verify that all acceptance criteria are met. Report test results and any issues found.",
  },
  designer: {
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
    system_prompt:
      "You are a UI/UX designer. Create design specifications, wireframes, and style guidelines. Ensure designs are user-friendly and follow best practices.",
  },
  researcher: {
    tools: ["Read", "Write", "Glob", "Grep", "Bash"],
    system_prompt:
      "You are a research analyst. Investigate the given topic thoroughly, gather relevant information, analyze findings, and produce a well-structured research report.",
  },
};
```

**Step 2: Commit**

```bash
git add frontend/src/constants/rolePresets.ts
git commit -m "feat: add role_type smart presets for auto-filling agent config"
```

---

## Task 2: Add Basic/Advanced mode to CreatePage

**Files:**
- Modify: `frontend/src/pages/CreatePage.tsx`

**Step 1: Import presets and add mode state**

At the top of CreatePage.tsx, after existing imports, add:

```typescript
import { ROLE_PRESETS } from "../constants/rolePresets";
```

Inside the component, after the existing state declarations (around line 58), add:

```typescript
const [advancedMode, setAdvancedMode] = useState(false);
```

**Step 2: Add auto-fill logic when role_type changes**

Replace the existing `updateAgent` function (line 101-105) with:

```typescript
const updateAgent = (idx: number, field: keyof AgentForm, value: any) => {
  setAgents((prev) =>
    prev.map((a, i) => {
      if (i !== idx) return a;
      const updated = { ...a, [field]: value };
      // Auto-fill from presets when role_type changes in Basic mode
      if (field === "role_type" && !advancedMode && value in ROLE_PRESETS) {
        const preset = ROLE_PRESETS[value as string];
        if (!a.system_prompt) updated.system_prompt = preset.system_prompt;
        if (a.tools.length === 0) updated.tools = preset.tools;
      }
      return updated;
    })
  );
};
```

**Step 3: Add the Basic/Advanced toggle in the form UI**

In the Form mode UI section, just before `<div className="create-agents-section">` (around line 415), add a toggle:

```tsx
<div className="create-mode-toggle">
  <button
    className={`mode-toggle-btn ${!advancedMode ? "active" : ""}`}
    onClick={() => setAdvancedMode(false)}
  >
    Basic
  </button>
  <button
    className={`mode-toggle-btn ${advancedMode ? "active" : ""}`}
    onClick={() => setAdvancedMode(true)}
  >
    Advanced
  </button>
</div>
```

**Step 4: Conditionally hide fields in Basic mode**

In each agent card (inside `<div className="create-agent-fields">`), wrap the fields that should be hidden in Basic mode:

- **Always visible** (Basic + Advanced): Role Name, Role Type, Model
- **Advanced only**: ID, System Prompt, Tools, Skills, Plugins

Wrap the ID field row, System Prompt, Tools, Skills, and Plugins sections with `{advancedMode && (...)}`.

The first field row should change: In Basic mode show only Role Name and Role Type; in Advanced mode show ID, Role Name, Role Type, and Model (as currently).

**Step 5: Commit**

```bash
git add frontend/src/pages/CreatePage.tsx
git commit -m "feat: add Basic/Advanced mode toggle to CreatePage with role_type auto-fill"
```

---

## Task 3: Add CSS styles for the mode toggle

**Files:**
- Modify: `frontend/src/styles/index.css`

**Step 1: Add styles**

After the existing `.create-*` styles block, add:

```css
/* Basic/Advanced mode toggle */
.create-mode-toggle {
  display: flex;
  gap: 2px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 3px;
  margin-bottom: 16px;
  width: fit-content;
}

.mode-toggle-btn {
  padding: 6px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-toggle-btn.active {
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid rgba(0, 240, 255, 0.2);
}

.mode-toggle-btn:hover:not(.active) {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
```

**Step 2: Commit**

```bash
git add frontend/src/styles/index.css
git commit -m "style: add Basic/Advanced mode toggle styles"
```

---

## Task 4: Add Clone endpoint to backend workflows API

**Files:**
- Modify: `backend/app/api/workflows.py`

**Step 1: Add clone endpoint**

After the `delete_workflow` endpoint (around line 127), add:

```python
@router.post("/{wf_id}/clone")
async def clone_workflow(wf_id: str):
    """Clone a workflow"""
    if not _workflow_store:
        raise HTTPException(status_code=500, detail="WorkflowStore not initialized")
    wf = _workflow_store.get_workflow(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    from app.engine.workflow_store import WorkflowConfig

    new_name = f"{wf.name} (Copy)"
    new_id = _safe_id(new_name)
    base_id = new_id
    counter = 1
    while _workflow_store.get_workflow(new_id):
        new_id = f"{base_id}-{counter}"
        counter += 1

    clone = WorkflowConfig(
        id=new_id,
        name=new_name,
        description=wf.description,
        type=wf.type,
        template_id=wf.template_id,
        agent_config=wf.agent_config,
        default_prompt=wf.default_prompt,
        default_goal=wf.default_goal,
    )
    _workflow_store.save_workflow(clone)
    return clone.model_dump()
```

**Step 2: Commit**

```bash
git add backend/app/api/workflows.py
git commit -m "feat: add POST /api/workflows/{id}/clone endpoint"
```

---

## Task 5: Add Clone button to WorkflowListPage

**Files:**
- Modify: `frontend/src/pages/WorkflowListPage.tsx`

**Step 1: Add clone handler**

After the `deleteWorkflow` function (around line 68), add:

```typescript
const cloneWorkflow = async (e: React.MouseEvent, id: string) => {
  e.stopPropagation();
  try {
    const res = await fetch(`${API_BASE}/api/workflows/${id}/clone`, { method: "POST" });
    if (!res.ok) throw new Error("Clone failed");
    addToast("success", "Workflow cloned");
    fetchWorkflows();
  } catch {
    addToast("error", "Clone failed");
  }
};
```

**Step 2: Add Clone button to card actions**

In the workflow card actions div (around line 127-149), add a Clone button between the run and edit buttons:

```tsx
<button
  className="wf-clone-btn"
  onClick={(e) => cloneWorkflow(e, wf.id)}
  title="Clone"
>
  ⧉
</button>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/WorkflowListPage.tsx
git commit -m "feat: add Clone button to WorkflowListPage"
```

---

## Task 6: Add CSS for clone button

**Files:**
- Modify: `frontend/src/styles/index.css`

**Step 1: Add clone button style**

After the existing `.wf-edit-btn` styles, add:

```css
.wf-clone-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.wf-clone-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-dim);
}
```

**Step 2: Commit**

```bash
git add frontend/src/styles/index.css
git commit -m "style: add clone button styles"
```

---

## Task 7: E2E test with Playwright

Test the following flows using Playwright MCP tools:

**7a. Basic/Advanced mode on CreatePage**
1. Navigate to `/create`
2. Verify Basic mode is active by default (toggle visible, Advanced fields hidden)
3. Verify Role Name, Role Type, and Model fields are visible
4. Verify System Prompt and Tools fields are NOT visible
5. Select role_type "executor" — verify system_prompt gets auto-filled (switch to Advanced to check)
6. Click "Advanced" toggle — verify all fields become visible
7. Take screenshot

**7b. Clone workflow**
1. Navigate to `/` (WorkflowListPage)
2. If workflows exist, find the Clone button on a card
3. Click Clone
4. Verify a new "(Copy)" workflow appears in the list
5. Take screenshot

**7c. Verify no regressions**
1. Navigate through sidebar pages: Teams, History, Logs, Skills
2. Verify each page loads successfully
