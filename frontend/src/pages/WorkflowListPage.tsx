import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

interface Workflow {
  id: string;
  name: string;
  description: string;
  type: "single" | "team";
  template_id?: string;
  default_prompt: string;
  default_goal: string;
  last_run_at?: string;
  last_run_status?: string;
}

export default function WorkflowListPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const addToast = useFlowStore((s) => s.addToast);
  const navigate = useNavigate();

  const fetchWorkflows = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/workflows`)
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.json();
      })
      .then((data) => { setWorkflows(data); setLoading(false); })
      .catch((e) => { addToast("error", e.message); setLoading(false); });
  };

  useEffect(() => { fetchWorkflows(); }, []);

  const runWorkflow = async (e: React.MouseEvent, wf: Workflow) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/workflows/${wf.id}/run`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Start failed");
      }
      const result = await res.json();
      addToast("success", `Workflow '${wf.name}' started`);

      if (wf.type === "team" && wf.template_id) {
        navigate(`/canvas?template=${wf.template_id}&run_id=${result.run_id}`);
      } else {
        navigate(`/canvas?workflow=${wf.id}&run_id=${result.run_id}`);
      }
    } catch (err: any) {
      addToast("error", err.message);
    }
  };

  const deleteWorkflow = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this workflow?")) return;
    try {
      await fetch(`${API_BASE}/api/workflows/${id}`, { method: "DELETE" });
      addToast("success", "Deleted");
      fetchWorkflows();
    } catch {
      addToast("error", "Delete failed");
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return "Never run";
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const statusLabel = (s?: string) => {
    if (!s) return null;
    const map: Record<string, { text: string; cls: string }> = {
      completed: { text: "Completed", cls: "status-completed" },
      running: { text: "Running", cls: "status-running" },
      failed: { text: "Failed", cls: "status-failed" },
      cancelled: { text: "Cancelled", cls: "status-cancelled" },
    };
    const info = map[s] || { text: s, cls: "" };
    return <span className={`wf-status-badge ${info.cls}`}>{info.text}</span>;
  };

  return (
    <div className="workflow-list-page">
      <div className="workflow-list-header">
        <h1>Workflows</h1>
        <button className="wf-create-btn" onClick={() => navigate("/workflows/new")}>
          + New Workflow
        </button>
      </div>

      {loading ? (
        <div className="workflow-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="workflow-card skeleton-card" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-text" />
            </div>
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="workflow-empty">
          <p>No workflows yet</p>
          <p>Create a workflow with preset Agent and task descriptions, run it with one click</p>
          <button className="wf-create-btn" onClick={() => navigate("/workflows/new")}>
            Create First Workflow
          </button>
        </div>
      ) : (
        <div className="workflow-grid">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="workflow-card"
              onClick={() => navigate(`/workflows/${wf.id}/edit`)}
            >
              <div className="workflow-card-top">
                <div className="workflow-card-title">
                  <span className="wf-type-tag">{wf.type === "single" ? "Single" : "Team"}</span>
                  <h3>{wf.name}</h3>
                </div>
                <div className="workflow-card-actions">
                  <button
                    className="wf-run-btn"
                    onClick={(e) => runWorkflow(e, wf)}
                    title="Run"
                  >
                    ▶
                  </button>
                  <button
                    className="wf-delete-btn"
                    onClick={(e) => deleteWorkflow(e, wf.id)}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {wf.description && <p className="workflow-card-desc">{wf.description}</p>}
              <div className="workflow-card-prompt">
                {wf.default_prompt ? wf.default_prompt.slice(0, 80) + (wf.default_prompt.length > 80 ? "..." : "") : "No task description set"}
              </div>
              <div className="workflow-card-footer">
                <span className="wf-last-run">{formatTime(wf.last_run_at)}</span>
                {statusLabel(wf.last_run_status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
