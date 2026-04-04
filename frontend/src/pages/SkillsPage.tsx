import { useEffect, useState } from "react";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

interface Skill {
  name: string;
  description: string;
  file: string;
}

const SKILL_TEMPLATE = `---
name: Skill Name
description: Briefly describe the purpose of this skill
---

Write skill content here...
Agents can invoke this content via the Skill tool during task execution.

You can define:
- Specific workflows and steps
- Coding standards and best practices
- Output format templates
- Domain knowledge references
`;

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // skill name being edited
  const [editContent, setEditContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState(SKILL_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const addToast = useFlowStore((s) => s.addToast);

  const fetchSkills = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/skills`)
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.json();
      })
      .then((data) => { setSkills(data); setLoading(false); })
      .catch((e) => { addToast("error", e.message); setLoading(false); });
  };

  useEffect(() => { fetchSkills(); }, []);

  const startEdit = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/skills/${name}`);
      if (!res.ok) throw new Error("Read failed");
      const data = await res.json();
      setEditing(name);
      setEditContent(data.content);
      setCreating(false);
    } catch (e: any) {
      addToast("error", e.message);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/skills/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) throw new Error("Save failed");
      addToast("success", "Skill updated");
      setEditing(null);
      fetchSkills();
    } catch (e: any) {
      addToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const createSkill = async () => {
    if (!newName.trim()) {
      addToast("error", "Please enter a Skill name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: "",
          content: newContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Create failed");
      }
      addToast("success", `Skill "${newName}" created`);
      setCreating(false);
      setNewName("");
      setNewContent(SKILL_TEMPLATE);
      fetchSkills();
    } catch (e: any) {
      addToast("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (name: string) => {
    if (!confirm(`Are you sure you want to delete Skill "${name}"?`)) return;
    try {
      await fetch(`${API_BASE}/api/skills/${name}`, { method: "DELETE" });
      addToast("success", "Deleted");
      if (editing === name) setEditing(null);
      fetchSkills();
    } catch {
      addToast("error", "Delete failed");
    }
  };

  // Edit/Create view
  if (editing) {
    return (
      <div className="skills-page">
        <div className="skills-page-header">
          <h1>Edit Skill: {editing}</h1>
          <div className="skills-actions">
            <button className="skill-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="skill-save-btn" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="skill-editor-hint">
          Skill files use Markdown format, with --- wrapping the frontmatter (name + description) at the top
        </div>
        <textarea
          className="skill-editor"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  if (creating) {
    return (
      <div className="skills-page">
        <div className="skills-page-header">
          <h1>Create New Skill</h1>
          <div className="skills-actions">
            <button className="skill-cancel-btn" onClick={() => setCreating(false)}>Cancel</button>
            <button
              className="skill-save-btn"
              onClick={createSkill}
              disabled={saving || !newName.trim()}
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
        <div className="skill-create-form">
          <div className="wf-field">
            <label className="wf-label">Skill Name (used as filename)</label>
            <input
              className="wf-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g.: code-review, api-spec, deploy-check"
            />
          </div>
          <div className="skill-editor-hint">
            Skill content uses Markdown format. Agents with the Skill tool enabled can invoke it automatically.
          </div>
          <textarea
            className="skill-editor"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="skills-page">
      <div className="skills-page-header">
        <h1>Skills</h1>
        <button className="wf-create-btn" onClick={() => setCreating(true)}>
          + New Skill
        </button>
      </div>

      <div className="skills-intro">
        Skills are capability modules that can be injected into Agents — Markdown files in the <code>.claude/skills/</code> directory.
        When the Skill tool is enabled in Agent config, it can automatically discover and invoke these skills.
      </div>

      {loading ? (
        <div className="skills-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skill-card skeleton-card" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-text" />
            </div>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="workflow-empty">
          <p>No skills yet</p>
          <p>After creating a Skill, enable the Skill tool in Agent config to use it</p>
          <button className="wf-create-btn" onClick={() => setCreating(true)}>
            Create First Skill
          </button>
        </div>
      ) : (
        <div className="skills-grid">
          {skills.map((s) => (
            <div key={s.name} className="skill-card" onClick={() => startEdit(s.name)}>
              <div className="skill-card-top">
                <h3>{s.name}</h3>
                <button
                  className="wf-delete-btn"
                  onClick={(e) => { e.stopPropagation(); deleteSkill(s.name); }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              {s.description && <p className="skill-card-desc">{s.description}</p>}
              <div className="skill-card-file">{s.file}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
