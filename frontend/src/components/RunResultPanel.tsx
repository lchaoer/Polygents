import { useEffect, useState } from "react";
import { API_BASE } from "../config";
import useFlowStore from "../store/flowStore";

interface OutputFile {
  path: string;
  size: number;
  action: "created" | "modified";
}

interface TaskSummary {
  id: string;
  description: string;
  status: string;
  assignee: string;
  attempts: number;
  error_detail: string;
}

interface RunResultPanelProps {
  runId: string;
  status: string;
  detail: string;
  elapsed: number;
  onClose: () => void;
}

function getFailureSuggestions(detail: string, tasks: TaskSummary[]): string[] {
  const suggestions: string[] = [];
  const combined = (detail + " " + tasks.map((t) => t.error_detail).join(" ")).toLowerCase();
  if (combined.includes("timed out") || combined.includes("timeout")) {
    suggestions.push("Consider simplifying the task or increasing the timeout");
  }
  if (combined.includes("planner") && (combined.includes("no ") || combined.includes("not found"))) {
    suggestions.push("Your team is missing a planner. Add an agent with role_type: planner");
  }
  if (combined.includes("empty output") || combined.includes("no output")) {
    suggestions.push("The system prompt may be too vague. Try adding specific output instructions");
  }
  if (combined.includes("max retries") || tasks.some((t) => t.status === "rejected")) {
    suggestions.push("Some tasks failed after multiple attempts. Consider breaking them into smaller sub-tasks");
  }
  return suggestions;
}

export default function RunResultPanel({ runId, status, detail, elapsed, onClose }: RunResultPanelProps) {
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [tasksSummary, setTasksSummary] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const addToast = useFlowStore((s) => s.addToast);

  useEffect(() => {
    if (!runId) return;
    fetch(`${API_BASE}/api/runs/history/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        setOutputFiles(data.output_files || []);
        setTasksSummary(data.tasks_summary || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [runId]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePreview = async (path: string) => {
    if (previewPath === path) {
      setPreviewPath(null);
      return;
    }
    setPreviewPath(path);
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setPreviewContent(data.content || "");
    } catch {
      setPreviewContent("[Failed to load file]");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopyAll = async () => {
    try {
      const contents: string[] = [];
      for (const file of outputFiles) {
        const res = await fetch(`${API_BASE}/api/workspace/file?path=${encodeURIComponent(file.path)}`);
        if (res.ok) {
          const data = await res.json();
          contents.push(`--- ${file.path} ---\n${data.content || ""}`);
        }
      }
      await navigator.clipboard.writeText(contents.join("\n\n"));
      addToast("success", "All file contents copied");
    } catch {
      addToast("error", "Failed to copy");
    }
  };

  const handleRetryTask = async (task: TaskSummary) => {
    setRetryingTaskId(task.id);
    try {
      const res = await fetch(`${API_BASE}/api/runs/${runId}/retry-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          description: task.description,
          assignee: task.assignee,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Retry failed");
      }
      addToast("info", `Retrying task: ${task.description.slice(0, 40)}...`);
    } catch (e: any) {
      addToast("error", e.message || "Retry failed");
    } finally {
      setRetryingTaskId(null);
    }
  };

  const rejectedTasks = tasksSummary.filter((t) => t.status === "rejected");
  const createdCount = outputFiles.filter((f) => f.action === "created").length;
  const modifiedCount = outputFiles.filter((f) => f.action === "modified").length;
  const isCompleted = status === "completed";
  const suggestions = !isCompleted ? getFailureSuggestions(detail, tasksSummary) : [];

  return (
    <div className="run-result-panel">
      <div className="run-result-header">
        <span className={`run-result-icon ${isCompleted ? "success" : "error"}`}>
          {isCompleted ? "\u2705" : "\u274c"}
        </span>
        <span className="run-result-title">
          {isCompleted ? "Run completed" : "Run failed"}
        </span>
        <button className="run-result-close" onClick={onClose} title="Close">&times;</button>
      </div>

      {!isCompleted && detail && (
        <div className="run-result-error">{detail}</div>
      )}

      {/* Failure suggestions */}
      {suggestions.length > 0 && (
        <div className="run-result-suggestions">
          {suggestions.map((s, i) => (
            <div key={i} className="run-result-suggestion-item">
              <span className="run-result-suggestion-icon">{"\ud83d\udca1"}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Failed tasks list */}
      {rejectedTasks.length > 0 && (
        <div className="run-result-failed-tasks">
          <div className="run-result-section-title">Failed Tasks</div>
          {rejectedTasks.map((task) => (
            <div key={task.id} className="run-result-task-item">
              <div
                className="run-result-task-header"
                onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
              >
                <span className="run-result-task-desc">{task.description}</span>
                <span className="agent-badge">{task.assignee}</span>
                <span className="run-result-task-attempt">
                  Attempt {task.attempts}/{task.attempts}
                </span>
                <span className="run-result-task-expand">
                  {expandedTaskId === task.id ? "\u25b2" : "\u25bc"}
                </span>
              </div>
              {expandedTaskId === task.id && (
                <div className="run-result-task-detail">
                  {task.error_detail ? (
                    <pre className="run-result-task-error-text">{task.error_detail}</pre>
                  ) : (
                    <p className="run-result-task-error-text">No evaluator feedback available</p>
                  )}
                  <button
                    className="run-result-retry-btn"
                    onClick={() => handleRetryTask(task)}
                    disabled={retryingTaskId === task.id}
                  >
                    {retryingTaskId === task.id ? "Retrying..." : "Retry This Task"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="run-result-stats">
        <span>{"\u23f1\ufe0f"} {formatDuration(elapsed)}</span>
        {outputFiles.length > 0 && (
          <span>
            {"\ud83d\udcc4"} {createdCount > 0 && `${createdCount} created`}
            {createdCount > 0 && modifiedCount > 0 && ", "}
            {modifiedCount > 0 && `${modifiedCount} modified`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="run-result-loading">Loading files...</div>
      ) : outputFiles.length === 0 ? (
        <div className="run-result-empty">No output files detected</div>
      ) : (
        <div className="run-result-files">
          {outputFiles.map((file) => (
            <div key={file.path} className="run-result-file-item">
              <div className="run-result-file-row">
                <span className="run-result-file-icon">
                  {file.action === "created" ? "\ud83c\udd95" : "\ud83d\udcdd"}
                </span>
                <span className="run-result-file-path">{file.path}</span>
                <span className="run-result-file-size">{formatSize(file.size)}</span>
                <button
                  className="run-result-preview-btn"
                  onClick={() => handlePreview(file.path)}
                >
                  {previewPath === file.path ? "Hide" : "Preview"}
                </button>
              </div>
              {previewPath === file.path && (
                <div className="run-result-preview">
                  {previewLoading ? (
                    <div className="run-result-preview-loading">Loading...</div>
                  ) : (
                    <pre className="run-result-preview-content">{previewContent}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="run-result-actions">
        {outputFiles.length > 0 && (
          <button className="run-result-copy-btn" onClick={handleCopyAll}>
            Copy All
          </button>
        )}
        <button className="run-result-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
