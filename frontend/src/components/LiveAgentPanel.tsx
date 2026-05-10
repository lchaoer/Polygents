import { useEffect, useRef } from "react";

export interface StreamItem {
  seq: number;
  role: "worker" | "critic";
  round: number;
  kind: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: string;
  is_error?: boolean;
}

interface Props {
  items: StreamItem[];
  activeRole: "worker" | "critic" | null;
  activeRound: number | null;
  state: "idle" | "running" | "done";
  availableRounds: Array<{ role: "worker" | "critic"; round: number }>;
  selected: { role: "worker" | "critic"; round: number } | null;
  onSelect: (sel: { role: "worker" | "critic"; round: number } | null) => void;
}

const TOOL_ICON: Record<string, string> = {
  Read: "📖",
  Write: "📝",
  Edit: "✏️",
  Bash: "▶",
  Glob: "🔎",
  Grep: "🔎",
  TodoWrite: "📋",
};

export default function LiveAgentPanel({
  items,
  activeRole,
  activeRound,
  state,
  availableRounds,
  selected,
  onSelect,
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length]);

  const isLive = !selected && !!activeRole;
  const displayedRole = selected?.role ?? activeRole;
  const displayedRound = selected?.round ?? activeRound;

  return (
    <div className="live-panel">
      <div className="live-panel-head">
        <span className="live-panel-title">
          {displayedRole ? (
            <>
              <span className={`live-dot ${isLive ? state : "idle"}`} />
              {displayedRole === "worker" ? "👷 Worker" : "🔍 Critic"}
              {displayedRound ? <span className="live-round"> · round {displayedRound}</span> : null}
              {!isLive && <span className="live-replay-tag">history</span>}
            </>
          ) : (
            <span className="live-panel-idle">No agent active</span>
          )}
        </span>
        <div className="live-head-actions">
          {isLive && state === "running" && <span className="live-status">streaming…</span>}
          {availableRounds.length > 0 && (
            <select
              className="live-replay-pick"
              value={selected ? `${selected.role}-${selected.round}` : "live"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "live") {
                  onSelect(null);
                } else {
                  const [role, round] = v.split("-");
                  onSelect({
                    role: role as "worker" | "critic",
                    round: Number(round),
                  });
                }
              }}
              title="View prior round stream"
            >
              <option value="live">{activeRole ? "Live" : "—"}</option>
              {availableRounds.map((r) => (
                <option key={`${r.role}-${r.round}`} value={`${r.role}-${r.round}`}>
                  {r.role} · round {r.round}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="live-panel-body">
        {items.length === 0 ? (
          <div className="live-empty">
            {displayedRole
              ? isLive
                ? "Waiting for first message…"
                : "No messages recorded for this round."
              : "Start a run to see agent activity here."}
          </div>
        ) : (
          <ul className="live-list">
            {items.map((it) => (
              <li key={it.seq} className={`live-item live-${it.kind}`}>
                {it.kind === "text" && (
                  <div className="live-text">{it.text}</div>
                )}
                {it.kind === "thinking" && (
                  <div className="live-thinking">
                    <span className="live-thinking-tag">thinking</span>
                    <span>{it.text}</span>
                  </div>
                )}
                {it.kind === "tool_use" && (
                  <div className="live-tool">
                    <span className="live-tool-icon">
                      {TOOL_ICON[it.name ?? ""] ?? "🔧"}
                    </span>
                    <span className="live-tool-name">{it.name}</span>
                    {it.input ? (
                      <span className="live-tool-input">{it.input}</span>
                    ) : null}
                  </div>
                )}
                {it.kind === "tool_result" && it.is_error && (
                  <div className="live-tool-result error">tool error</div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
