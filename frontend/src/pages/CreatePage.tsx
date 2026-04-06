import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import MetaAgentChat from "../components/MetaAgentChat";
import TeamPreview from "../components/TeamPreview";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";
import { ROLE_PRESETS } from "../constants/rolePresets";

const AVAILABLE_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Skill"];
const ROLE_TYPES = ["planner", "executor", "reviewer", "tester", "designer", "researcher"];

interface AgentForm {
  id: string;
  role: string;
  role_type: string;
  model: string;
  system_prompt: string;
  tools: string[];
  skills: string[];
  plugins: string[];
}

const emptyAgent = (): AgentForm => ({
  id: `agent-${Date.now()}`,
  role: "",
  role_type: "",
  model: "",
  system_prompt: "",
  tools: [],
  skills: [],
  plugins: [],
});

export default function CreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");
  const mode = params.get("mode"); // "chat" = chat mode
  const addToast = useFlowStore((s) => s.addToast);

  // ── Chat mode state ──
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [teamPreviewConfig, setTeamPreviewConfig] = useState<Record<string, unknown> | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [teamCreated, setTeamCreated] = useState<{
    template_id: string;
    name: string;
    agents_created: string[];
  } | null>(null);

  // ── Form mode state (all Hooks must be declared before conditional returns) ──
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [executionMode, setExecutionMode] = useState("sequential");
  const [agents, setAgents] = useState<AgentForm[]>([emptyAgent()]);
  const [showYaml, setShowYaml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [advancedMode, setAdvancedMode] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [availableSkills, setAvailableSkills] = useState<{name: string; description: string; source: string}[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<{name: string; scope: string; install_path: string; version: string}[]>([]);

  // Load available skills + plugins
  useEffect(() => {
    fetch(`${API_BASE}/api/skills/available`)
      .then((r) => r.json())
      .then(setAvailableSkills)
      .catch(() => {});
    fetch(`${API_BASE}/api/plugins/available`)
      .then((r) => r.json())
      .then(setAvailablePlugins)
      .catch(() => {});
  }, []);

  // Edit mode: load existing template
  useEffect(() => {
    if (!editId) return;
    fetch(`${API_BASE}/api/teams/templates/${editId}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setDescription(data.description || "");
        setExecutionMode(data.execution_mode || "sequential");
        setAgents(
          (data.agents || []).map((a: any) => ({
            id: a.id || "",
            role: a.role || "",
            role_type: a.role_type || "",
            model: a.model || "",
            system_prompt: a.system_prompt || "",
            tools: a.tools || [],
            skills: a.skills || [],
            plugins: a.plugins || [],
          }))
        );
      })
      .catch(() => addToast("error", "Failed to load template data"));
  }, [editId]);

  const updateAgent = (idx: number, field: keyof AgentForm, value: any) => {
    setAgents((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        const updated = { ...a, [field]: value };
        // Auto-fill from presets when role_type changes in Basic mode
        if (field === "role_type" && !advancedMode && value in ROLE_PRESETS) {
          const preset = ROLE_PRESETS[value as string];
          if (!a.system_prompt) updated.system_prompt = preset.system_prompt;
          if (a.tools.length === 0) updated.tools = preset.tools;
        }
        return updated;
      })
    );
  };

  const toggleTool = (idx: number, tool: string) => {
    setAgents((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        const has = a.tools.includes(tool);
        const newTools = has ? a.tools.filter((t) => t !== tool) : [...a.tools, tool];
        // Clear selected skills when Skill tool is deselected
        const newSkills = newTools.includes("Skill") ? a.skills : [];
        return { ...a, tools: newTools, skills: newSkills };
      })
    );
  };

  const toggleSkill = (idx: number, skillName: string) => {
    setAgents((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        const has = a.skills.includes(skillName);
        return { ...a, skills: has ? a.skills.filter((s) => s !== skillName) : [...a.skills, skillName] };
      })
    );
  };

  const togglePlugin = (idx: number, pluginName: string) => {
    setAgents((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        const has = a.plugins.includes(pluginName);
        return { ...a, plugins: has ? a.plugins.filter((p) => p !== pluginName) : [...a.plugins, pluginName] };
      })
    );
  };

  const addAgent = () => setAgents((prev) => [...prev, emptyAgent()]);

  const removeAgent = (idx: number) => {
    if (agents.length <= 1) return;
    setAgents((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    const warns: string[] = [];

    if (!name.trim()) errs.name = "Team name is required";

    const ids = new Set<string>();
    agents.forEach((a, i) => {
      if (!a.role.trim()) errs[`agent-${i}-role`] = "Role name is required";
      if (!a.id.trim()) errs[`agent-${i}-id`] = "ID is required";
      if (ids.has(a.id.trim())) errs[`agent-${i}-id`] = "Duplicate ID";
      ids.add(a.id.trim());
    });

    const roleTypes = agents.map((a) => a.role_type).filter(Boolean);
    if (!roleTypes.includes("planner")) warns.push("Missing planner role");
    if (!roleTypes.includes("executor")) warns.push("Missing executor role");
    if (!roleTypes.includes("reviewer")) warns.push("Missing reviewer role");

    setErrors(errs);
    setWarnings(warns);
    return Object.keys(errs).length === 0;
  }, [name, agents]);

  const generateYaml = useCallback(() => {
    const data = {
      name,
      description,
      agents: agents.map((a) => {
        const obj: Record<string, any> = { id: a.id, role: a.role };
        if (a.role_type) obj.role_type = a.role_type;
        if (a.model) obj.model = a.model;
        obj.system_prompt = a.system_prompt;
        obj.tools = a.tools;
        return obj;
      }),
    };
    let yaml = `name: "${data.name}"\ndescription: "${data.description}"\nexecution_mode: ${executionMode}\nagents:\n`;
    for (const agent of data.agents) {
      yaml += `  - id: ${agent.id}\n`;
      yaml += `    role: "${agent.role}"\n`;
      if (agent.role_type) yaml += `    role_type: ${agent.role_type}\n`;
      if (agent.model) yaml += `    model: "${agent.model}"\n`;
      yaml += `    system_prompt: |\n`;
      for (const line of (agent.system_prompt || "").split("\n")) {
        yaml += `      ${line}\n`;
      }
      yaml += `    tools:\n`;
      for (const tool of agent.tools) {
        yaml += `      - ${tool}\n`;
      }
    }
    return yaml;
  }, [name, description, agents]);

  const handleImportYaml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await fetch(`${API_BASE}/api/teams/templates/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml_text: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Import failed");
      }
      const data = await res.json();
      addToast("success", `Template imported: ${data.id}`);
      navigate("/");
    } catch (err: any) {
      addToast("error", err.message);
    }
    if (importRef.current) importRef.current.value = "";
  };

  const handleFinalize = async () => {
    if (!chatSessionId || !teamPreviewConfig) return;
    setFinalizing(true);
    try {
      const res = await fetch(`${API_BASE}/api/meta-agent/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: chatSessionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Save failed");
      }
      const result = await res.json();
      addToast("success", `Team created: ${result.name || result.template_id}`);
      navigate(`/canvas?template=${result.template_id}`);
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setFinalizing(false);
    }
  };

  // ── Chat mode UI ──
  if (mode === "chat" && !editId) {
    return (
      <div className="create-page create-dialog-layout">
        <ThemeToggle />
        <div className="create-header">
          <button className="history-back-btn" onClick={() => navigate("/")}>
            &larr; Back to Home
          </button>
          <h1>Chat-based Team Creation</h1>
          <button
            className="create-save-btn"
            onClick={() => navigate("/create")}
          >
            Switch to Form Mode
          </button>
        </div>

        <div className="create-dialog-body">
          <div className="create-dialog-chat">
            <MetaAgentChat
              sessionId={chatSessionId}
              onSessionId={setChatSessionId}
              onTeamPreview={setTeamPreviewConfig}
              onTeamCreated={(data) => {
                setTeamCreated(data);
                addToast("success", `Team "${data.name}" auto-created (${data.agents_created.length} Agents)`);
              }}
            />
          </div>
          <div className="create-dialog-preview">
            <TeamPreview config={teamPreviewConfig} />
            {teamCreated ? (
              <div className="team-created-banner">
                <div className="team-created-info">
                  Team '{teamCreated.name}' created ({teamCreated.agents_created.length} Agents)
                </div>
                <button
                  className="create-save-btn create-go-canvas-btn"
                  onClick={() => navigate(`/canvas?template=${teamCreated.template_id}`)}
                >
                  Go to Canvas
                </button>
                <div className="team-created-hint">
                  Continue chatting to modify team config
                </div>
              </div>
            ) : teamPreviewConfig ? (
              <button
                className="create-save-btn create-finalize-btn"
                onClick={handleFinalize}
                disabled={finalizing}
              >
                {finalizing ? "Saving..." : "Confirm & Go to Canvas"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Form mode UI ──

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const body = {
      name: name.trim(),
      description: description.trim(),
      execution_mode: executionMode,
      agents: agents.map((a) => ({
        id: a.id,
        role: a.role,
        role_type: a.role_type || null,
        model: a.model || null,
        system_prompt: a.system_prompt,
        tools: a.tools,
        skills: a.skills,
        plugins: a.plugins,
      })),
    };

    const url = editId
      ? `${API_BASE}/api/teams/templates/${editId}`
      : `${API_BASE}/api/teams/templates`;
    const method = editId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      const result = await res.json();
      addToast("success", editId ? "Template updated" : "Template created");
      if (result.warnings && result.warnings.length > 0) {
        addToast("info", "Note: " + result.warnings.join("、"));
      }
      navigate("/");
    } catch (e: any) {
      addToast("error", e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-page">
      <ThemeToggle />
      <div className="create-header">
        <button className="history-back-btn" onClick={() => navigate("/")}>
          &larr; Back to Home
        </button>
        <h1>{editId ? "Edit Template" : "Create Custom Team"}</h1>
        {!editId && (
          <>
            <input
              ref={importRef}
              type="file"
              accept=".yaml,.yml"
              style={{ display: "none" }}
              onChange={handleImportYaml}
            />
            <button className="create-import-btn" onClick={() => importRef.current?.click()}>
              Import from YAML
            </button>
          </>
        )}
      </div>

      <div className="create-form">
        <div className="create-field">
          <label className="config-label">Team Name</label>
          <input
            className="create-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g.: Frontend Dev Team"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="create-field">
          <label className="config-label">Description</label>
          <input
            className="create-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Team purpose description"
          />
        </div>

        <div className="create-field">
          <label className="config-label">Execution Mode</label>
          <select
            className="create-select"
            value={executionMode}
            onChange={(e) => setExecutionMode(e.target.value)}
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
            <option value="free">Free Collaboration</option>
          </select>
        </div>

        <div className="create-mode-toggle">
          <button
            className={`mode-toggle-btn ${!advancedMode ? "active" : ""}`}
            onClick={() => setAdvancedMode(false)}
          >
            Basic
          </button>
          <button
            className={`mode-toggle-btn ${advancedMode ? "active" : ""}`}
            onClick={() => setAdvancedMode(true)}
          >
            Advanced
          </button>
        </div>

        <div className="create-agents-section">
          <div className="create-agents-header">
            <label className="config-label">Agent List</label>
            <button className="create-add-btn" onClick={addAgent}>+ Add Agent</button>
          </div>

          {agents.map((agent, idx) => (
            <div key={idx} className="create-agent-card">
              <div className="create-agent-card-header">
                <span className="create-agent-idx">Agent #{idx + 1}</span>
                {agents.length > 1 && (
                  <button className="create-remove-btn" onClick={() => removeAgent(idx)}>
                    Delete
                  </button>
                )}
              </div>

              <div className="create-agent-fields">
                {advancedMode && (
                  <div className="create-field-row">
                    <div className="create-field">
                      <label className="config-label">ID</label>
                      <input
                        className="create-input"
                        value={agent.id}
                        onChange={(e) => updateAgent(idx, "id", e.target.value)}
                        placeholder="agent-id"
                      />
                      {errors[`agent-${idx}-id`] && <span className="field-error">{errors[`agent-${idx}-id`]}</span>}
                    </div>
                  </div>
                )}

                <div className="create-field-row">
                  <div className="create-field">
                    <label className="config-label">Role Name</label>
                    <input
                      className="create-input"
                      value={agent.role}
                      onChange={(e) => updateAgent(idx, "role", e.target.value)}
                      placeholder="e.g.: Project Manager"
                    />
                    {errors[`agent-${idx}-role`] && <span className="field-error">{errors[`agent-${idx}-role`]}</span>}
                  </div>
                  <div className="create-field">
                    <label className="config-label">Role Type</label>
                    <input
                      className="create-input"
                      list={`role-types-${idx}`}
                      value={agent.role_type}
                      onChange={(e) => updateAgent(idx, "role_type", e.target.value)}
                      placeholder="Enter or select role type"
                    />
                    <datalist id={`role-types-${idx}`}>
                      {ROLE_TYPES.map((rt) => (
                        <option key={rt} value={rt} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="create-field-row">
                  <div className="create-field">
                    <label className="config-label">Model</label>
                    <select
                      className="create-select"
                      value={agent.model}
                      onChange={(e) => updateAgent(idx, "model", e.target.value)}
                    >
                      <option value="">Default</option>
                      <option value="claude-opus-4-6">claude-opus-4-6</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
                    </select>
                  </div>
                </div>

                {advancedMode && (
                  <div className="create-field">
                    <label className="config-label">System Prompt</label>
                    <textarea
                      className="create-textarea"
                      value={agent.system_prompt}
                      onChange={(e) => updateAgent(idx, "system_prompt", e.target.value)}
                      placeholder="Describe this Agent's responsibilities and workflow..."
                      rows={4}
                    />
                  </div>
                )}

                {advancedMode && (
                  <div className="create-field">
                    <label className="config-label">Tools</label>
                    <div className="create-tools">
                      {AVAILABLE_TOOLS.map((tool) => (
                        <label key={tool} className="create-tool-checkbox">
                          <input
                            type="checkbox"
                            checked={agent.tools.includes(tool)}
                            onChange={() => toggleTool(idx, tool)}
                          />
                          <span>{tool}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {advancedMode && agent.tools.includes("Skill") && availableSkills.length > 0 && (
                  <div className="create-field">
                    <label className="config-label">Skills</label>
                    <div className="skill-selector">
                      {availableSkills.map((sk) => (
                        <label key={`${sk.source}-${sk.name}`} className="skill-check-item">
                          <input
                            type="checkbox"
                            checked={agent.skills.includes(sk.name)}
                            onChange={() => toggleSkill(idx, sk.name)}
                          />
                          <span>{sk.name}</span>
                          <span className={`skill-source-tag skill-source-${sk.source}`}>{sk.source}</span>
                          {sk.description && <span className="skill-desc">{sk.description}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {advancedMode && availablePlugins.length > 0 && (
                  <div className="create-field">
                    <label className="config-label">Plugins</label>
                    <div className="plugin-selector">
                      {availablePlugins.map((pl) => (
                        <label key={`${pl.scope}-${pl.name}`} className="plugin-check-item">
                          <input
                            type="checkbox"
                            checked={agent.plugins.includes(pl.name)}
                            onChange={() => togglePlugin(idx, pl.name)}
                          />
                          <span>{pl.name}</span>
                          <span className={`plugin-scope-tag plugin-scope-${pl.scope}`}>{pl.scope}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="create-actions">
          {warnings.length > 0 && (
            <div className="field-warning">
              {warnings.join("、")} — may cause orchestration issues
            </div>
          )}
          <button
            className="create-yaml-btn"
            onClick={() => setShowYaml(!showYaml)}
          >
            {showYaml ? "Hide YAML" : "Preview YAML"}
          </button>
          <button
            className="create-save-btn"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving..." : editId ? "Update Template" : "Save Template"}
          </button>
        </div>

        {showYaml && (
          <pre className="create-yaml-preview">{generateYaml()}</pre>
        )}
      </div>
    </div>
  );
}
