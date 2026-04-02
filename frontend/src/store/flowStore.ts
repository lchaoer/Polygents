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
import type { AgentConfig, WSMessage, AgentActivityEvent } from "../types";

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
  sideView: "activity" | "agent" | "workspace";
  workspaceVersion: number;
  setSelectedNode: (id: string | null) => void;
  loadTeam: (agents: AgentConfig[]) => void;
  addActivity: (activity: WSMessage) => void;
  updateAgentStatus: (agentId: string, action: string, detail: string) => void;
  addAgentActivity: (event: AgentActivityEvent) => void;
  resetRun: () => void;
  setRunStatus: (status: string, detail: string) => void;
  setGoalReport: (report: string | null) => void;
  toggleTheme: () => void;
  setSideView: (view: "activity" | "agent" | "workspace") => void;
  bumpWorkspaceVersion: () => void;
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
        label: "反馈",
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
}));

export default useFlowStore;
