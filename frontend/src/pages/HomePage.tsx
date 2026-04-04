import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import HistoryPanel from "../components/HistoryPanel";
import ThemeToggle from "../components/ThemeToggle";
import type { AgentConfig } from "../types";
import { API_BASE } from "../config";

interface Template {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export default function HomePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const loadTeam = useFlowStore((s) => s.loadTeam);
  const addToast = useFlowStore((s) => s.addToast);

  const fetchTemplates = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/teams/templates`)
      .then((r) => {
        if (!r.ok) throw new Error("Server response error");
        return r.json();
      })
      .then((data) => { setTemplates(data); setLoading(false); })
      .catch((e) => { addToast("error", "Failed to load templates: " + e.message); setLoading(false); });
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const selectTemplate = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/teams/templates/${id}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      loadTeam(data.agents as AgentConfig[]);
      navigate(`/canvas?template=${id}`);
    } catch (e: any) {
      addToast("error", e.message);
    }
  };

  const deleteTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(`Delete template "${id}"?`)) return;
    try {
      await fetch(`${API_BASE}/api/teams/templates/${id}`, { method: "DELETE" });
      addToast("success", "Template deleted");
      fetchTemplates();
    } catch {
      addToast("error", "Delete failed");
    }
  };

  const editTemplate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigate(`/create?edit=${id}`);
  };

  const exportTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/teams/templates/${id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("success", "Template exported");
    } catch (err: any) {
      addToast("error", err.message);
    }
  };

  return (
    <div className="home-page">
      <ThemeToggle />
      <h1>Polygents</h1>
      <p className="subtitle">Multi-Agent Collaboration Framework</p>

      <div className="template-grid">
        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="template-card skeleton-card" style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-text" />
                <div className="skeleton-line skeleton-text short" />
              </div>
            ))}
          </>
        ) : (
          <>
            {templates.map((t, i) => (
          <div
            key={t.id}
            className="template-card"
            onClick={() => selectTemplate(t.id)}
            style={{ animationDelay: `${0.25 + i * 0.08}s` }}
          >
            <div className="template-card-actions">
              <button className="template-action-btn" onClick={(e) => exportTemplate(e, t.id)} title="Export">
                ↓
              </button>
              <button className="template-action-btn" onClick={(e) => editTemplate(e, t.id)} title="Edit">
                ✎
              </button>
              <button className="template-action-btn delete" onClick={(e) => deleteTemplate(e, t.id)} title="Delete">
                ✕
              </button>
            </div>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {t.agents.map((a) => (
                <span key={a} className="tool-tag">{a}</span>
              ))}
            </div>
          </div>
        ))}

        <div className="template-card create-card" onClick={() => navigate("/create?mode=chat")}>
          <div className="create-card-icon">💬</div>
          <h3>Chat-based Team Creation</h3>
          <p>Chat with Meta-Agent to auto-generate team config</p>
        </div>

        <div className="template-card create-card" onClick={() => navigate("/create")}>
          <div className="create-card-icon">+</div>
          <h3>Form-based Team Creation</h3>
          <p>Manually configure each Agent's role and tools</p>
        </div>
          </>
        )}
      </div>

      <button className="history-btn" onClick={() => setShowHistory(true)}>
        Run History
      </button>
      <button className="history-btn" onClick={() => navigate("/logs")} style={{ marginLeft: 10 }}>
        Comm Logs
      </button>

      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onRerun={(prompt, goal, templateId) => {
          const params = new URLSearchParams();
          if (templateId) params.set("template", templateId);
          params.set("prompt", prompt);
          if (goal) params.set("goal", goal);
          navigate(`/canvas?${params.toString()}`);
        }}
      />
    </div>
  );
}
