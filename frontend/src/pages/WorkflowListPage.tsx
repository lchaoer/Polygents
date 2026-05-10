import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import type { RunSummary, WorkflowSummary } from "../types";

interface WfStat {
  total: number;
  lastState: RunSummary["state"] | null;
  lastTime: string | null;
}

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WorkflowListPage() {
  const [items, setItems] = useState<WorkflowSummary[] | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const navigate = useNavigate();
  const toast = useToast();

  const reload = () => {
    Promise.all([api.listWorkflows(), api.listRuns()])
      .then(([ws, rs]) => {
        setItems(ws);
        setRuns(rs);
      })
      .catch((e) => {
        setItems([]);
        toast.showError(`Failed to load workflows: ${String(e)}`);
      });
  };

  useEffect(reload, []);

  const stats = useMemo(() => {
    const m = new Map<string, WfStat>();
    for (const r of runs) {
      const cur = m.get(r.workflow_id) ?? { total: 0, lastState: null, lastTime: null };
      cur.total += 1;
      if (!cur.lastTime || r.created_at > cur.lastTime) {
        cur.lastTime = r.created_at;
        cur.lastState = r.state;
      }
      m.set(r.workflow_id, cur);
    }
    return m;
  }, [runs]);

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete workflow "${name}"?\n\nThis removes the workflow folder. Existing runs are kept.`)) return;
    try {
      await api.deleteWorkflow(id);
      toast.showInfo(`Deleted "${name}"`);
      reload();
    } catch (e) {
      toast.showError(`Delete failed: ${String(e)}`);
    }
  };

  const onDuplicate = async (id: string, name: string) => {
    try {
      const dup = await api.duplicateWorkflow(id);
      toast.showInfo(`Duplicated "${name}"`);
      navigate(`/workflows/${dup.id}`);
    } catch (e) {
      toast.showError(`Duplicate failed: ${String(e)}`);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workflows</h1>
          <p className="page-sub">
            Author worker / critic pairs. Run them on a task and watch the loop.
          </p>
        </div>
        <button className="btn primary" onClick={() => navigate("/workflows/new")}>
          + New workflow
        </button>
      </div>

      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <svg
            width="120"
            height="80"
            viewBox="0 0 120 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--ink-mute)", marginBottom: 12 }}
            aria-hidden
          >
            <rect x="20" y="22" width="80" height="36" rx="6" />
            <path d="M20 32 H 100" />
            <circle cx="28" cy="27" r="1.4" fill="currentColor" />
            <circle cx="34" cy="27" r="1.4" fill="currentColor" />
            <path d="M30 44 H 60" strokeDasharray="2 3" />
            <path d="M30 50 H 80" strokeDasharray="2 3" />
          </svg>
          <p>No workflows yet.</p>
          <p className="card-sub">Click <b>+ New workflow</b> to create your first one.</p>
        </div>
      ) : (
        <ul className="wf-list">
          {items.map((w) => {
            const s = stats.get(w.id);
            return (
              <li key={w.id} className="wf-row">
                <Link to={`/workflows/${w.id}`} className="wf-row-link">
                  <div className="wf-row-main">
                    <div className="wf-row-title">{w.name}</div>
                    <div className="wf-row-id">{w.id}</div>
                  </div>

                  <div className="wf-stat">
                    <div className="wf-stat-label">Runs</div>
                    <div className={`wf-stat-value${s ? "" : " muted"}`}>
                      {s ? s.total : "—"}
                    </div>
                  </div>

                  <div className="wf-stat">
                    <div className="wf-stat-label">Last run</div>
                    <div className={`wf-stat-value${s ? "" : " muted"}`}>
                      {s?.lastState ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span className={`status-dot ${s.lastState}`} />
                          {relTime(s.lastTime)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>

                  <div className="wf-row-actions" onClick={(e) => e.preventDefault()}>
                    <button
                      className="btn ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDuplicate(w.id, w.name);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      className="btn ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(w.id, w.name);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
