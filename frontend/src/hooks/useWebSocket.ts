import { useEffect, useRef, useCallback } from "react";
import useFlowStore from "../store/flowStore";
import type { WSMessage } from "../types";
import { isRunStatus, isGoalValidation, isAgentActivity, isFileChange } from "../types";

const WS_URL = "ws://127.0.0.1:8001/ws";

// 全局递增标识，每次 effect 运行时递增，用于防止 React StrictMode 双重挂载导致多连接
let generationCounter = 0;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const gen = ++generationCounter;

    const connect = () => {
      // 如果 generation 已过期（被新的 effect 取代），不再建连
      if (gen !== generationCounter) return;

      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("WebSocket connected (gen=" + gen + ")");
      };

      ws.onmessage = (event) => {
        const msg: WSMessage = JSON.parse(event.data);
        const s = useFlowStore.getState();

        if (msg.type === "pong") return;

        // 文件变更事件 — 通知 workspace 刷新
        if (isFileChange(msg)) {
          s.bumpWorkspaceVersion();
          return;
        }

        // 运行状态 — 更新顶部状态 + 加入活动流
        if (isRunStatus(msg)) {
          s.setRunStatus(msg.data.status, msg.data.detail);
          s.setGoalReport(null);
          s.addActivity(msg);
          return;
        }

        // Goal 验收 — 只走弹窗，不加入活动流
        if (isGoalValidation(msg)) {
          s.setGoalReport(msg.data.detail);
          return;
        }

        // Agent 活动 — 更新节点状态 + 存入 per-agent 记录 + 加入全局活动流
        if (isAgentActivity(msg)) {
          s.updateAgentStatus(msg.data.agent_id, msg.data.action, msg.data.detail);
          s.addAgentActivity(msg);
          s.addActivity(msg);
          return;
        }

        // 其他消息（system 等）
        s.addActivity(msg);
      };

      ws.onclose = () => {
        // 只有当前 generation 仍然有效时才重连
        if (gen !== generationCounter) return;
        console.log("WebSocket disconnected, reconnecting...");
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      // 递增 generation 使当前连接的异步回调失效
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
