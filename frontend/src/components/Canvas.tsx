import { useCallback, type DragEvent } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, type Node, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import AgentNode from "./nodes/AgentNode";
import useFlowStore from "../store/flowStore";
import { useShallow } from "zustand/react/shallow";

const nodeTypes = { agent: AgentNode };

const ROLE_TYPE_LABELS: Record<string, string> = {
  planner: "Planner",
  executor: "Executor",
  reviewer: "Reviewer",
  custom: "Custom",
};

export default function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, theme } = useFlowStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      theme: s.theme,
    }))
  );

  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const addNode = useFlowStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelectedNode(node.id),
    [setSelectedNode]
  );

  const onPaneClick = useCallback(
    () => setSelectedNode(null),
    [setSelectedNode]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const roleType = e.dataTransfer.getData("application/polygents-role");
    if (!roleType) return;

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `${roleType}-${Date.now().toString(36)}`;
    const role = ROLE_TYPE_LABELS[roleType] || roleType;
    addNode(id, role, roleType, position);
    setSelectedNode(id);
  }, [screenToFlowPosition, addNode, setSelectedNode]);

  const isDark = theme === "dark";

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      fitView
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isDark ? "#334155" : "#cbd5e1"} />
      <Controls />
      <MiniMap
        nodeColor={() => isDark ? "#6366f1" : "#818cf8"}
        style={{ background: isDark ? "#1e293b" : "#e2e8f0" }}
      />
    </ReactFlow>
  );
}
