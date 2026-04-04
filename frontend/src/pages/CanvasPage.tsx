import { useState, useCallback, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import Canvas from "../components/Canvas";
import AgentPanel from "../components/AgentPanel";
import ActivityFeed from "../components/ActivityFeed";
import WorkspacePanel from "../components/WorkspacePanel";
import KanbanView from "../components/KanbanView";
import InterventionPanel from "../components/InterventionPanel";
import AgentPalette from "../components/AgentPalette";
import { useWebSocket } from "../hooks/useWebSocket";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";
import type { AgentConfig } from "../types";

export default function CanvasPage() {
  const [prompt, setPrompt] = useState("");
  const [goal, setGoal] = useState("");
  const [showGoal, setShowGoal] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const { send } = useWebSocket();
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const sideView = useFlowStore((s) => s.sideView);
  const setSideView = useFlowStore((s) => s.setSideView);
  const runStatus = useFlowStore((s) => s.runStatus);
  const goalReport = useFlowStore((s) => s.goalReport);
  const setGoalReport = useFlowStore((s) => s.setGoalReport);
  const addToast = useFlowStore((s) => s.addToast);
  const runId = useFlowStore((s) => s.runId);
  const totalTasks = useFlowStore((s) => s.totalTasks);
  const completedTasks = useFlowStore((s) => s.completedTasks);
  const currentTask = useFlowStore((s) => s.currentTask);
  const runStartTime = useFlowStore((s) => s.runStartTime);
  const isPaused = useFlowStore((s) => s.isPaused);
  const loadTeam = useFlowStore((s) => s.loadTeam);

  // Auto-load Agent nodes from URL params on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Skip if canvas already has nodes
    if (useFlowStore.getState().nodes.length > 0) return;

    const templateId = params.get("template");
    const workflowId = params.get("workflow");

    if (templateId) {
      // Multi-Agent team: load from template
      fetch(`${API_BASE}/api/teams/templates/${templateId}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load template");
          return r.json();
        })
        .then((data) => {
          if (data.agents && data.agents.length > 0) {
            loadTeam(data.agents as AgentConfig[]);
          }
        })
        .catch((err) => {
          addToast("error", err.message || "Template load failed");
        });
    } else if (workflowId) {
      // Single Agent workflow: create node from workflow config
      fetch(`${API_BASE}/api/workflows/${workflowId}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load workflow");
          return r.json();
        })
        .then((data) => {
          if (data.agent_config) {
            const cfg = data.agent_config;
            const agent: AgentConfig = {
              id: cfg.id || `single-${workflowId}`,
              role: cfg.role || data.name,
              system_prompt: cfg.system_prompt || "",
              tools: cfg.tools || [],
              model: cfg.model || undefined,
            };
            loadTeam([agent]);
          }
          // Auto-fill default prompt and goal
          if (data.default_prompt && !prompt) {
            setPrompt(data.default_prompt);
          }
          if (data.default_goal) {
            setGoal(data.default_goal);
            setShowGoal(true);
          }
        })
        .catch((err) => {
          addToast("error", err.message || "Workflow load failed");
        });
    }
  }, [loadTeam, addToast]);

  // Restore prompt/goal from URL params (rerun scenario)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPrompt = params.get("prompt");
    const urlGoal = params.get("goal");
    if (urlPrompt) {
      setPrompt(urlPrompt);
      if (urlGoal) {
        setGoal(urlGoal);
        setShowGoal(true);
      }
    }
  }, []);

  // If URL has run_id on load, query backend for run status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRunId = params.get("run_id");
    if (!urlRunId) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/runs/history/${urlRunId}`);
        if (!res.ok) return;
        const data = await res.json();
        const s = useFlowStore.getState();
        if (data.status === "running" && s.runStatus !== "running") {
          s.setRunStatus("running", data.detail || "Running...");
          s.setRunId(urlRunId);
        } else if (data.status === "completed" && s.runStatus !== "completed") {
          s.setRunStatus("completed", data.detail || "Run completed");
          s.setRunId(urlRunId);
        } else if (data.status === "failed" && s.runStatus !== "failed") {
          s.setRunStatus("failed", data.detail || "Run failed");
          s.setRunId(urlRunId);
        }
      } catch { /* ignore */ }
    };
    // Slight delay to let WS connect first
    const timer = setTimeout(poll, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Run timer
  useEffect(() => {
    if (runStatus !== "running" || !runStartTime) {
      return;
    }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - runStartTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [runStatus, runStartTime]);

  // Freeze timer when run ends
  useEffect(() => {
    if (runStatus !== "running" && runStartTime) {
      setElapsed(Math.floor((Date.now() - runStartTime) / 1000));
    }
  }, [runStatus, runStartTime]);

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) return;

    // Clear previous run data
    useFlowStore.getState().resetRun();

    const params = new URLSearchParams(window.location.search);
    const workflowId = params.get("workflow");
    const templateId = params.get("template");

    try {
      let res: Response;

      if (workflowId) {
        // Single Agent workflow: update prompt then call workflow run API
        await fetch(`${API_BASE}/api/workflows/${workflowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            default_prompt: prompt,
            default_goal: goal.trim() || "",
          }),
        });
        res = await fetch(`${API_BASE}/api/workflows/${workflowId}/run`, {
          method: "POST",
        });
      } else {
        // Multi-Agent team: use runs/start
        const teamId = templateId || "dev-team";
        res = await fetch(`${API_BASE}/api/runs/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            template_id: teamId,
            goal: goal.trim() || null,
          }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "Start failed");
      }
      setPrompt("");
      setGoal("");
    } catch (e: any) {
      addToast("error", "Run start failed: " + e.message);
    }
  }, [prompt, goal, addToast]);

  const handleGoalDecision = useCallback((decision: "accept" | "retry") => {
    send({ type: "goal_decision", decision });
    setGoalReport(null);
  }, [send, setGoalReport]);

  const handleCancel = useCallback(async () => {
    if (!runId) return;
    try {
      await fetch(`${API_BASE}/api/runs/${runId}/cancel`, { method: "POST" });
      addToast("info", "Run cancelled");
    } catch {
      addToast("error", "Cancel failed");
    }
  }, [runId, addToast]);

  const handlePause = useCallback(() => {
    if (isPaused) {
      send({ type: "resume_run" });
    } else {
      send({ type: "pause_run" });
    }
  }, [isPaused, send]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Auto-switch to agent panel when node clicked
  const effectiveView = selectedNodeId ? "agent" : sideView;

  const renderSidePanel = () => {
    switch (effectiveView) {
      case "agent":
        return <AgentPanel />;
      case "workspace":
        return <WorkspacePanel />;
      case "kanban":
        return <KanbanView />;
      default:
        return <ActivityFeed />;
    }
  };

  return (
    <ReactFlowProvider>
      <div className="app-layout">
        <div className="canvas-container">

          <div className="side-view-switcher">
            <button
              className={`side-view-btn ${effectiveView === "activity" ? "active" : ""}`}
              onClick={() => { useFlowStore.getState().setSelectedNode(null); setSideView("activity"); }}
            >
              Activity
            </button>
            <button
              className={`side-view-btn ${effectiveView === "workspace" ? "active" : ""}`}
              onClick={() => { useFlowStore.getState().setSelectedNode(null); setSideView("workspace"); }}
            >
              Files
            </button>
            <button
              className={`side-view-btn ${effectiveView === "kanban" ? "active" : ""}`}
              onClick={() => { useFlowStore.getState().setSelectedNode(null); setSideView("kanban"); }}
            >
              Board
            </button>
          </div>

          <AgentPalette />

          <Canvas />

          {/* Final validation result popup */}
          {goalReport && (
            <div className="goal-validation-overlay">
              <div className="goal-validation-card">
                <h3>Final Validation Failed</h3>
                <pre className="goal-report">{goalReport}</pre>
                <div className="goal-actions">
                  <button
                    className="goal-btn accept"
                    onClick={() => handleGoalDecision("accept")}
                  >
                    Accept Results
                  </button>
                  <button
                    className="goal-btn retry"
                    onClick={() => handleGoalDecision("retry")}
                  >
                    Continue Optimizing
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Run progress bar */}
          {runStatus === "running" && totalTasks > 0 && (
            <div className="run-progress-bar">
              <div className="run-progress-info">
                <span>{completedTasks}/{totalTasks} tasks</span>
                <span className="run-timer">{formatElapsed(elapsed)}</span>
              </div>
              <div className="run-progress-track">
                <div
                  className="run-progress-fill"
                  style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                />
              </div>
              {currentTask && <div className="run-current-task">{currentTask}</div>}
            </div>
          )}
          {runStatus === "running" && totalTasks === 0 && runStartTime && (
            <div className="run-progress-bar">
              <div className="run-progress-info">
                <span>Preparing...</span>
                <span className="run-timer">{formatElapsed(elapsed)}</span>
              </div>
            </div>
          )}

          <div className="prompt-bar">
            <div className="prompt-inputs">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter task description, e.g.: Build a TODO App"
                onKeyDown={(e) => e.key === "Enter" && !showGoal && handleRun()}
                disabled={runStatus === "running"}
              />
              {showGoal && (
                <input
                  className="goal-input"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Optional goal, e.g.: CRUD support, test coverage (auto-generated by Manager if empty)"
                  onKeyDown={(e) => e.key === "Enter" && handleRun()}
                  disabled={runStatus === "running"}
                />
              )}
            </div>
            <div className="prompt-actions">
              <button
                className="toggle-goal-btn"
                onClick={() => setShowGoal(!showGoal)}
                disabled={runStatus === "running"}
                title={showGoal ? "Hide Goal" : "Set Goal"}
              >
                {showGoal ? "−" : "+"}
              </button>
              <button onClick={handleRun} disabled={runStatus === "running" || !prompt.trim()}>
                Start Run
              </button>
              {runStatus === "running" && (
                <>
                  <button className="cancel-run-btn" onClick={handlePause} style={{ marginRight: 4 }}>
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                  <button className="cancel-run-btn" onClick={handleCancel}>
                    Stop
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Intervention panel (shown when paused) */}
          <InterventionPanel onSend={send} />
        </div>
        {renderSidePanel()}
      </div>
    </ReactFlowProvider>
  );
}
