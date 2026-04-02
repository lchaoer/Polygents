import { useCallback } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import AgentNode from "./nodes/AgentNode";
import useFlowStore from "../store/flowStore";
import { useShallow } from "zustand/react/shallow";

const nodeTypes = { agent: AgentNode };

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

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelectedNode(node.id),
    [setSelectedNode]
  );

  const onPaneClick = useCallback(
    () => setSelectedNode(null),
    [setSelectedNode]
  );

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
