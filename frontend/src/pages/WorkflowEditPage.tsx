import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

const AVAILABLE_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Skill"];

interface Template {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export default function WorkflowEditPage() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const addToast = useFlowStore((s) => s.addToast);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"single" | "team">("single");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [defaultGoal, setDefaultGoal] = useState("");
  const [saving, setSaving] = useState(false);

  // Single Agent config
  const [agentRole, setAgentRole] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentTools, setAgentTools] = useState<string[]>(["Read", "Write", "Edit", "Bash", "Glob", "Grep"]);
  const [agentModel, setAgentModel] = useState("");
  const [agentSkills, setAgentSkills] = useState<string[]>([]);

  // Multi-Agent config
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [availableSkills, setAvailableSkills] = useState<{name: string; description: string; source: string}[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<{name: string; scope: string; install_path: string; version: string}[]>([]);
  const [agentPlugins, setAgentPlugins] = useState<string[]>([]);

  // Load template list + available skills + plugins
  useEffect(() => {
    fetch(`${API_BASE}/api/teams/templates`)
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => {});
    fetch(`${API_BASE}/api/skills/available`)
      .then((r) => r.json())
      .then(setAvailableSkills)
      .catch(() => {});
    fetch(`${API_BASE}/api/plugins/available`)
      .then((r) => r.json())
      .then(setAvailablePlugins)
      .catch(() => {});
  }, []);

  // Edit mode: load existing workflow
  useEffect(() => {
    if (!editId) return;
    fetch(`${API_BASE}/api/workflows/${editId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Workflow not found");
        return r.json();
      })
      .then((data) => {
        setName(data.name || "");
        setDescription(data.description || "");
        setType(data.type || "single");
        setDefaultPrompt(data.default_prompt || "");
        setDefaultGoal(data.default_goal || "");
        setTemplateId(data.template_id || "");
        if (data.agent_config) {
          setAgentRole(data.agent_config.role || "");
          setAgentPrompt(data.agent_config.system_prompt || "");
          setAgentTools(data.agent_config.tools || []);
          setAgentModel(data.agent_config.model || "");
          setAgentSkills(data.agent_config.skills || []);
          setAgentPlugins(data.agent_config.plugins || []);
        }
      })
      .catch((e) => addToast("error", e.message));
  }, [editId]);

  const toggleTool = (tool: string) => {
    setAgentTools((prev) => {
      const next = prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool];
      if (tool === "Skill" && !next.includes("Skill")) setAgentSkills([]);
      return next;
    });
  };

  const toggleSkill = (skillName: string) => {
    setAgentSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName]
    );
  };

  const togglePlugin = (pluginName: string) => {
    setAgentPlugins((prev) =>
      prev.includes(pluginName) ? prev.filter((p) => p !== pluginName) : [...prev, pluginName]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast("error", "Please enter a workflow name");
      return;
    }
    if (!defaultPrompt.trim()) {
      addToast("error", "Please enter a default task description");
      return;
    }

    setSaving(true);
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      type,
      default_prompt: defaultPrompt.trim(),
      default_goal: defaultGoal.trim(),
    };

    if (type === "single") {
      body.agent_config = {
        id: `wf-${name.trim().toLowerCase().replace(/\s+/g, "-")}`,
        role: agentRole.trim() || name.trim(),
        system_prompt: agentPrompt.trim() || "You are a general assistant. Please complete tasks as instructed.",
        tools: agentTools,
        skills: agentSkills,
        plugins: agentPlugins,
        model: agentModel || null,
      };
    } else {
      body.template_id = templateId || null;
    }

    const url = editId
      ? `${API_BASE}/api/workflows/${editId}`
      : `${API_BASE}/api/workflows`;
    const method = editId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Save failed");
      }
      addToast("success", editId ? "Workflow updated" : "Workflow created");
      navigate("/");
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workflow-edit-page">
      <div className="workflow-edit-header">
        <h1>{editId ? "Edit Workflow" : "New Workflow"}</h1>
      </div>

      <div className="workflow-edit-form">
        <div className="wf-field">
          <label className="wf-label">Workflow Name</label>
          <input
            className="wf-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g.: Daily Report, Code Review"
          />
        </div>

        <div className="wf-field">
          <label className="wf-label">Description</label>
          <input
            className="wf-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe the purpose of this workflow"
          />
        </div>

        <div className="wf-field">
          <label className="wf-label">Type</label>
          <div className="wf-type-selector">
            <button
              className={`wf-type-btn ${type === "single" ? "active" : ""}`}
              onClick={() => setType("single")}
            >
              Single Agent
            </button>
            <button
              className={`wf-type-btn ${type === "team" ? "active" : ""}`}
              onClick={() => setType("team")}
            >
              Multi-Agent Team
            </button>
          </div>
        </div>

        {type === "single" ? (
          <div className="wf-agent-config">
            <div className="wf-field">
              <label className="wf-label">Agent Role Name</label>
              <input
                className="wf-input"
                value={agentRole}
                onChange={(e) => setAgentRole(e.target.value)}
                placeholder="e.g.: Daily Report Assistant, Code Reviewer"
              />
            </div>
            <div className="wf-field">
              <label className="wf-label">System Prompt</label>
              <textarea
                className="wf-textarea"
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="Describe this Agent's responsibilities and workflow..."
                rows={5}
              />
            </div>
            <div className="wf-field">
              <label className="wf-label">Model</label>
              <select
                className="wf-select"
                value={agentModel}
                onChange={(e) => setAgentModel(e.target.value)}
              >
                <option value="">Default</option>
                <option value="claude-opus-4-6">claude-opus-4-6</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
              </select>
            </div>
            <div className="wf-field">
              <label className="wf-label">Tools</label>
              <div className="wf-tools">
                {AVAILABLE_TOOLS.map((tool) => (
                  <label key={tool} className="wf-tool-checkbox">
                    <input
                      type="checkbox"
                      checked={agentTools.includes(tool)}
                      onChange={() => toggleTool(tool)}
                    />
                    <span>{tool}</span>
                  </label>
                ))}
              </div>
            </div>
            {agentTools.includes("Skill") && availableSkills.length > 0 && (
              <div className="wf-field">
                <label className="wf-label">Skills</label>
                <div className="skill-selector">
                  {availableSkills.map((sk) => (
                    <label key={`${sk.source}-${sk.name}`} className="skill-check-item">
                      <input
                        type="checkbox"
                        checked={agentSkills.includes(sk.name)}
                        onChange={() => toggleSkill(sk.name)}
                      />
                      <span>{sk.name}</span>
                      <span className={`skill-source-tag skill-source-${sk.source}`}>{sk.source}</span>
                      {sk.description && <span className="skill-desc">{sk.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {availablePlugins.length > 0 && (
              <div className="wf-field">
                <label className="wf-label">Plugins</label>
                <div className="plugin-selector">
                  {availablePlugins.map((pl) => (
                    <label key={`${pl.scope}-${pl.name}`} className="plugin-check-item">
                      <input
                        type="checkbox"
                        checked={agentPlugins.includes(pl.name)}
                        onChange={() => togglePlugin(pl.name)}
                      />
                      <span>{pl.name}</span>
                      <span className={`plugin-scope-tag plugin-scope-${pl.scope}`}>{pl.scope}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="wf-team-config">
            <div className="wf-field">
              <label className="wf-label">Associated Team Template</label>
              <select
                className="wf-select"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Select a template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.agents.length} Agent)</option>
                ))}
              </select>
              <div className="wf-hint">
                No suitable template?
                <button className="wf-link-btn" onClick={() => navigate("/create?mode=chat")}>
                  Create via Chat
                </button>
                <button className="wf-link-btn" onClick={() => navigate("/create")}>
                  Create via Form
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="wf-field">
          <label className="wf-label">Default Task Description (prompt executed on each run)</label>
          <textarea
            className="wf-textarea"
            value={defaultPrompt}
            onChange={(e) => setDefaultPrompt(e.target.value)}
            placeholder="e.g.: Read project code, generate daily development progress report..."
            rows={4}
          />
        </div>

        <div className="wf-field">
          <label className="wf-label">Default Goal (optional)</label>
          <input
            className="wf-input"
            value={defaultGoal}
            onChange={(e) => setDefaultGoal(e.target.value)}
            placeholder="e.g.: Report includes code changes, test coverage, TODOs"
          />
        </div>

        <div className="wf-actions">
          <button className="wf-cancel-btn" onClick={() => navigate("/")}>
            Cancel
          </button>
          <button
            className="wf-save-btn"
            onClick={handleSave}
            disabled={saving || !name.trim() || !defaultPrompt.trim()}
          >
            {saving ? "Saving..." : editId ? "Update Workflow" : "Create Workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
