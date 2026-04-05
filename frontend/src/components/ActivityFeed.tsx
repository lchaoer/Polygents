import { useState } from "react";
import useFlowStore from "../store/flowStore";

const statusDotColor: Record<string, string> = {
  idle: "#64748b",
  running: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#ef4444",
};

const statusLabel: Record<string, string> = {
  idle: "Ready",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const formatTs = (ts?: string) => {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
};

function ThinkingDetail({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;

  return (
    <span
      className={`activity-detail activity-thinking ${isLong && !expanded ? "expandable" : ""} ${expanded ? "expanded" : ""}`}
      onClick={isLong ? () => setExpanded(!expanded) : undefined}
      title={isLong && !expanded ? "Click to expand" : undefined}
    >
      {text}
    </span>
  );
}

export default function ActivityFeed() {
  const activities = useFlowStore((s) => s.activities);
  const runStatus = useFlowStore((s) => s.runStatus);
  const runDetail = useFlowStore((s) => s.runDetail);
  const wsConnected = useFlowStore((s) => s.wsConnected);
  const nodes = useFlowStore((s) => s.nodes);
  const [filter, setFilter] = useState<string>("all");

  const agentIds = nodes.map((n) => n.id);

  const filtered = filter === "all"
    ? activities
    : activities.filter((a) => {
        if (filter === "status") return a.type === "run_status";
        return a.type === "agent_activity" && (a.data as Record<string, string>).agent_id === filter;
      });

  return (
    <div className="side-panel">
      <h3>Run Monitor</h3>

      {/* Status indicator */}
      <div className="run-status-bar">
        <div
          className={`status-dot ${runStatus === "running" ? "pulsing" : ""}`}
          style={{ backgroundColor: statusDotColor[runStatus] || "#64748b" }}
        />
        <span className="run-status-text">{statusLabel[runStatus] || runStatus}</span>
        <div className="ws-status">
          <div
            className={`status-dot ${!wsConnected ? "pulsing" : ""}`}
            style={{ backgroundColor: wsConnected ? "#22c55e" : "#ef4444" }}
          />
          <span>{wsConnected ? "Connected" : "Reconnecting"}</span>
        </div>
      </div>
      {runDetail && <p className="run-detail">{runDetail}</p>}

      <div className="feed-header">
        <h4 className="feed-title">Activity Feed</h4>
        <select className="activity-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="status">Status Only</option>
          {agentIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      <div className="activity-feed">
        {filtered.length === 0 ? (
          <p className="feed-empty">Waiting for run...</p>
        ) : (
          [...filtered].reverse().map((a, i) => {
            const ts = (a.data as Record<string, string>).timestamp;
            const isThinking = a.type === "agent_activity" && (a.data as Record<string, string>).action === "thinking";
            return (
              <div
                key={`${a.type}-${i}`}
                className={`activity-item ${a.type === "run_status" ? "status-item" : ""} ${isThinking ? "thinking-item" : ""}`}
              >
                {ts && <span className="activity-timestamp">{formatTs(ts)}</span>}
                {a.type === "agent_activity" && (
                  <>
                    <span className="agent-badge">
                      {(a.data as Record<string, string>).agent_id}
                    </span>
                    {isThinking ? (
                      <ThinkingDetail text={(a.data as Record<string, string>).detail} />
                    ) : (
                      <span className="activity-detail">
                        {(a.data as Record<string, string>).detail}
                      </span>
                    )}
                  </>
                )}
                {a.type === "run_status" && (
                  <span className="activity-detail status-detail">
                    {(a.data as Record<string, string>).detail}
                  </span>
                )}
                {a.type !== "agent_activity" && a.type !== "run_status" && (
                  <span className="activity-detail">
                    {(a.data as Record<string, string>).detail || a.type}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
