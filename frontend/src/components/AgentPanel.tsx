import { useState } from "react";
import useFlowStore from "../store/flowStore";

const actionConfig: Record<string, { color: string; label: string }> = {
  thinking: { color: "#f59e0b", label: "思考" },
  writing: { color: "#3b82f6", label: "执行" },
  reading: { color: "#06b6d4", label: "阅读" },
  completed: { color: "#22c55e", label: "完成" },
};

export default function AgentPanel() {
  const [tab, setTab] = useState<"thinking" | "config">("thinking");
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodes = useFlowStore((s) => s.nodes);
  const agentActivities = useFlowStore((s) => s.agentActivities);
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const { role, status, systemPrompt, tools, model } = node.data as {
    role: string;
    status: string;
    systemPrompt: string;
    tools: string[];
    model?: string;
  };

  const statusLabel: Record<string, string> = {
    idle: "待命",
    thinking: "思考中",
    writing: "执行中",
    completed: "完成",
  };

  const statusColor: Record<string, string> = {
    idle: "#64748b",
    thinking: "#f59e0b",
    writing: "#3b82f6",
    completed: "#22c55e",
  };

  const activities = agentActivities[selectedNodeId!] || [];

  return (
    <div className="side-panel">
      {/* 头部 */}
      <div className="panel-header">
        <div className="panel-header-info">
          <div
            className={`agent-status-dot ${status === "thinking" || status === "writing" ? "pulsing" : ""}`}
            style={{ backgroundColor: statusColor[status] || "#64748b" }}
          />
          <h3>{role}</h3>
          <span className="panel-status-label" style={{ color: statusColor[status] || "#64748b" }}>
            {statusLabel[status] || status}
          </span>
        </div>
        <button className="panel-close-btn" onClick={() => setSelectedNode(null)}>
          &times;
        </button>
      </div>

      {/* Tab 栏 */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${tab === "thinking" ? "active" : ""}`}
          onClick={() => setTab("thinking")}
        >
          思考过程
        </button>
        <button
          className={`panel-tab ${tab === "config" ? "active" : ""}`}
          onClick={() => setTab("config")}
        >
          配置
        </button>
      </div>

      {/* 内容区 */}
      <div className="panel-content">
        {tab === "thinking" ? (
          <div className="thinking-feed">
            {activities.length === 0 ? (
              <p className="thinking-empty">等待 Agent 开始工作...</p>
            ) : (
              [...activities].reverse().map((a, i) => {
                const cfg = actionConfig[a.data.action] || actionConfig.thinking;
                return (
                  <div
                    key={`${a.data.action}-${i}`}
                    className="thinking-item"
                    style={{ borderLeftColor: cfg.color }}
                  >
                    <span className="action-badge" style={{ background: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="thinking-detail">{a.data.detail}</span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="config-content">
            <label className="config-label">模型</label>
            <div className="config-model">
              <span className="model-tag">{model || "默认"}</span>
            </div>

            <label className="config-label">System Prompt</label>
            <pre className="config-prompt">{systemPrompt}</pre>

            <label className="config-label">Tools</label>
            <div className="config-tools">
              {tools.map((t) => (
                <span key={t} className="tool-tag">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
