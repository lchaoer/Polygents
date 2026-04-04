import { type DragEvent, useCallback, useState } from "react";

const PALETTE_ITEMS = [
  { role_type: "planner", label: "Planner", color: "#60a5fa" },
  { role_type: "executor", label: "Executor", color: "#34d399" },
  { role_type: "reviewer", label: "Reviewer", color: "#fbbf24" },
];

export default function AgentPalette() {
  const [customName, setCustomName] = useState("");

  const onDragStart = useCallback((e: DragEvent<HTMLDivElement>, roleType: string) => {
    e.dataTransfer.setData("application/polygents-role", roleType);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  return (
    <div className="agent-palette">
      <div className="agent-palette-title">Drag to Add Agent</div>
      <div className="agent-palette-items">
        {PALETTE_ITEMS.map((item) => (
          <div
            key={item.role_type}
            className="agent-palette-item"
            draggable
            onDragStart={(e) => onDragStart(e, item.role_type)}
          >
            <span className="agent-palette-dot" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
        <div className="agent-palette-custom">
          <input
            className="agent-palette-custom-input"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Custom role name..."
          />
          <div
            className={`agent-palette-item${customName.trim() ? "" : " disabled"}`}
            draggable={!!customName.trim()}
            onDragStart={(e) => {
              if (!customName.trim()) { e.preventDefault(); return; }
              onDragStart(e, customName.trim());
            }}
          >
            <span className="agent-palette-dot" style={{ backgroundColor: "#a855f7" }} />
            <span>{customName.trim() || "Custom"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
