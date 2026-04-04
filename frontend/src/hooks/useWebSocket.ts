import { useEffect, useRef, useCallback } from "react";
import useFlowStore from "../store/flowStore";
import type { WSMessage } from "../types";
import { isRunStatus, isGoalValidation, isAgentActivity, isFileChange, isTaskUpdate } from "../types";
import { WS_URL } from "../config";

// Global generation counter, incremented each effect run to prevent duplicate connections from React StrictMode double-mount
let generationCounter = 0;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const gen = ++generationCounter;

    const connect = () => {
      // If generation is outdated (replaced by new effect), don't connect
      if (gen !== generationCounter) return;

      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        useFlowStore.getState().setWsConnected(true);
      };

      ws.onmessage = (event) => {
        let msg: WSMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        const s = useFlowStore.getState();

        if (msg.type === "pong") return;

        // File change event — notify workspace refresh
        if (isFileChange(msg)) {
          s.bumpWorkspaceVersion();
          return;
        }

        // Run status — update top bar status + add to activity feed + extract progress
        if (isRunStatus(msg)) {
          s.setRunStatus(msg.data.status, msg.data.detail);
          s.setGoalReport(null);
          if (msg.data.run_id) s.setRunId(msg.data.run_id);

          // Pause/resume state
          if (msg.data.status === "paused") {
            s.setIsPaused(true);
          } else if (s.isPaused) {
            s.setIsPaused(false);
          }

          // Extract progress info
          const detail = msg.data.detail;
          const taskCountMatch = detail.match(/Parsed\s*(\d+)\s*tasks/);
          if (taskCountMatch) {
            s.setProgress(parseInt(taskCountMatch[1]), 0, "");
          }
          if (detail.startsWith("Executing task:")) {
            const state = useFlowStore.getState();
            s.setProgress(state.totalTasks, state.completedTasks, detail.replace("Executing task:", "").trim());
          }
          if (detail.startsWith("Task approved:") || detail.startsWith("Task exceeded max retries:")) {
            s.incrementCompleted();
          }

          s.addActivity(msg);
          return;
        }

        // Goal validation — show popup only, don't add to activity feed
        if (isGoalValidation(msg)) {
          s.setGoalReport(msg.data.detail);
          return;
        }

        // Agent activity — update node status + store per-agent record + add to global activity feed
        if (isAgentActivity(msg)) {
          s.updateAgentStatus(msg.data.agent_id, msg.data.action, msg.data.detail);
          s.addAgentActivity(msg);
          s.addActivity(msg);
          return;
        }

        // Task status change — update kanban
        if (isTaskUpdate(msg)) {
          s.updateTask({
            task_id: msg.data.task_id,
            description: msg.data.description,
            status: msg.data.status,
            assignee: msg.data.assignee,
            attempt: msg.data.attempt,
          });
          return;
        }

        // Other messages (system, etc.)
        s.addActivity(msg);
      };

      ws.onclose = () => {
        // Only reconnect if current generation is still valid
        if (gen !== generationCounter) return;
        useFlowStore.getState().setWsConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      // Increment generation to invalidate async callbacks of current connection
      generationCounter++;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
