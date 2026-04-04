interface AgentPreview {
  id?: string;
  role?: string;
  role_type?: string;
  model?: string;
  system_prompt?: string;
  tools?: string[];
}

interface TeamPreviewProps {
  config: Record<string, unknown> | null;
}

const ROLE_TYPE_LABELS: Record<string, string> = {
  planner: "Planner",
  executor: "Executor",
  reviewer: "Reviewer",
};

const ROLE_TYPE_COLORS: Record<string, string> = {
  planner: "#60a5fa",
  executor: "#34d399",
  reviewer: "#fbbf24",
};

export default function TeamPreview({ config }: TeamPreviewProps) {
  if (!config) {
    return (
      <div className="team-preview">
        <div className="team-preview-empty">
          <div className="team-preview-empty-icon">🚀</div>
          <p>After chatting with Meta-Agent</p>
          <p>Team config will preview here in real-time</p>
        </div>
      </div>
    );
  }

  const name = (config.name as string) || "Unnamed Team";
  const description = (config.description as string) || "";
  const agents = (config.agents as AgentPreview[]) || [];

  return (
    <div className="team-preview">
      <div className="team-preview-header">
        <h3 className="team-preview-name">{name}</h3>
        {description && (
          <p className="team-preview-desc">{description}</p>
        )}
        <span className="team-preview-count">{agents.length} Agents</span>
      </div>

      <div className="team-preview-agents">
        {agents.map((agent, i) => (
          <div key={agent.id || i} className="team-preview-card">
            <div className="team-preview-card-header">
              <span className="team-preview-role">
                {agent.role || agent.id || `Agent ${i + 1}`}
              </span>
              {agent.role_type && (
                <span
                  className="team-preview-role-type"
                  style={{
                    borderColor:
                      ROLE_TYPE_COLORS[agent.role_type] || "#888",
                    color: ROLE_TYPE_COLORS[agent.role_type] || "#888",
                  }}
                >
                  {ROLE_TYPE_LABELS[agent.role_type] || agent.role_type}
                </span>
              )}
            </div>

            {agent.model && (
              <div className="team-preview-model">{agent.model}</div>
            )}

            {agent.tools && agent.tools.length > 0 && (
              <div className="team-preview-tools">
                {agent.tools.map((tool) => (
                  <span key={tool} className="team-preview-tool-tag">
                    {tool}
                  </span>
                ))}
              </div>
            )}

            {agent.system_prompt && (
              <div className="team-preview-prompt">
                {agent.system_prompt.length > 80
                  ? agent.system_prompt.slice(0, 80) + "..."
                  : agent.system_prompt}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
