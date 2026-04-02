import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import HistoryPanel from "../components/HistoryPanel";
import ThemeToggle from "../components/ThemeToggle";
import type { AgentConfig } from "../types";

interface Template {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export default function HomePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const navigate = useNavigate();
  const loadTeam = useFlowStore((s) => s.loadTeam);

  const fetchTemplates = () => {
    fetch("http://127.0.0.1:8001/api/teams/templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(console.error);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const selectTemplate = async (id: string) => {
    const res = await fetch(`http://127.0.0.1:8001/api/teams/templates/${id}`);
    const data = await res.json();
    loadTeam(data.agents as AgentConfig[]);
    navigate(`/canvas?template=${id}`);
  };

  const deleteTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(`确定删除模板 "${id}" 吗？`)) return;
    await fetch(`http://127.0.0.1:8001/api/teams/templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  };

  const editTemplate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigate(`/create?edit=${id}`);
  };

  return (
    <div className="home-page">
      <ThemeToggle />
      <h1>Polygents</h1>
      <p className="subtitle">多智能体协作框架 -- 给 AI 一个组织架构</p>

      <div className="template-grid">
        {templates.map((t) => (
          <div key={t.id} className="template-card" onClick={() => selectTemplate(t.id)}>
            <div className="template-card-actions">
              <button className="template-action-btn" onClick={(e) => editTemplate(e, t.id)} title="编辑">
                ✎
              </button>
              <button className="template-action-btn delete" onClick={(e) => deleteTemplate(e, t.id)} title="删除">
                ✕
              </button>
            </div>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <div style={{ marginTop: 12, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {t.agents.map((a) => (
                <span key={a} className="tool-tag">{a}</span>
              ))}
            </div>
          </div>
        ))}

        <div className="template-card create-card" onClick={() => navigate("/create")}>
          <div className="create-card-icon">+</div>
          <h3>创建自定义团队</h3>
          <p>定义你自己的 Agent 团队配置</p>
        </div>
      </div>

      <button className="history-btn" onClick={() => setShowHistory(true)}>
        运行历史
      </button>

      <HistoryPanel open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  );
}
