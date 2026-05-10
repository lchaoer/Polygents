import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import type { RunSummary, WorkflowSummary } from "../types";

const STATE_LABEL: Record<RunSummary["state"], string> = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function EmptyIllustration() {
  return (
    <svg
      width="120"
      height="80"
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--ink-mute)", marginBottom: 12 }}
      aria-hidden
    >
      <circle cx="22" cy="40" r="6" />
      <path d="M28 40 H 56" strokeDasharray="2 4" />
      <rect x="58" y="30" width="20" height="20" rx="4" />
      <path d="M80 40 H 92" strokeDasharray="2 4" />
      <circle cx="98" cy="40" r="6" />
    </svg>
  );
}

export default function RunsListPage() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    Promise.all([api.listRuns(), api.listWorkflows()])
      .then(([rs, wfs]) => {
        const sorted = [...rs].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        );
        setRuns(sorted);
        setWorkflows(wfs);
      })
      .catch((e) => {
        setRuns([]);
        toast.showError(`Failed to load runs: ${String(e)}`);
      });
  }, [toast]);

  const wfNameById = useMemo(() => {
    const m = new Map<string, string>();
    workflows.forEach((w) => m.set(w.id, w.name));
    return m;
  }, [workflows]);

  // Only show filter chips for workflows that actually have runs
  const wfWithRuns = useMemo(() => {
    if (!runs) return [] as { id: string; name: string; count: number }[];
    const counts = new Map<string, number>();
    runs.forEach((r) => counts.set(r.workflow_id, (counts.get(r.workflow_id) ?? 0) + 1));
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        name: wfNameById.get(id) ?? id,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [runs, wfNameById]);

  const filteredRuns = useMemo(() => {
    if (!runs) return null;
    if (filter === "all") return runs;
    return runs.filter((r) => r.workflow_id === filter);
  }, [runs, filter]);

  const toggleSelect = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]
    );

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected([]);
  };

  const onCompare = () => {
    if (selected.length !== 2) {
      toast.showError("Select exactly 2 runs to compare");
      return;
    }
    navigate(`/runs/compare?a=${selected[0]}&b=${selected[1]}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Runs</h1>
          <p className="page-sub">Every execution of every workflow, newest first.</p>
        </div>
        <div className="header-actions">
          {selectMode ? (
            <>
              <span className="page-sub" style={{ marginRight: 8 }}>
                {selected.length}/2 selected
              </span>
              <button
                className="btn primary"
                disabled={selected.length !== 2}
                onClick={onCompare}
              >
                Compare →
              </button>
              <button className="btn ghost" onClick={exitSelectMode}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn ghost"
              onClick={() => setSelectMode(true)}
              disabled={!runs || runs.length < 2}
            >
              Compare runs…
            </button>
          )}
        </div>
      </div>

      {runs && runs.length > 0 && wfWithRuns.length > 1 && (
        <div className="chip-row">
          <button
            className={`chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All <span className="chip-count">{runs.length}</span>
          </button>
          {wfWithRuns.map((w) => (
            <button
              key={w.id}
              className={`chip ${filter === w.id ? "active" : ""}`}
              onClick={() => setFilter(w.id)}
              title={w.id}
            >
              {w.name} <span className="chip-count">{w.count}</span>
            </button>
          ))}
        </div>
      )}

      {runs === null ? (
        <p>Loading…</p>
      ) : runs.length === 0 ? (
        <div className="empty">
          <EmptyIllustration />
          <p>No runs yet.</p>
          <p className="card-sub">
            Open a workflow and hit <b>▶ Run</b> to start one.
          </p>
        </div>
      ) : filteredRuns!.length === 0 ? (
        <div className="empty">
          <p>No runs match this filter.</p>
        </div>
      ) : (
        <ul className="run-list">
          {filteredRuns!.map((r) => {
            const isSel = selected.includes(r.id);
            const inner = (
              <>
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={isSel}
                    readOnly
                    className="run-row-check"
                  />
                )}
                <span className={`status-dot ${r.state}`} />
                <span className="run-row-name">
                  {wfNameById.get(r.workflow_id) ?? r.workflow_id}
                  <span className="run-row-meta">
                    {r.id.slice(-6)} · round {r.current_round}
                  </span>
                </span>
                <span className="run-row-time">{relTime(r.created_at)}</span>
                <span className={`run-row-state ${r.state}`}>{STATE_LABEL[r.state]}</span>
              </>
            );
            return (
              <li key={r.id}>
                {selectMode ? (
                  <button
                    type="button"
                    className={`run-row ${isSel ? "selected" : ""}`}
                    onClick={() => toggleSelect(r.id)}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link to={`/runs/${r.id}`} className="run-row">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
