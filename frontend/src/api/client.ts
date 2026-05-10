import type {
  RunSnapshot,
  RunSummary,
  Workflow,
  WorkflowConfig,
  WorkflowSummary,
  WorkspaceFile,
} from "../types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const ctype = res.headers.get("content-type") || "";
  return ctype.includes("application/json") ? res.json() : (res.text() as unknown as T);
}

export interface WorkflowPayload {
  config: WorkflowConfig;
  worker_md: string;
  critic_md: string;
  checklist_md: string;
}

export const api = {
  listWorkflows: () => req<WorkflowSummary[]>("/api/workflows"),
  getWorkflow: (id: string) => req<Workflow>(`/api/workflows/${id}`),
  createWorkflow: (payload: WorkflowPayload) =>
    req<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(payload) }),
  updateWorkflow: (id: string, payload: WorkflowPayload) =>
    req<Workflow>(`/api/workflows/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteWorkflow: (id: string) =>
    req<void>(`/api/workflows/${id}`, { method: "DELETE" }),
  startRun: (workflowId: string, task: string) =>
    req<RunSnapshot>(`/api/workflows/${workflowId}/run`, {
      method: "POST",
      body: JSON.stringify({ task }),
    }),
  listRunsFor: (workflowId: string) =>
    req<RunSummary[]>(`/api/workflows/${workflowId}/runs`),
  listRuns: () => req<RunSummary[]>(`/api/runs`),
  getRun: (id: string) => req<RunSnapshot>(`/api/runs/${id}`),
  cancelRun: (id: string) =>
    req(`/api/runs/${id}/cancel`, { method: "POST" }),
  listWorkspace: (id: string) => req<WorkspaceFile[]>(`/api/runs/${id}/workspace`),
  readFile: (id: string, path: string) =>
    req<string>(`/api/runs/${id}/files/${path}`),
  getDiff: (id: string, kind: "report" | "review", round: number) =>
    req<string>(`/api/runs/${id}/diff/${kind}/${round}`),
  duplicateWorkflow: (id: string) =>
    req<Workflow>(`/api/workflows/${id}/duplicate`, { method: "POST" }),
};
