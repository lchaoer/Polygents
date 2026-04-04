import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useFlowStore from "../store/flowStore";
import type { AgentConfig } from "../types";
import { API_BASE } from "../config";

interface Template {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export default function TeamsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const loadTeam = useFlowStore((s) => s.loadTeam);
  const addToast = useFlowStore((s) => s.addToast);

  const fetchTemplates = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/teams/templates`)
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.json();
      })
      .then((data) => { setTemplates(data); setLoading(false); })
      .catch((e) => { addToast("error", e.message); setLoading(false); });
  };

  useEffect(() => { fetchTemplates(); }, []);

  const selectTemplate = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/teams/templates/${id}`);
      if (!res.ok) throw new Error("Load failed");
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
      addToast("success", "Deleted");
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
      addToast("success", "Exported");
    } catch (err: any) {
      addToast("error", err.message);
    }
  };

  return (
    <div className="teams-page">
      <div className="teams-page-header">
        <h1>Team Templates</h1>
        <div className="teams-actions">
          <button className="wf-create-btn" onClick={() => navigate("/create?mode=chat")}>
            💬 Chat Create
          </button>
          <button className="wf-create-btn" onClick={() => navigate("/create")}>
            + Form Create
          </button>
        </div>
      </div>

      <div className="template-grid">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="template-card skeleton-card" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-text" />
            </div>
          ))
        ) : templates.length === 0 ? (
          <div className="workflow-empty">
            <p>No team templates yet</p>
            <button className="wf-create-btn" onClick={() => navigate("/create?mode=chat")}>
              Chat-create First Team
            </button>
          </div>
        ) : (
          templates.map((t, i) => (
            <div
              key={t.id}
              className="template-card"
              onClick={() => selectTemplate(t.id)}
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
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
          ))
        )}
      </div>
    </div>
  );
}
