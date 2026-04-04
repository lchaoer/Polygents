import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";

const actionConfig: Record<string, { color: string; label: string }> = {
  thinking: { color: "#f59e0b", label: "Thinking" },
  writing: { color: "#3b82f6", label: "Writing" },
  reading: { color: "#06b6d4", label: "Reading" },
  completed: { color: "#22c55e", label: "Done" },
};

export default function AgentPanel() {
  const [tab, setTab] = useState<"thinking" | "config">("thinking");
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodes = useFlowStore((s) => s.nodes);
  const agentActivities = useFlowStore((s) => s.agentActivities);
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const navigate = useNavigate();

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
    idle: "Standby",
    thinking: "Thinking",
    writing: "Working",
    completed: "Done",
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
      {/* Header */}
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

      {/* Detail link */}
      <div style={{ padding: "8px 24px 0", flexShrink: 0, display: "flex", gap: 10 }}>
        <button
          className="create-dialog-back"
          onClick={() => navigate(`/agent/${selectedNodeId}`)}
          style={{ fontSize: 12 }}
        >
          View Full Details →
        </button>
        <button
          className="create-remove-btn"
          onClick={() => {
            if (confirm("Delete this Agent?")) {
              useFlowStore.getState().removeNode(selectedNodeId!);
            }
          }}
          style={{ fontSize: 12 }}
        >
          Delete
        </button>
      </div>

      {/* Tab bar */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${tab === "thinking" ? "active" : ""}`}
          onClick={() => setTab("thinking")}
        >
          Thinking
        </button>
        <button
          className={`panel-tab ${tab === "config" ? "active" : ""}`}
          onClick={() => setTab("config")}
        >
          Config
        </button>
      </div>

      {/* Content area */}
      <div className="panel-content">
        {tab === "thinking" ? (
          <div className="thinking-feed">
            {activities.length === 0 ? (
              <p className="thinking-empty">Waiting for Agent to start...</p>
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
            <label className="config-label">Model</label>
            <div className="config-model">
              <span className="model-tag">{model || "Default"}</span>
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
