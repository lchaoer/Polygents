export interface WorkflowConfig {
  name: string;
  max_rounds: number;
  worker_model: string;
  critic_model: string;
}

export interface Workflow {
  id: string;
  config: WorkflowConfig;
  worker_md: string;
  critic_md: string;
  checklist_md: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
}

export interface RunStatus {
  state: "pending" | "running" | "passed" | "failed" | "cancelled";
  current_round: number;
  workflow_id: string;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface RunSnapshot {
  id: string;
  workflow_id: string;
  status: RunStatus;
  task: string;
  checklist: string;
  reports: string[];
  reviews: string[];
  report_times?: Record<string, number>;
  review_times?: Record<string, number>;
}

export interface RunSummary {
  id: string;
  workflow_id: string;
  state: RunStatus["state"];
  current_round: number;
  created_at: string;
}

export interface WorkspaceFile {
  path: string;
  size: number;
  mtime: number;
}

export type RunEvent =
  | { type: "status_changed"; state: RunStatus["state"] }
  | { type: "round_start"; round: number; role: "worker" | "critic" }
  | { type: "report_written"; round: number }
  | { type: "review_written"; round: number; verdict: "PASS" | "FAIL" }
  | { type: "workspace_changed"; path: string; kind: "added" | "modified" | "deleted" }
  | { type: "agent_started"; round: number; role: "worker" | "critic" }
  | { type: "agent_finished"; round: number; role: "worker" | "critic" }
  | {
      type: "agent_stream";
      round: number;
      role: "worker" | "critic";
      kind: "text" | "thinking" | "tool_use" | "tool_result";
      text?: string;
      id?: string;
      name?: string;
      input?: string;
      is_error?: boolean;
    };
