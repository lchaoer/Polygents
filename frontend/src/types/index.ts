export interface AgentConfig {
  id: string;
  role: string;
  system_prompt: string;
  tools: string[];
  provider: string;
  model?: string;
  role_type?: "planner" | "executor" | "reviewer";
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  agents: AgentConfig[];
}

// ── WebSocket 消息类型 ─────────────────────────

/** 通用 WS 消息（用于 activities 等不关心具体类型的场景） */
export interface WSMessage {
  type: string;
  data: Record<string, unknown>;
}

/** 运行状态变更 */
export interface RunStatusEvent {
  type: "run_status";
  data: {
    status: "running" | "completed" | "failed";
    detail: string;
  };
}

/** Agent 活动通知 */
export interface AgentActivityEvent {
  type: "agent_activity";
  data: {
    agent_id: string;
    action: "thinking" | "writing" | "reading" | "completed";
    detail: string;
  };
}

/** 文件变更通知 */
export interface FileChangeEvent {
  type: "file_change";
  change: "created" | "modified" | "deleted";
  path: string;
}

/** Goal 总验收结果（独立消息类型） */
export interface GoalValidationEvent {
  type: "goal_validation";
  data: {
    status: "goal_not_met";
    detail: string;
  };
}

/** 心跳 */
export interface PongEvent {
  type: "pong";
}

/** 所有 WS 消息的联合类型 */
export type WSEvent =
  | RunStatusEvent
  | AgentActivityEvent
  | FileChangeEvent
  | GoalValidationEvent
  | PongEvent
  | WSMessage;

// ── 类型守卫 ───────────────────────────────────

export function isRunStatus(msg: WSMessage): msg is RunStatusEvent {
  return msg.type === "run_status";
}

export function isAgentActivity(msg: WSMessage): msg is AgentActivityEvent {
  return msg.type === "agent_activity";
}

export function isGoalValidation(msg: WSMessage): msg is GoalValidationEvent {
  return msg.type === "goal_validation";
}

export function isFileChange(msg: WSMessage): msg is FileChangeEvent {
  return msg.type === "file_change";
}

export interface RunRecord {
  id: string;
  template_id?: string;
  prompt: string;
  goal?: string;
  status: string;
  start_time: string;
  end_time?: string;
  tasks_summary: Record<string, unknown>[];
  detail: string;
}
