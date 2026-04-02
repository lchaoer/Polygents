import useFlowStore from "../store/flowStore";

const statusDotColor: Record<string, string> = {
  idle: "#64748b",
  running: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
};

const statusLabel: Record<string, string> = {
  idle: "就绪",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
};

export default function ActivityFeed() {
  const activities = useFlowStore((s) => s.activities);
  const runStatus = useFlowStore((s) => s.runStatus);
  const runDetail = useFlowStore((s) => s.runDetail);

  return (
    <div className="side-panel">
      <h3>运行监控</h3>

      {/* 状态指示器 */}
      <div className="run-status-bar">
        <div
          className={`status-dot ${runStatus === "running" ? "pulsing" : ""}`}
          style={{ backgroundColor: statusDotColor[runStatus] || "#64748b" }}
        />
        <span className="run-status-text">{statusLabel[runStatus] || runStatus}</span>
      </div>
      {runDetail && <p className="run-detail">{runDetail}</p>}

      <h4 className="feed-title">活动流</h4>
      <div className="activity-feed">
        {activities.length === 0 ? (
          <p className="feed-empty">等待运行...</p>
        ) : (
          [...activities].reverse().map((a, i) => (
            <div
              key={`${a.type}-${i}`}
              className={`activity-item ${a.type === "run_status" ? "status-item" : ""}`}
            >
              {a.type === "agent_activity" && (
                <>
                  <span className="agent-badge">
                    {(a.data as Record<string, string>).agent_id}
                  </span>
                  <span className="activity-detail">
                    {(a.data as Record<string, string>).detail}
                  </span>
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
          ))
        )}
      </div>
    </div>
  );
}
