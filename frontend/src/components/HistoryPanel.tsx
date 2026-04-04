import { useState, useEffect } from "react";
import type { RunRecord } from "../types";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

const statusConfig: Record<string, { color: string; label: string }> = {
  running: { color: "#f59e0b", label: "Running" },
  completed: { color: "#22c55e", label: "Completed" },
  failed: { color: "#ef4444", label: "Failed" },
  cancelled: { color: "#ef4444", label: "Cancelled" },
};

const formatElapsed = (start: string, end?: string) => {
  try {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = Math.max(0, Math.floor((e - s) / 1000));
    const m = Math.floor(diff / 60);
    const sec = diff % 60;
    return `${m}m ${sec}s`;
  } catch { return ""; }
};

export default function HistoryPanel({ open, onClose, onRerun }: { open: boolean; onClose: () => void; onRerun?: (prompt: string, goal?: string, templateId?: string) => void }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selected, setSelected] = useState<RunRecord | null>(null);
  const [search, setSearch] = useState("");
  const addToast = useFlowStore((s) => s.addToast);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/api/runs/history`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => { setRuns([]); addToast("error", "Failed to load run history"); });
  }, [open, addToast]);

  if (!open) return null;

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-US", { hour12: false });
    } catch {
      return iso;
    }
  };

  const keyword = search.trim().toLowerCase();
  const filtered = keyword
    ? runs.filter((r) =>
        r.prompt.toLowerCase().includes(keyword) ||
        (r.template_id || "").toLowerCase().includes(keyword) ||
        (r.goal || "").toLowerCase().includes(keyword)
      )
    : runs;

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h3>Run History</h3>
          <button className="panel-close-btn" onClick={onClose}>&times;</button>
        </div>

        {selected ? (
          <div className="history-detail">
            <button className="history-back-btn" onClick={() => setSelected(null)}>&larr; Back to List</button>
            <div className="history-detail-content">
              <div className="history-meta">
                <span
                  className="history-status-badge"
                  style={{ background: statusConfig[selected.status]?.color || "#64748b" }}
                >
                  {statusConfig[selected.status]?.label || selected.status}
                </span>
                <span className="history-time">{formatTime(selected.start_time)}</span>
                {selected.status !== "running" && (
                  <span className="history-elapsed">{formatElapsed(selected.start_time, selected.end_time)}</span>
                )}
              </div>
              <label className="config-label">Task</label>
              <p className="history-prompt">{selected.prompt}</p>
              {selected.goal && (
                <>
                  <label className="config-label">Goal</label>
                  <p className="history-prompt">{selected.goal}</p>
                </>
              )}
              {selected.detail && (
                <>
                  <label className="config-label">Result</label>
                  <pre className="config-prompt">{selected.detail}</pre>
                </>
              )}
              {selected.tasks_summary && selected.tasks_summary.length > 0 && (
                <>
                  <label className="config-label">Task Details</label>
                  <div className="history-tasks-list">
                    {selected.tasks_summary.map((t, i) => (
                      <div key={i} className="history-task-item">
                        <span className={`history-task-status ${(t as Record<string, string>).status}`}>
                          {(t as Record<string, string>).status === "completed" ? "✓" : "✗"}
                        </span>
                        <span>{(t as Record<string, string>).description}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {selected.end_time && (
                <p className="history-time">End Time: {formatTime(selected.end_time)}</p>
              )}
              {onRerun && selected.status !== "running" && (
                <button
                  className="history-rerun-btn"
                  onClick={() => {
                    onRerun(selected.prompt, selected.goal || undefined, selected.template_id || undefined);
                    onClose();
                  }}
                >
                  Rerun
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="history-list">
            <input
              className="history-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, templates, goals..."
            />
            {filtered.length === 0 ? (
              <p className="thinking-empty">{keyword ? "No matching records" : "No run records yet"}</p>
            ) : (
              filtered.map((r) => {
                const cfg = statusConfig[r.status] || { color: "#64748b", label: r.status };
                return (
                  <div key={r.id} className="history-item" onClick={() => setSelected(r)}>
                    <div className="history-item-header">
                      <span className="history-status-dot" style={{ background: cfg.color }} />
                      <span className="history-item-prompt">{r.prompt.slice(0, 60)}{r.prompt.length > 60 ? "..." : ""}</span>
                    </div>
                    <div className="history-item-meta">
                      <span className="history-time">{formatTime(r.start_time)}</span>
                      {r.status !== "running" && (
                        <span className="history-elapsed">{formatElapsed(r.start_time, r.end_time)}</span>
                      )}
                      {r.template_id && <span className="agent-badge">{r.template_id}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
