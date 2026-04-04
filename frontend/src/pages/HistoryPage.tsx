import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

interface RunRecord {
  id: string;
  template_id?: string;
  prompt: string;
  goal?: string;
  status: string;
  start_time: string;
  end_time?: string;
  detail: string;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const addToast = useFlowStore((s) => s.addToast);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/api/runs/history`)
      .then((r) => r.json())
      .then((data) => { setRuns(data); setLoading(false); })
      .catch(() => { addToast("error", "Failed to load history"); setLoading(false); });
  }, []);

  const filtered = runs.filter((r) =>
    !search || r.prompt.includes(search) || r.id.includes(search) || (r.template_id || "").includes(search)
  );

  const formatTime = (iso?: string) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-US");
  };

  const elapsed = (r: RunRecord) => {
    if (!r.start_time) return "-";
    const start = new Date(r.start_time).getTime();
    const end = r.end_time ? new Date(r.end_time).getTime() : Date.now();
    const s = Math.floor((end - start) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const statusClass = (s: string) => {
    if (s === "completed") return "status-completed";
    if (s === "running") return "status-running";
    if (s === "failed") return "status-failed";
    return "status-cancelled";
  };

  const rerun = (r: RunRecord) => {
    const params = new URLSearchParams();
    if (r.template_id) params.set("template", r.template_id);
    params.set("prompt", r.prompt);
    if (r.goal) params.set("goal", r.goal);
    navigate(`/canvas?${params.toString()}`);
  };

  return (
    <div className="history-page">
      <div className="history-page-header">
        <h1>Run History</h1>
        <input
          className="history-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prompt, ID, template..."
        />
      </div>

      {loading ? (
        <p className="history-loading">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="history-empty">No run records</p>
      ) : (
        <div className="history-list">
          {filtered.map((r) => (
            <div
              key={r.id}
              className={`history-item ${expandedId === r.id ? "expanded" : ""}`}
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
            >
              <div className="history-item-row">
                <span className={`history-status ${statusClass(r.status)}`}>
                  {r.status}
                </span>
                <span className="history-prompt">{r.prompt.slice(0, 60)}</span>
                <span className="history-time">{formatTime(r.start_time)}</span>
                <span className="history-elapsed">{elapsed(r)}</span>
              </div>
              {expandedId === r.id && (
                <div className="history-detail">
                  <div><strong>ID:</strong> {r.id}</div>
                  <div><strong>Prompt:</strong> {r.prompt}</div>
                  {r.goal && <div><strong>Goal:</strong> {r.goal}</div>}
                  {r.template_id && <div><strong>Template:</strong> {r.template_id}</div>}
                  {r.detail && <div><strong>Detail:</strong> {r.detail.slice(0, 300)}</div>}
                  <button className="history-rerun-btn" onClick={(e) => { e.stopPropagation(); rerun(r); }}>
                    Rerun
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
