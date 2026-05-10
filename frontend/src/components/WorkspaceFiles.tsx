import { fmtSize, roundBoundaries, tagFor } from "../lib/runDerive";
import type { WorkspaceFile } from "../types";

interface Props {
  files: WorkspaceFile[];
  reportTimes: Record<string, number>;
  reviewTimes: Record<string, number>;
  runStartedAt: number;
  openFile: string | null;
  onOpen: (path: string | null) => void;
}

export default function WorkspaceFiles({
  files,
  reportTimes,
  reviewTimes,
  runStartedAt,
  openFile,
  onOpen,
}: Props) {
  const bounds = roundBoundaries(reportTimes, reviewTimes, runStartedAt);

  return (
    <div className="ws-panel">
      <div className="ws-panel-head">
        <span className="ws-panel-title">📂 Workspace</span>
        <span className="ws-panel-count">
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </div>
      {files.length === 0 ? (
        <div className="ws-empty">No files written yet.</div>
      ) : (
        <ul className="ws-list">
          {files.map((f) => {
            const tag = tagFor(f.mtime, bounds);
            return (
              <li key={f.path}>
                <button
                  className={`ws-file ${openFile === f.path ? "active" : ""}`}
                  onClick={() => onOpen(openFile === f.path ? null : f.path)}
                >
                  <span className="ws-file-name">{f.path}</span>
                  {tag && <span className="ws-file-tag">{tag}</span>}
                  <span className="ws-file-size">{fmtSize(f.size)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
