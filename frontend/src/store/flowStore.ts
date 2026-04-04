import { create } from "zustand";
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import type { AgentConfig, WSMessage, AgentActivityEvent, TaskItem } from "../types";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  selectedNodeId: string | null;
  activities: WSMessage[];
  agentActivities: Record<string, AgentActivityEvent[]>;
  runStatus: string;
  runDetail: string;
  goalReport: string | null;
  theme: "dark" | "light";
  sideView: "activity" | "agent" | "workspace" | "kanban";
  workspaceVersion: number;
  toasts: Toast[];
  wsConnected: boolean;
  runId: string | null;
  totalTasks: number;
  completedTasks: number;
  currentTask: string;
  runStartTime: number | null;
  tasks: TaskItem[];
  isPaused: boolean;
  setSelectedNode: (id: string | null) => void;
  loadTeam: (agents: AgentConfig[]) => void;
  addActivity: (activity: WSMessage) => void;
  updateAgentStatus: (agentId: string, action: string, detail: string) => void;
  addAgentActivity: (event: AgentActivityEvent) => void;
  resetRun: () => void;
  setRunStatus: (status: string, detail: string) => void;
  setGoalReport: (report: string | null) => void;
  toggleTheme: () => void;
  setSideView: (view: "activity" | "agent" | "workspace" | "kanban") => void;
  bumpWorkspaceVersion: () => void;
  addToast: (type: Toast["type"], message: string) => void;
  removeToast: (id: string) => void;
  setWsConnected: (connected: boolean) => void;
  setRunId: (id: string | null) => void;
  setProgress: (total: number, completed: number, current: string) => void;
  incrementCompleted: () => void;
  updateTask: (task: TaskItem) => void;
  setTasks: (tasks: TaskItem[]) => void;
  setIsPaused: (paused: boolean) => void;
  addNode: (id: string, role: string, roleType: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
}

const actionToStatus: Record<string, string> = {
  thinking: "thinking",
  writing: "writing",
  reading: "writing",
  completed: "completed",
};

const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  activities: [],
  agentActivities: {},
  runStatus: "idle",
  runDetail: "",
  goalReport: null,
  theme: (localStorage.getItem("polygents-theme") as "dark" | "light") || "dark",
  sideView: "activity",
  workspaceVersion: 0,
  toasts: [],
  wsConnected: false,
  runId: null,
  totalTasks: 0,
  completedTasks: 0,
  currentTask: "",
  runStartTime: null,
  tasks: [],
  isPaused: false,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  loadTeam: (agents) => {
    const nodes: Node[] = agents.map((agent, i) => ({
      id: agent.id,
      type: "agent",
      position: { x: 250, y: i * 180 },
      data: {
        role: agent.role,
        status: "idle",
        systemPrompt: agent.system_prompt,
        tools: agent.tools,
        model: agent.model,
      },
    }));

    const edges: Edge[] = [];
    for (let i = 0; i < agents.length - 1; i++) {
      edges.push({
        id: `e-${agents[i].id}-${agents[i + 1].id}`,
        source: agents[i].id,
        target: agents[i + 1].id,
        animated: true,
      });
    }
    if (agents.length >= 3) {
      edges.push({
        id: `e-${agents[agents.length - 1].id}-${agents[0].id}`,
        source: agents[agents.length - 1].id,
        target: agents[0].id,
        animated: true,
        style: { strokeDasharray: "5 5" },
        label: "Feedback",
      });
    }

    set({ nodes, edges });
  },

  addActivity: (activity) => {
    set((state) => ({
      activities: [...state.activities.slice(-99), activity],
    }));
  },

  updateAgentStatus: (agentId, action, detail) => {
    const status = actionToStatus[action] || "idle";
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === agentId
          ? { ...n, data: { ...n.data, status, latestActivity: detail } }
          : n
      ),
    }));
  },

  addAgentActivity: (event) => {
    const agentId = event.data.agent_id;
    set((state) => {
      const prev = state.agentActivities[agentId] || [];
      return {
        agentActivities: {
          ...state.agentActivities,
          [agentId]: [...prev.slice(-49), event],
        },
      };
    });
  },

  resetRun: () => {
    set((state) => ({
      activities: [],
      agentActivities: {},
      runStatus: "idle",
      runDetail: "",
      goalReport: null,
      runId: null,
      totalTasks: 0,
      completedTasks: 0,
      currentTask: "",
      runStartTime: Date.now(),
      tasks: [],
      isPaused: false,
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: "idle", latestActivity: undefined },
      })),
    }));
  },

  setRunStatus: (status, detail) => set({ runStatus: status, runDetail: detail }),

  setGoalReport: (report) => set({ goalReport: report }),

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("polygents-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },

  setSideView: (view) => set({ sideView: view }),

  bumpWorkspaceVersion: () => set((s) => ({ workspaceVersion: s.workspaceVersion + 1 })),

  addToast: (type, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setWsConnected: (connected) => set({ wsConnected: connected }),

  setRunId: (id) => set({ runId: id }),

  setProgress: (total, completed, current) => set({ totalTasks: total, completedTasks: completed, currentTask: current }),

  incrementCompleted: () => set((s) => ({ completedTasks: s.completedTasks + 1 })),

  updateTask: (task) => set((s) => {
    const idx = s.tasks.findIndex((t) => t.task_id === task.task_id);
    if (idx >= 0) {
      const updated = [...s.tasks];
      updated[idx] = task;
      return { tasks: updated };
    }
    return { tasks: [...s.tasks, task] };
  }),

  setTasks: (tasks) => set({ tasks }),

  setIsPaused: (paused) => set({ isPaused: paused }),

  addNode: (id, role, roleType, position) => set((s) => ({
    nodes: [...s.nodes, {
      id,
      type: "agent",
      position,
      data: {
        role,
        status: "idle",
        systemPrompt: "",
        tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        model: undefined,
        roleType,
      },
    }],
  })),

  removeNode: (id) => set((s) => ({
    nodes: s.nodes.filter((n) => n.id !== id),
    edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
  })),
}));

export default useFlowStore;
