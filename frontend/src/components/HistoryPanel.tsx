import { useState, useEffect } from "react";
import type { RunRecord } from "../types";

const statusConfig: Record<string, { color: string; label: string }> = {
  running: { color: "#f59e0b", label: "运行中" },
  completed: { color: "#22c55e", label: "已完成" },
  failed: { color: "#ef4444", label: "失败" },
};

export default function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selected, setSelected] = useState<RunRecord | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("http://127.0.0.1:8001/api/runs/history")
      .then((r) => r.json())
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => setRuns([]));
  }, [open]);

  if (!open) return null;

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("zh-CN", { hour12: false });
    } catch {
      return iso;
    }
  };

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h3>运行历史</h3>
          <button className="panel-close-btn" onClick={onClose}>&times;</button>
        </div>

        {selected ? (
          <div className="history-detail">
            <button className="history-back-btn" onClick={() => setSelected(null)}>&larr; 返回列表</button>
            <div className="history-detail-content">
              <div className="history-meta">
                <span
                  className="history-status-badge"
                  style={{ background: statusConfig[selected.status]?.color || "#64748b" }}
                >
                  {statusConfig[selected.status]?.label || selected.status}
                </span>
                <span className="history-time">{formatTime(selected.start_time)}</span>
              </div>
              <label className="config-label">任务</label>
              <p className="history-prompt">{selected.prompt}</p>
              {selected.goal && (
                <>
                  <label className="config-label">目标</label>
                  <p className="history-prompt">{selected.goal}</p>
                </>
              )}
              {selected.detail && (
                <>
                  <label className="config-label">结果</label>
                  <pre className="config-prompt">{selected.detail}</pre>
                </>
              )}
              {selected.end_time && (
                <p className="history-time">结束时间: {formatTime(selected.end_time)}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="history-list">
            {runs.length === 0 ? (
              <p className="thinking-empty">暂无运行记录</p>
            ) : (
              runs.map((r) => {
                const cfg = statusConfig[r.status] || { color: "#64748b", label: r.status };
                return (
                  <div key={r.id} className="history-item" onClick={() => setSelected(r)}>
                    <div className="history-item-header">
                      <span className="history-status-dot" style={{ background: cfg.color }} />
                      <span className="history-item-prompt">{r.prompt.slice(0, 60)}{r.prompt.length > 60 ? "..." : ""}</span>
                    </div>
                    <div className="history-item-meta">
                      <span className="history-time">{formatTime(r.start_time)}</span>
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
