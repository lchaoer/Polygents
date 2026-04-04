import { useState, useEffect, useCallback } from "react";
import useFlowStore from "../store/flowStore";
import { API_BASE } from "../config";

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
  const addToast = useFlowStore((s) => s.addToast);

  const fetchTree = useCallback(() => {
    fetch(`${API_BASE}/api/workspace/tree`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setTree(Array.isArray(data) ? data : []))
      .catch(() => { setTree([]); addToast("error", "Failed to load workspace files"); });
  }, [addToast]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree, workspaceVersion]);

  const selectFile = useCallback(async (path: string) => {
    setFilePath(path);
    try {
      const res = await fetch(`${API_BASE}/api/workspace/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setFileContent(data.content || "");
    } catch {
      setFileContent("(Load failed)");
      addToast("error", "Failed to read file");
    }
  }, []);

  return (
    <div className="workspace-panel">
      <div className="workspace-header">
        <h3>Workspace Files</h3>
        <button className="workspace-refresh-btn" onClick={fetchTree} title="Refresh">↻</button>
      </div>

      <div className="workspace-tree">
        {tree.length === 0 ? (
          <p className="thinking-empty">No files yet</p>
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
