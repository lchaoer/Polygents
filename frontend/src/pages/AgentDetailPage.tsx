import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { API_BASE } from "../config";
import useFlowStore from "../store/flowStore";

interface AgentDetail {
  id: string;
  role: string;
  role_type: string | null;
  model: string | null;
  tools: string[];
  system_prompt: string;
  messages: {
    from: string;
    to: string;
    type: string;
    timestamp: string;
    content: string;
  }[];
  artifacts: string[];
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [tab, setTab] = useState<"config" | "messages" | "artifacts">("config");
  const [editPrompt, setEditPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const addToast = useFlowStore((s) => s.addToast);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/agents/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Agent not found");
        return r.json();
      })
      .then((data) => {
        setAgent(data);
        setEditPrompt(data.system_prompt);
      })
      .catch((e) => addToast("error", e.message));
  }, [id, addToast]);

  const handleSave = async () => {
    if (!id || !agent) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt: editPrompt }),
      });
      if (!res.ok) throw new Error("Save failed");
      addToast("success", "Config updated");
      setAgent({ ...agent, system_prompt: editPrompt });
    } catch (e: any) {
      addToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!agent) {
    return (
      <div className="agent-detail-page">
        <ThemeToggle />
        <p className="feed-empty">Loading...</p>
      </div>
    );
  }

  return (
    <div className="agent-detail-page">
      <ThemeToggle />

      <div className="agent-detail-header">
        <button className="create-dialog-back" onClick={() => navigate(-1)}>← Back</button>
        <h1>{agent.role}</h1>
        {agent.role_type && (
          <span className="team-preview-role-type" style={{
            borderColor: agent.role_type === "planner" ? "#60a5fa" :
              agent.role_type === "executor" ? "#34d399" : "#fbbf24",
            color: agent.role_type === "planner" ? "#60a5fa" :
              agent.role_type === "executor" ? "#34d399" : "#fbbf24",
          }}>
            {agent.role_type}
          </span>
        )}
      </div>

      <div className="panel-tabs" style={{ maxWidth: 600 }}>
        <button className={`panel-tab ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}>
          Config
        </button>
        <button className={`panel-tab ${tab === "messages" ? "active" : ""}`} onClick={() => setTab("messages")}>
          Messages ({agent.messages.length})
        </button>
        <button className={`panel-tab ${tab === "artifacts" ? "active" : ""}`} onClick={() => setTab("artifacts")}>
          Artifacts ({agent.artifacts.length})
        </button>
      </div>

      <div className="agent-detail-content">
        {tab === "config" && (
          <div className="config-content">
            <label className="config-label">Model</label>
            <div className="config-model">
              <span className="model-tag">{agent.model || "Default"}</span>
            </div>

            <label className="config-label">Tools</label>
            <div className="config-tools">
              {agent.tools.map((t) => <span key={t} className="tool-tag">{t}</span>)}
            </div>

            <label className="config-label">System Prompt</label>
            <textarea
              className="create-textarea"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={12}
            />
            <div className="create-actions">
              <button
                className="create-save-btn"
                onClick={handleSave}
                disabled={saving || editPrompt === agent.system_prompt}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {tab === "messages" && (
          <div className="agent-detail-messages">
            {agent.messages.length === 0 ? (
              <p className="feed-empty">No messages yet</p>
            ) : (
              agent.messages.map((m, i) => (
                <div key={i} className="logs-entry">
                  <div className="logs-entry-time">
                    <span className="logs-entry-timestamp">{m.timestamp}</span>
                  </div>
                  <div className="logs-entry-body">
                    <div className="logs-entry-header">
                      <span className="agent-badge">{m.from}</span>
                      <span className="logs-arrow">→</span>
                      <span className="agent-badge">{m.to}</span>
                      <span className="logs-type-tag">{m.type}</span>
                    </div>
                    <div className="logs-entry-content expanded">{m.content}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "artifacts" && (
          <div className="agent-detail-artifacts">
            {agent.artifacts.length === 0 ? (
              <p className="feed-empty">No artifact files yet</p>
            ) : (
              agent.artifacts.map((f) => (
                <div key={f} className="tree-file">{f}</div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
