import { useMemo } from "react";
import ReactFlow, {
  Background,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphState, NodeState } from "../lib/runDerive";

export type { GraphState, NodeState };

interface AgentNodeData {
  label: string;
  sub: string;
  state: NodeState;
  icon: string;
}

function AgentNode({ data }: NodeProps<AgentNodeData>) {
  return (
    <div className={`gnode gnode-${data.state}`}>
      <Handle type="target" position={Position.Left} className="ghandle" />
      <div className="gnode-icon">{data.icon}</div>
      <div className="gnode-text">
        <div className="gnode-label">{data.label}</div>
        <div className="gnode-sub">{data.sub}</div>
      </div>
      {data.state === "running" && <span className="gnode-pulse" />}
      <Handle type="source" position={Position.Right} className="ghandle" />
    </div>
  );
}

function EndpointNode({ data }: NodeProps<AgentNodeData>) {
  return (
    <div className={`gnode gnode-endpoint gnode-${data.state}`}>
      <Handle type="target" position={Position.Left} className="ghandle" />
      <div className="gnode-icon">{data.icon}</div>
      <div className="gnode-text">
        <div className="gnode-label">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="ghandle" />
    </div>
  );
}

const nodeTypes = { agent: AgentNode, endpoint: EndpointNode };

interface Props {
  state: GraphState;
  onNodeClick?: (id: "task" | "worker" | "critic" | "done") => void;
}

export default function WorkflowGraph({ state, onNodeClick }: Props) {
  const nodes = useMemo<Node<AgentNodeData>[]>(
    () => [
      {
        id: "task",
        type: "endpoint",
        position: { x: 0, y: 60 },
        data: { label: "Task", sub: "", state: state.task, icon: "📥" },
        sourcePosition: Position.Right,
      },
      {
        id: "worker",
        type: "agent",
        position: { x: 200, y: 40 },
        data: {
          label: "Worker",
          sub: state.workerRound > 0 ? `round ${state.workerRound}` : "idle",
          state: state.worker,
          icon: "👷",
        },
      },
      {
        id: "critic",
        type: "agent",
        position: { x: 440, y: 40 },
        data: {
          label: "Critic",
          sub: state.criticRound > 0 ? `round ${state.criticRound}` : "idle",
          state: state.critic,
          icon: "🔍",
        },
      },
      {
        id: "done",
        type: "endpoint",
        position: { x: 680, y: 60 },
        data: { label: "Done", sub: "", state: state.done, icon: "✅" },
        targetPosition: Position.Left,
      },
    ],
    [state]
  );

  const edges = useMemo<Edge[]>(() => {
    const passActive = state.lastVerdict === "PASS";
    const failActive = state.lastVerdict === "FAIL";
    return [
      {
        id: "task-worker",
        source: "task",
        target: "worker",
        animated: state.worker === "running",
        className: state.worker !== "idle" ? "gedge-active" : "",
      },
      {
        id: "worker-critic",
        source: "worker",
        target: "critic",
        animated: state.critic === "running",
        label: "report",
        className: state.critic !== "idle" || state.worker === "done" ? "gedge-active" : "",
      },
      {
        id: "critic-worker",
        source: "critic",
        target: "worker",
        type: "smoothstep",
        animated: failActive && state.worker === "running",
        label: "FAIL",
        className: failActive ? "gedge-fail" : "gedge-dim",
        style: { strokeDasharray: "4 4" },
      },
      {
        id: "critic-done",
        source: "critic",
        target: "done",
        animated: passActive,
        label: "PASS",
        className: passActive ? "gedge-pass" : "gedge-dim",
      },
    ];
  }, [state]);

  return (
    <div className="wfgraph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!!onNodeClick}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnDrag={false}
        zoomOnDoubleClick={false}
        onNodeClick={(_, node) => onNodeClick?.(node.id as "task" | "worker" | "critic" | "done")}
      >
        <Background gap={16} size={1} color="#e3eaee" />
      </ReactFlow>
    </div>
  );
}
