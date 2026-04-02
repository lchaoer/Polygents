import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";

const AVAILABLE_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];
const ROLE_TYPES = ["planner", "executor", "reviewer"];

interface AgentForm {
  id: string;
  role: string;
  role_type: string;
  model: string;
  system_prompt: string;
  tools: string[];
}

const emptyAgent = (): AgentForm => ({
  id: `agent-${Date.now()}`,
  role: "",
  role_type: "",
  model: "",
  system_prompt: "",
  tools: [],
});

export default function CreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agents, setAgents] = useState<AgentForm[]>([emptyAgent()]);
  const [showYaml, setShowYaml] = useState(false);
  const [saving, setSaving] = useState(false);

  // 编辑模式：加载现有模板
  useEffect(() => {
    if (!editId) return;
    fetch(`http://127.0.0.1:8001/api/teams/templates/${editId}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setDescription(data.description || "");
        setAgents(
          (data.agents || []).map((a: any) => ({
            id: a.id || "",
            role: a.role || "",
            role_type: a.role_type || "",
            model: a.model || "",
            system_prompt: a.system_prompt || "",
            tools: a.tools || [],
          }))
        );
      })
      .catch(console.error);
  }, [editId]);

  const updateAgent = (idx: number, field: keyof AgentForm, value: any) => {
    setAgents((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a))
    );
  };

  const toggleTool = (idx: number, tool: string) => {
    setAgents((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        const has = a.tools.includes(tool);
        return { ...a, tools: has ? a.tools.filter((t) => t !== tool) : [...a.tools, tool] };
      })
    );
  };

  const addAgent = () => setAgents((prev) => [...prev, emptyAgent()]);

  const removeAgent = (idx: number) => {
    if (agents.length <= 1) return;
    setAgents((prev) => prev.filter((_, i) => i !== idx));
  };

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
    // 简单的 YAML 序列化
    let yaml = `name: "${data.name}"\ndescription: "${data.description}"\nagents:\n`;
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

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const body = {
      name: name.trim(),
      description: description.trim(),
      agents: agents.map((a) => ({
        id: a.id,
        role: a.role,
        role_type: a.role_type || null,
        model: a.model || null,
        system_prompt: a.system_prompt,
        tools: a.tools,
      })),
    };

    const url = editId
      ? `http://127.0.0.1:8001/api/teams/templates/${editId}`
      : "http://127.0.0.1:8001/api/teams/templates";
    const method = editId ? "PUT" : "POST";

    try {
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      navigate("/");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-page">
      <ThemeToggle />
      <div className="create-header">
        <button className="history-back-btn" onClick={() => navigate("/")}>
          &larr; 返回首页
        </button>
        <h1>{editId ? "编辑模板" : "创建自定义团队"}</h1>
      </div>

      <div className="create-form">
        <div className="create-field">
          <label className="config-label">团队名称</label>
          <input
            className="create-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：前端开发团队"
          />
        </div>

        <div className="create-field">
          <label className="config-label">描述</label>
          <input
            className="create-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="团队用途描述"
          />
        </div>

        <div className="create-agents-section">
          <div className="create-agents-header">
            <label className="config-label">Agent 列表</label>
            <button className="create-add-btn" onClick={addAgent}>+ 添加 Agent</button>
          </div>

          {agents.map((agent, idx) => (
            <div key={idx} className="create-agent-card">
              <div className="create-agent-card-header">
                <span className="create-agent-idx">Agent #{idx + 1}</span>
                {agents.length > 1 && (
                  <button className="create-remove-btn" onClick={() => removeAgent(idx)}>
                    删除
                  </button>
                )}
              </div>

              <div className="create-agent-fields">
                <div className="create-field-row">
                  <div className="create-field">
                    <label className="config-label">ID</label>
                    <input
                      className="create-input"
                      value={agent.id}
                      onChange={(e) => updateAgent(idx, "id", e.target.value)}
                      placeholder="agent-id"
                    />
                  </div>
                  <div className="create-field">
                    <label className="config-label">角色名</label>
                    <input
                      className="create-input"
                      value={agent.role}
                      onChange={(e) => updateAgent(idx, "role", e.target.value)}
                      placeholder="如：项目经理"
                    />
                  </div>
                </div>

                <div className="create-field-row">
                  <div className="create-field">
                    <label className="config-label">角色类型</label>
                    <select
                      className="create-select"
                      value={agent.role_type}
                      onChange={(e) => updateAgent(idx, "role_type", e.target.value)}
                    >
                      <option value="">不指定</option>
                      {ROLE_TYPES.map((rt) => (
                        <option key={rt} value={rt}>{rt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="create-field">
                    <label className="config-label">模型</label>
                    <select
                      className="create-select"
                      value={agent.model}
                      onChange={(e) => updateAgent(idx, "model", e.target.value)}
                    >
                      <option value="">默认</option>
                      <option value="claude-opus-4-6">claude-opus-4-6</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
                    </select>
                  </div>
                </div>

                <div className="create-field">
                  <label className="config-label">系统提示词</label>
                  <textarea
                    className="create-textarea"
                    value={agent.system_prompt}
                    onChange={(e) => updateAgent(idx, "system_prompt", e.target.value)}
                    placeholder="描述这个 Agent 的职责和工作方式..."
                    rows={4}
                  />
                </div>

                <div className="create-field">
                  <label className="config-label">工具</label>
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
              </div>
            </div>
          ))}
        </div>

        <div className="create-actions">
          <button
            className="create-yaml-btn"
            onClick={() => setShowYaml(!showYaml)}
          >
            {showYaml ? "隐藏 YAML" : "预览 YAML"}
          </button>
          <button
            className="create-save-btn"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "保存中..." : editId ? "更新模板" : "保存模板"}
          </button>
        </div>

        {showYaml && (
          <pre className="create-yaml-preview">{generateYaml()}</pre>
        )}
      </div>
    </div>
  );
}
