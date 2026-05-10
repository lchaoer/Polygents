import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import { api, type WorkflowPayload } from "../api/client";
import { useToast } from "../components/Toast";
import type { Workflow } from "../types";

const DEFAULT_WORKFLOW: WorkflowPayload = {
  config: {
    name: "New Workflow",
    max_rounds: 3,
    worker_model: "claude-sonnet-4-5-20250929",
    critic_model: "claude-sonnet-4-5-20250929",
  },
  worker_md:
    "You are a careful, focused executor. Read the task and complete it in your cwd.",
  critic_md:
    "You are a strict reviewer. Evaluate the work against the checklist literally.",
  checklist_md: "- C1: …\n- C2: …",
};

type TabKey = "worker" | "critic" | "checklist";

const TAB_HELP: Record<TabKey, string> = {
  worker: "Instructions for the agent that DOES the work. It writes files in its cwd and a round-N report.",
  critic: "Instructions for the agent that REVIEWS the work. It reads the workspace and writes PASS or FAIL.",
  checklist: "Bullet items the critic checks one by one. Be literal — vague items lead to vague verdicts.",
};

interface Props {
  mode: "new" | "edit";
}

export default function WorkflowEditPage({ mode }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [workflow, setWorkflow] = useState<WorkflowPayload>(DEFAULT_WORKFLOW);
  const [savedId, setSavedId] = useState<string | null>(mode === "edit" ? (id ?? null) : null);
  const [task, setTask] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("worker");
  const tabRef = useRef<TabKey>("worker");
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const [busy, setBusy] = useState(false);
  const baselineRef = useRef<string>(JSON.stringify(DEFAULT_WORKFLOW));
  const dirty = JSON.stringify(workflow) !== baselineRef.current;

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    api
      .getWorkflow(id)
      .then((wf: Workflow) => {
        const payload: WorkflowPayload = {
          config: wf.config,
          worker_md: wf.worker_md,
          critic_md: wf.critic_md,
          checklist_md: wf.checklist_md,
        };
        baselineRef.current = JSON.stringify(payload);
        setWorkflow(payload);
      })
      .catch((e) => toast.showError(`Failed to load workflow: ${String(e)}`));
  }, [mode, id, toast]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const guardedNavigate = (to: string) => {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    navigate(to);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = savedId
        ? await api.updateWorkflow(savedId, workflow)
        : await api.createWorkflow(workflow);
      setSavedId(res.id);
      baselineRef.current = JSON.stringify(workflow);
      toast.showInfo("Saved");
      if (!savedId) {
        navigate(`/workflows/${res.id}`, { replace: true });
      }
    } catch (e) {
      toast.showError(`Save failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!task.trim()) {
      toast.showError("Enter a task description before running.");
      return;
    }
    setBusy(true);
    try {
      let wfId = savedId;
      if (!wfId) {
        const created = await api.createWorkflow(workflow);
        wfId = created.id;
        setSavedId(wfId);
      } else if (dirty) {
        await api.updateWorkflow(wfId, workflow);
      }
      baselineRef.current = JSON.stringify(workflow);
      const snap = await api.startRun(wfId, task);
      navigate(`/runs/${snap.id}`);
    } catch (e) {
      toast.showError(`Run failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const editorValue = workflow[`${tab}_md`];
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const onEditorMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monaco.editor.defineTheme("polygents-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#1d2a30",
        "editor.lineHighlightBackground": "#f6f9fa",
        "editor.lineHighlightBorder": "#00000000",
        "editorLineNumber.foreground": "#b6bfc6",
        "editorLineNumber.activeForeground": "#4fb39b",
        "editor.selectionBackground": "#d6ece5",
        "editor.inactiveSelectionBackground": "#eef3f5",
        "editorCursor.foreground": "#2f8f7a",
        "editorIndentGuide.background1": "#eef3f5",
        "editorIndentGuide.activeBackground1": "#cdd7dd",
      },
    });
    monaco.editor.setTheme("polygents-light");
  };
  const onEditorChange = (v: string | undefined) =>
    setWorkflow((wf) => ({ ...wf, [`${tabRef.current}_md`]: v ?? "" }));
  const switchTab = (next: TabKey) => {
    if (next === tab) return;
    // Flush whatever the editor currently shows into the *current* tab field
    // before switching, so an unflushed edit can never get attributed to the
    // newly-selected tab.
    const ed = editorRef.current;
    if (ed) {
      const current = ed.getValue();
      setWorkflow((wf) => ({ ...wf, [`${tab}_md`]: current }));
    }
    setTab(next);
  };

  // Keep latest fns in refs so the global keydown handler always calls fresh ones
  const saveRef = useRef(save);
  const runRef = useRef(run);
  const switchTabRef = useRef(switchTab);
  useEffect(() => {
    saveRef.current = save;
    runRef.current = run;
    switchTabRef.current = switchTab;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        saveRef.current();
      } else if (e.key === "Enter") {
        e.preventDefault();
        runRef.current();
      } else if (e.key === "1") {
        e.preventDefault();
        switchTabRef.current("worker");
      } else if (e.key === "2") {
        e.preventDefault();
        switchTabRef.current("critic");
      } else if (e.key === "3") {
        e.preventDefault();
        switchTabRef.current("checklist");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {savedId ? (
              <>
                {workflow.config.name} <em style={{ fontWeight: 400, color: "var(--ink-faint)" }}>· edit</em>
              </>
            ) : (
              <>New workflow</>
            )}
            {dirty && <span className="dirty-dot" title="Unsaved changes">•</span>}
          </h1>
          <p className="page-sub">
            Three prompts: how the worker behaves, how the critic judges, and the checklist they argue over.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => guardedNavigate("/")}>
            ← Back
          </button>
          <button
            className="btn"
            onClick={save}
            disabled={busy || (savedId !== null && !dirty)}
            title="Save (⌘S)"
          >
            Save <span className="kbd-hint">⌘S</span>
          </button>
        </div>
      </div>

      <section className="wfedit-config">
        <label>
          <span>Name</span>
          <input
            value={workflow.config.name}
            onChange={(e) =>
              setWorkflow((wf) => ({
                ...wf,
                config: { ...wf.config, name: e.target.value },
              }))
            }
          />
        </label>
        <label>
          <span>Max rounds</span>
          <input
            type="number"
            min={1}
            max={10}
            value={workflow.config.max_rounds}
            onChange={(e) =>
              setWorkflow((wf) => ({
                ...wf,
                config: { ...wf.config, max_rounds: Number(e.target.value) },
              }))
            }
          />
        </label>
        <label>
          <span>Worker model</span>
          <input
            value={workflow.config.worker_model}
            onChange={(e) =>
              setWorkflow((wf) => ({
                ...wf,
                config: { ...wf.config, worker_model: e.target.value },
              }))
            }
          />
        </label>
        <label>
          <span>Critic model</span>
          <input
            value={workflow.config.critic_model}
            onChange={(e) =>
              setWorkflow((wf) => ({
                ...wf,
                config: { ...wf.config, critic_model: e.target.value },
              }))
            }
          />
        </label>
      </section>

      <section className="wfedit-editor">
        <div className="wfedit-tabs">
          {(["worker", "critic", "checklist"] as TabKey[]).map((k, i) => (
            <button
              key={k}
              className={`wfedit-tab ${tab === k ? "active" : ""}`}
              onClick={() => switchTab(k)}
              title={`Switch to ${k}.md (⌘${i + 1})`}
            >
              <span className="wfedit-tab-bullet" />
              <span style={{ flex: 1 }}>{k}.md</span>
              <span className="wfedit-tab-kbd">⌘{i + 1}</span>
            </button>
          ))}
          <div className="wfedit-tab-help">{TAB_HELP[tab]}</div>
        </div>
        <div className="wfedit-monaco">
          <Editor
            height="100%"
            language="markdown"
            theme="polygents-light"
            value={editorValue}
            onChange={onEditorChange}
            onMount={onEditorMount}
            options={{
              minimap: { enabled: false },
              wordWrap: "on",
              fontSize: 13.5,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              lineNumbers: "on",
              padding: { top: 18, bottom: 18 },
              scrollBeyondLastLine: false,
              renderLineHighlight: "none",
            }}
          />
        </div>
      </section>

      <section className="wfedit-runbar">
        <textarea
          placeholder="Describe the task for this run, then hit Run…"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={2}
        />
        <button className="btn primary" onClick={run} disabled={busy} title="Run (⌘↵)">
          {busy ? "Starting…" : "▶ Run"}
          {!busy && <span className="kbd-hint kbd-hint-primary">⌘↵</span>}
        </button>
      </section>
    </div>
  );
}
