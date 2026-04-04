import { useState } from "react";
import useFlowStore from "../store/flowStore";

interface InterventionPanelProps {
  onSend: (data: Record<string, unknown>) => void;
}

export default function InterventionPanel({ onSend }: InterventionPanelProps) {
  const isPaused = useFlowStore((s) => s.isPaused);
  const tasks = useFlowStore((s) => s.tasks);
  const currentTask = useFlowStore((s) => s.currentTask);
  const [message, setMessage] = useState("");
  const [targetAgent, setTargetAgent] = useState("dev");
  const [editDesc, setEditDesc] = useState("");
  const nodes = useFlowStore((s) => s.nodes);

  if (!isPaused) return null;

  const nextPending = tasks.find((t) => t.status === "pending" || t.status === "in_progress");
  const agentIds = nodes.map((n) => n.id);

  const handleResume = () => {
    onSend({ type: "resume_run" });
  };

  const handleSkip = () => {
    onSend({ type: "intervene", action: "skip_task", payload: {} });
    onSend({ type: "resume_run" });
  };

  const handleModifyTask = () => {
    if (!editDesc.trim()) return;
    onSend({ type: "intervene", action: "modify_task", payload: { description: editDesc.trim() } });
    onSend({ type: "resume_run" });
    setEditDesc("");
  };

  const handleInjectMessage = () => {
    if (!message.trim()) return;
    onSend({ type: "intervene", action: "inject_message", payload: { agent_id: targetAgent, content: message.trim() } });
    setMessage("");
  };

  return (
    <div className="intervention-overlay">
      <div className="intervention-card">
        <h3>Run Paused</h3>
        {currentTask && (
          <div className="intervention-info">
            <span className="config-label">Current Task</span>
            <p>{currentTask}</p>
          </div>
        )}
        {nextPending && (
          <div className="intervention-info">
            <span className="config-label">Next Task</span>
            <p>{nextPending.description}</p>
          </div>
        )}

        <div className="intervention-section">
          <span className="config-label">Modify Next Task Description</span>
          <textarea
            className="create-textarea"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Enter new task description..."
            rows={2}
          />
          <button className="create-save-btn" onClick={handleModifyTask} disabled={!editDesc.trim()}>
            Modify & Continue
          </button>
        </div>

        <div className="intervention-section">
          <span className="config-label">Send Message to Agent</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="activity-filter"
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value)}
            >
              {agentIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            <input
              className="create-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Intervention message..."
              style={{ flex: 1 }}
            />
            <button className="create-add-btn" onClick={handleInjectMessage} disabled={!message.trim()}>
              Send
            </button>
          </div>
        </div>

        <div className="intervention-actions">
          <button className="goal-btn accept" onClick={handleSkip}>
            Skip Current Task
          </button>
          <button className="goal-btn retry" onClick={handleResume}>
            Resume Run
          </button>
        </div>
      </div>
    </div>
  );
}
