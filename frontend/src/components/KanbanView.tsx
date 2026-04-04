import useFlowStore from "../store/flowStore";
import type { TaskItem } from "../types";

const COLUMNS: { key: TaskItem["status"]; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: "#64748b" },
  { key: "in_progress", label: "In Progress", color: "#f59e0b" },
  { key: "review", label: "Review", color: "#3b82f6" },
  { key: "completed", label: "Completed", color: "#22c55e" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
];

export default function KanbanView() {
  const tasks = useFlowStore((s) => s.tasks);

  if (tasks.length === 0) {
    return (
      <div className="side-panel">
        <div className="panel-header">
          <div className="panel-header-info">
            <h3>Task Board</h3>
          </div>
        </div>
        <div className="panel-content">
          <p className="feed-empty">Tasks will appear here after the run starts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel">
      <div className="panel-header">
        <div className="panel-header-info">
          <h3>Task Board</h3>
          <span className="panel-status-label" style={{ color: "var(--text-secondary)" }}>
            {tasks.length} Tasks
          </span>
        </div>
      </div>
      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-dot" style={{ backgroundColor: col.color }} />
                <span className="kanban-column-label">{col.label}</span>
                <span className="kanban-column-count">{items.length}</span>
              </div>
              <div className="kanban-column-cards">
                {items.map((task) => (
                  <div key={task.task_id} className="kanban-card">
                    <div className="kanban-card-desc">{task.description}</div>
                    <div className="kanban-card-meta">
                      <span className="agent-badge">{task.assignee}</span>
                      {task.attempt > 1 && (
                        <span className="kanban-card-attempt">Attempt {task.attempt}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
