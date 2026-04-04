import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type AgentNodeData = {
  role: string;
  status: "idle" | "thinking" | "writing" | "completed";
  systemPrompt: string;
  tools: string[];
  model?: string;
  latestActivity?: string;
};

type AgentNodeType = Node<AgentNodeData, "agent">;

const statusConfig = {
  idle: { color: "#64748b", label: "Standby" },
  thinking: { color: "#f59e0b", label: "Thinking" },
  writing: { color: "#3b82f6", label: "Working" },
  completed: { color: "#22c55e", label: "Done" },
};

const AgentNode = memo(({ id, data, selected }: NodeProps<AgentNodeType>) => {
  const { color, label } = statusConfig[data.status] || statusConfig.idle;
  const isActive = data.status === "thinking" || data.status === "writing";
  const borderColor = selected
    ? "#00f0ff"
    : isActive
      ? color
      : data.status === "completed"
        ? "#22c55e"
        : "var(--border-light)";

  return (
    <div
      className={`agent-node ${selected ? "selected" : ""} ${isActive ? "active" : ""}`}
      style={{ borderColor }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="agent-node-header">
        <div
          className={`agent-status-dot ${isActive ? "pulsing" : ""}`}
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
        <span className="agent-role">{data.role}</span>
        <span className="agent-status-label" style={{ color }}>{label}</span>
      </div>

      <div className="agent-node-id">{id}</div>
      {data.model && (
        <div className="agent-node-model">{data.model}</div>
      )}

      {data.tools && data.tools.length > 0 && (
        <div className="agent-node-tools">
          {data.tools.map((t) => (
            <span key={t} className="tool-tag">{t}</span>
          ))}
        </div>
      )}

      {data.latestActivity && (
        <div className="agent-node-preview">{data.latestActivity}</div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

AgentNode.displayName = "AgentNode";
export default AgentNode;
