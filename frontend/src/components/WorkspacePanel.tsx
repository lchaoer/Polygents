import { useState, useEffect, useCallback } from "react";
import useFlowStore from "../store/flowStore";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: TreeNode[];
}

function TreeItem({ node, onSelect }: { node: TreeNode; onSelect: (path: string) => void }) {
  const [open, setOpen] = useState(false);

  if (node.type === "directory") {
    return (
      <div className="tree-dir">
        <div className="tree-dir-name" onClick={() => setOpen(!open)}>
          <span className="tree-arrow">{open ? "▾" : "▸"}</span>
          <span>{node.name}</span>
        </div>
        {open && node.children && (
          <div className="tree-children">
            {node.children.map((c) => (
              <TreeItem key={c.path} node={c} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tree-file" onClick={() => onSelect(node.path)}>
      {node.name}
    </div>
  );
}

export default function WorkspacePanel() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const workspaceVersion = useFlowStore((s) => s.workspaceVersion);

  const fetchTree = useCallback(() => {
    fetch("http://127.0.0.1:8001/api/workspace/tree")
      .then((r) => r.json())
      .then((data) => setTree(Array.isArray(data) ? data : []))
      .catch(() => setTree([]));
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree, workspaceVersion]);

  const selectFile = useCallback(async (path: string) => {
    setFilePath(path);
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/workspace/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setFileContent(data.content || "");
    } catch {
      setFileContent("(加载失败)");
    }
  }, []);

  return (
    <div className="workspace-panel">
      <div className="workspace-header">
        <h3>工作区文件</h3>
        <button className="workspace-refresh-btn" onClick={fetchTree} title="刷新">↻</button>
      </div>

      <div className="workspace-tree">
        {tree.length === 0 ? (
          <p className="thinking-empty">暂无文件</p>
        ) : (
          tree.map((n) => <TreeItem key={n.path} node={n} onSelect={selectFile} />)
        )}
      </div>

      {filePath && (
        <div className="workspace-preview">
          <div className="workspace-preview-header">
            <span className="workspace-preview-path">{filePath}</span>
            <button className="panel-close-btn" onClick={() => setFilePath(null)}>&times;</button>
          </div>
          <pre className="workspace-preview-content">{fileContent}</pre>
        </div>
      )}
    </div>
  );
}
