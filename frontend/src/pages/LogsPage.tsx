import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { API_BASE } from "../config";
import useFlowStore from "../store/flowStore";

interface LogEntry {
  date: string;
  timestamp: string;
  from: string;
  to: string;
  type: string;
  content: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const addToast = useFlowStore((s) => s.addToast);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterAgent) params.set("from", filterAgent);
    if (filterType) params.set("type", filterType);
    const qs = params.toString();

    fetch(`${API_BASE}/api/logs${qs ? "?" + qs : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.json();
      })
      .then((data) => { setLogs(data); setLoading(false); })
      .catch((e) => { addToast("error", e.message); setLoading(false); });
  }, [filterAgent, filterType, addToast]);

  const agents = [...new Set(logs.flatMap((l) => [l.from, l.to]))].sort();
  const types = [...new Set(logs.map((l) => l.type))].sort();

  const filtered = logs.filter((l) => {
    if (search && !l.content.toLowerCase().includes(search.toLowerCase()) &&
        !l.from.toLowerCase().includes(search.toLowerCase()) &&
        !l.to.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="logs-page">
      <ThemeToggle />

      <div className="logs-header">
        <button className="create-dialog-back" onClick={() => navigate("/")}>← Back</button>
        <h1>Communication Logs</h1>
      </div>

      <div className="logs-filters">
        <input
          className="logs-search"
          placeholder="Search content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="activity-filter"
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
        >
          <option value="">All Agents</option>
          {agents.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="activity-filter"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="feed-empty">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="feed-empty">No communication logs</p>
      ) : (
        <div className="logs-timeline">
          {filtered.map((entry, i) => (
            <div key={i} className="logs-entry" onClick={() => toggleExpand(i)}>
              <div className="logs-entry-time">
                <span className="logs-entry-date">{entry.date}</span>
                <span className="logs-entry-timestamp">{entry.timestamp}</span>
              </div>
              <div className="logs-entry-body">
                <div className="logs-entry-header">
                  <span className="agent-badge">{entry.from}</span>
                  <span className="logs-arrow">→</span>
                  <span className="agent-badge">{entry.to}</span>
                  <span className="logs-type-tag">{entry.type}</span>
                </div>
                <div className={`logs-entry-content ${expanded.has(i) ? "expanded" : ""}`}>
                  {entry.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
