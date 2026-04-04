export interface AgentConfig {
  id: string;
  role: string;
  system_prompt: string;
  tools: string[];
  skills?: string[];
  plugins?: string[];
  provider?: string;
  model?: string;
  role_type?: "planner" | "executor" | "reviewer";
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  agents: AgentConfig[];
}

// ── WebSocket message types ─────────────────────────

/** Generic WS message (for activities and other scenarios where specific type doesn't matter) */
export interface WSMessage {
  type: string;
  data: Record<string, unknown>;
}

/** Run status change */
export interface RunStatusEvent {
  type: "run_status";
  data: {
    status: "running" | "completed" | "failed" | "cancelled" | "paused";
    detail: string;
    run_id?: string;
    timestamp?: string;
  };
}

/** Agent activity notification */
export interface AgentActivityEvent {
  type: "agent_activity";
  data: {
    agent_id: string;
    action: "thinking" | "completed";
    detail: string;
    run_id?: string;
    timestamp?: string;
  };
}

/** File change notification */
export interface FileChangeEvent {
  type: "file_change";
  data: Record<string, unknown>;
  change: "created" | "modified" | "deleted";
  path: string;
}

/** Goal final validation result (separate message type) */
export interface GoalValidationEvent {
  type: "goal_validation";
  data: {
    status: "goal_not_met";
    detail: string;
  };
}

/** Heartbeat */
export interface PongEvent {
  type: "pong";
}

/** Task status change */
export interface TaskUpdateEvent {
  type: "task_update";
  data: {
    task_id: string;
    description: string;
    status: "pending" | "in_progress" | "review" | "completed" | "rejected";
    assignee: string;
    attempt: number;
    run_id?: string;
    timestamp?: string;
  };
}

/** Union type of all WS messages */
export type WSEvent =
  | RunStatusEvent
  | AgentActivityEvent
  | FileChangeEvent
  | GoalValidationEvent
  | TaskUpdateEvent
  | PongEvent
  | WSMessage;

// ── Type guards ───────────────────────────────────

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

export function isTaskUpdate(msg: WSMessage): msg is TaskUpdateEvent {
  return msg.type === "task_update";
}

/** Task item for kanban board */
export interface TaskItem {
  task_id: string;
  description: string;
  status: "pending" | "in_progress" | "review" | "completed" | "rejected";
  assignee: string;
  attempt: number;
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
