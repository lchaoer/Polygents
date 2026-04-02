import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import Canvas from "../components/Canvas";
import AgentPanel from "../components/AgentPanel";
import ActivityFeed from "../components/ActivityFeed";
import WorkspacePanel from "../components/WorkspacePanel";
import ThemeToggle from "../components/ThemeToggle";
import { useWebSocket } from "../hooks/useWebSocket";
import useFlowStore from "../store/flowStore";

export default function CanvasPage() {
  const [prompt, setPrompt] = useState("");
  const [goal, setGoal] = useState("");
  const [showGoal, setShowGoal] = useState(false);
  const { send } = useWebSocket();
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const sideView = useFlowStore((s) => s.sideView);
  const setSideView = useFlowStore((s) => s.setSideView);
  const runStatus = useFlowStore((s) => s.runStatus);
  const goalReport = useFlowStore((s) => s.goalReport);
  const setGoalReport = useFlowStore((s) => s.setGoalReport);

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) return;

    // 清除上一轮数据
    useFlowStore.getState().resetRun();

    const teamId = new URLSearchParams(window.location.search).get("template") || "dev-team";

    await fetch("http://127.0.0.1:8001/api/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        template_id: teamId,
        goal: goal.trim() || null,
      }),
    });

    setPrompt("");
    setGoal("");
  }, [prompt, goal]);

  const handleGoalDecision = useCallback((decision: "accept" | "retry") => {
    send({ type: "goal_decision", decision });
    setGoalReport(null);
  }, [send, setGoalReport]);

  // 点击节点时自动切到 agent 面板
  const effectiveView = selectedNodeId ? "agent" : sideView;

  const renderSidePanel = () => {
    switch (effectiveView) {
      case "agent":
        return <AgentPanel />;
      case "workspace":
        return <WorkspacePanel />;
      default:
        return <ActivityFeed />;
    }
  };

  return (
    <ReactFlowProvider>
      <div className="app-layout">
        <div className="canvas-container">
          <ThemeToggle />

          <div className="side-view-switcher">
            <button
              className={`side-view-btn ${effectiveView === "activity" ? "active" : ""}`}
              onClick={() => { useFlowStore.getState().setSelectedNode(null); setSideView("activity"); }}
            >
              活动
            </button>
            <button
              className={`side-view-btn ${effectiveView === "workspace" ? "active" : ""}`}
              onClick={() => { useFlowStore.getState().setSelectedNode(null); setSideView("workspace"); }}
            >
              文件
            </button>
          </div>

          <Canvas />

          {/* 总验收结果弹窗 */}
          {goalReport && (
            <div className="goal-validation-overlay">
              <div className="goal-validation-card">
                <h3>总验收未通过</h3>
                <pre className="goal-report">{goalReport}</pre>
                <div className="goal-actions">
                  <button
                    className="goal-btn accept"
                    onClick={() => handleGoalDecision("accept")}
                  >
                    接受结果
                  </button>
                  <button
                    className="goal-btn retry"
                    onClick={() => handleGoalDecision("retry")}
                  >
                    继续优化
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="prompt-bar">
            <div className="prompt-inputs">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入任务描述，如：做一个 TODO App"
                onKeyDown={(e) => e.key === "Enter" && !showGoal && handleRun()}
                disabled={runStatus === "running"}
              />
              {showGoal && (
                <input
                  className="goal-input"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="选填目标，如：能增删改查、有测试覆盖（不填则由 Manager 自动生成）"
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
                title={showGoal ? "隐藏目标" : "设置目标"}
              >
                {showGoal ? "−" : "+"}
              </button>
              <button onClick={handleRun} disabled={runStatus === "running" || !prompt.trim()}>
                {runStatus === "running" ? "运行中..." : "开始运行"}
              </button>
            </div>
          </div>
        </div>
        {renderSidePanel()}
      </div>
    </ReactFlowProvider>
  );
}
