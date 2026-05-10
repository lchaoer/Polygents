import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useRunEvents } from "../api/sse";
import { useToast } from "../components/Toast";
import LiveAgentPanel, { type StreamItem } from "../components/LiveAgentPanel";
import WorkflowGraph from "../components/WorkflowGraph";
import WorkspaceFiles from "../components/WorkspaceFiles";
import {
  buildRounds,
  deriveGraphState,
  fmtDuration,
  summarizeMd,
} from "../lib/runDerive";
import type { RunEvent, RunSnapshot, WorkspaceFile } from "../types";

type FileCache = Record<string, string>;
type StepKind = "report" | "review";
type StepKey = `${StepKind}-${number}`; // e.g. "report-1"

const STATE_LABEL: Record<RunSnapshot["status"]["state"], string> = {
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
  return h < 24 ? `${h}h ago` : new Date(iso).toLocaleString();
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [snap, setSnap] = useState<RunSnapshot | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceFile[]>([]);
  const [openSteps, setOpenSteps] = useState<Set<StepKey>>(new Set());
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [stepContent, setStepContent] = useState<Record<StepKey, string>>({});
  const [fileContent, setFileContent] = useState<string>("");
  const [verdicts, setVerdicts] = useState<Record<number, "PASS" | "FAIL">>({});
  const [stream, setStream] = useState<StreamItem[]>([]);
  const [activeAgent, setActiveAgent] = useState<{ role: "worker" | "critic"; round: number } | null>(null);
  const [drawerRole, setDrawerRole] = useState<"worker" | "critic" | null>(null);
  const [replaySelection, setReplaySelection] =
    useState<{ role: "worker" | "critic"; round: number } | null>(null);
  const seqRef = useRef(0);
  const fileCache = useRef<FileCache>({});
  const didJumpRef = useRef(false);

  const refetchSnap = useCallback(() => {
    if (!id) return;
    api
      .getRun(id)
      .then((s) => {
        setSnap(s);
        setSnapError(null);
      })
      .catch((e) => {
        setSnapError(String(e));
        toast.showError(`Failed to load run: ${String(e)}`);
      });
  }, [id, toast]);

  const refetchWorkspace = useCallback(() => {
    if (!id) return;
    api.listWorkspace(id).then(setWorkspace).catch(() => {});
  }, [id]);

  useEffect(() => {
    refetchSnap();
    refetchWorkspace();
  }, [refetchSnap, refetchWorkspace]);

  const onEvent = useCallback(
    (ev: RunEvent) => {
      if (ev.type === "status_changed") {
        refetchSnap();
        if (ev.state !== "running" && ev.state !== "pending") {
          setActiveAgent(null);
        }
      } else if (ev.type === "report_written") {
        refetchSnap();
        delete fileCache.current[`reports/round-${ev.round}.md`];
      } else if (ev.type === "review_written") {
        refetchSnap();
        setVerdicts((v) => ({ ...v, [ev.round]: ev.verdict }));
        delete fileCache.current[`reviews/round-${ev.round}.md`];
      } else if (ev.type === "workspace_changed") {
        refetchWorkspace();
        delete fileCache.current[`workspace/${ev.path}`];
      } else if (ev.type === "agent_started") {
        setActiveAgent({ role: ev.role, round: ev.round });
        setStream((s) => s.filter((it) => !(it.role === ev.role && it.round === ev.round)));
      } else if (ev.type === "agent_finished") {
        setActiveAgent((cur) =>
          cur && cur.role === ev.role && cur.round === ev.round ? null : cur
        );
      } else if (ev.type === "agent_stream") {
        setStream((s) => {
          seqRef.current += 1;
          const item: StreamItem = {
            seq: seqRef.current,
            role: ev.role,
            round: ev.round,
            kind: ev.kind,
            text: ev.text,
            name: ev.name,
            input: ev.input,
            is_error: ev.is_error,
          };
          // Cap to most recent 500 to avoid runaway memory
          const next = [...s, item];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    },
    [refetchSnap, refetchWorkspace]
  );

  useRunEvents(id, onEvent);

  const rounds = useMemo(
    () => (snap ? buildRounds(snap.reports, snap.reviews) : []),
    [snap]
  );

  const graphState = useMemo(
    () => deriveGraphState({ snap, rounds, verdicts, activeAgent }),
    [snap, rounds, verdicts, activeAgent]
  );

  const liveStream = useMemo(() => {
    const target = replaySelection ?? activeAgent;
    if (!target) return [] as StreamItem[];
    return stream.filter(
      (it) => it.role === target.role && it.round === target.round
    );
  }, [stream, activeAgent, replaySelection]);

  const availableRounds = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ role: "worker" | "critic"; round: number }> = [];
    for (const it of stream) {
      const k = `${it.role}-${it.round}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // exclude the currently-active one — it's the "Live" option
      if (
        activeAgent &&
        activeAgent.role === it.role &&
        activeAgent.round === it.round
      )
        continue;
      out.push({ role: it.role, round: it.round });
    }
    return out.sort((a, b) =>
      a.round !== b.round ? a.round - b.round : a.role.localeCompare(b.role)
    );
  }, [stream, activeAgent]);

  const runStartedAt = useMemo(
    () => (snap ? new Date(snap.status.created_at).getTime() / 1000 : 0),
    [snap]
  );

  // Auto-open the latest round's worker step on first load
  useEffect(() => {
    if (didJumpRef.current || rounds.length === 0) return;
    const last = rounds[rounds.length - 1];
    const k: StepKey = last.critic ? `review-${last.round}` : `report-${last.round}`;
    setOpenSteps(new Set([k]));
    didJumpRef.current = true;
  }, [rounds]);

  // Lazy-load step content when opened
  useEffect(() => {
    if (!id) return;
    openSteps.forEach((k) => {
      if (stepContent[k] !== undefined) return;
      const [kind, roundStr] = k.split("-");
      const round = Number(roundStr);
      const apiPath = `${kind}s/round-${round}.md`;
      api
        .readFile(id, apiPath)
        .then((text) => setStepContent((m) => ({ ...m, [k]: text })))
        .catch((e) => setStepContent((m) => ({ ...m, [k]: `Error: ${String(e)}` })));
    });
  }, [openSteps, id, stepContent]);

  // Lazy-load workspace file on open
  useEffect(() => {
    if (!id || !openFile) {
      setFileContent("");
      return;
    }
    const cacheKey = `workspace/${openFile}`;
    if (fileCache.current[cacheKey] !== undefined) {
      setFileContent(fileCache.current[cacheKey]);
      return;
    }
    api
      .readFile(id, `workspace/${openFile}`)
      .then((text) => {
        fileCache.current[cacheKey] = text;
        setFileContent(text);
      })
      .catch((e) => setFileContent(`Error: ${String(e)}`));
  }, [openFile, id]);

  const toggleStep = (k: StepKey) =>
    setOpenSteps((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const onCancel = async () => {
    if (!id) return;
    if (!confirm("Cancel this run?")) return;
    try {
      await api.cancelRun(id);
      toast.showInfo("Run cancelled");
      refetchSnap();
    } catch (e) {
      toast.showError(`Cancel failed: ${String(e)}`);
    }
  };

  if (!snap) {
    return (
      <div className="page">
        {snapError ? (
          <div className="empty">
            <p>Could not load this run.</p>
            <p className="card-sub">{snapError}</p>
            <button className="btn" onClick={() => navigate("/")}>
              ← Back to workflows
            </button>
          </div>
        ) : (
          <p>Loading…</p>
        )}
      </div>
    );
  }

  const state = snap.status.state;
  const isRunning = state === "running" || state === "pending";
  const stateClass = state;

  const summarize = summarizeMd;

  return (
    <div className="page">
      <div className="run-page-head">
        <div>
          <h1>
            Run <em>{snap.id.slice(-6)}</em>
          </h1>
          <div className="run-meta">
            <span className="run-meta-item">
              <span className={`status-dot ${stateClass}`} />
              <span className={`run-row-state ${stateClass}`}>{STATE_LABEL[state]}</span>
            </span>
            <span className="run-meta-item">
              <span className="run-meta-label">Round</span>
              {snap.status.current_round}
            </span>
            <span className="run-meta-item">
              <span className="run-meta-label">Started</span>
              {relTime(snap.status.created_at)}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn ghost"
            onClick={() => navigate(`/workflows/${snap.workflow_id}`)}
          >
            ← Workflow
          </button>
          {isRunning && (
            <button className="btn danger" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <section className="run-task-card">
        <span className="run-task-card-label">Task</span>
        <CollapsibleText text={snap.task} />
      </section>

      {snap.status.error && (
        <section className="run-error-card">
          <div className="run-error-card-label">Error</div>
          <pre>{snap.status.error}</pre>
        </section>
      )}

      <section className="wfgraph-section">
        <WorkflowGraph
          state={graphState}
          onNodeClick={(id) => {
            if (id === "worker" || id === "critic") setDrawerRole(id);
          }}
        />
      </section>

      <div className="run-grid">
        <div className="timeline">
          {rounds.length === 0 && (
            <div className="empty">
              <p>{isRunning ? "Worker is starting…" : "No rounds yet."}</p>
            </div>
          )}

          {rounds.map((r, idx) => {
            const verdict = verdicts[r.round];
            const isCurrentRunning =
              isRunning && r.round === snap.status.current_round && !verdict;
            const roundClass =
              verdict === "PASS"
                ? "passed"
                : verdict === "FAIL"
                ? "failed"
                : isCurrentRunning
                ? "running"
                : "";

            const prev = idx > 0 ? rounds[idx - 1] : null;
            const prevReviewMtime = prev?.critic
              ? snap.review_times?.[prev.critic]
              : undefined;
            const roundStart = prevReviewMtime ?? runStartedAt;

            const workerMtime = r.worker ? snap.report_times?.[r.worker] : undefined;
            const criticMtime = r.critic ? snap.review_times?.[r.critic] : undefined;
            const roundEnd = criticMtime ?? workerMtime;
            const roundDuration =
              roundEnd && roundStart ? roundEnd - roundStart : null;
            const workerDuration =
              workerMtime && roundStart ? workerMtime - roundStart : null;
            const criticDuration =
              criticMtime && workerMtime ? criticMtime - workerMtime : null;

            return (
              <div key={r.round} className={`tl-round ${roundClass}`}>
                <div className="tl-round-head">
                  <span>Round {r.round}</span>
                  {roundDuration !== null && (
                    <span className="tl-round-time">{fmtDuration(roundDuration)}</span>
                  )}
                  {isCurrentRunning && <span className="tl-round-time">running…</span>}
                </div>

                {r.worker && (
                  <Step
                    k={`report-${r.round}`}
                    role="worker"
                    duration={workerDuration ?? null}
                    summary={summarize(stepContent[`report-${r.round}`])}
                    open={openSteps.has(`report-${r.round}`)}
                    onToggle={() => toggleStep(`report-${r.round}`)}
                    body={stepContent[`report-${r.round}`]}
                    round={r.round}
                    diffAvailable={r.round > 1}
                    onLoadDiff={() => api.getDiff(snap.id, "report", r.round)}
                  />
                )}

                {r.critic && (
                  <Step
                    k={`review-${r.round}`}
                    role="critic"
                    duration={criticDuration ?? null}
                    summary={summarize(stepContent[`review-${r.round}`])}
                    verdict={verdict}
                    open={openSteps.has(`review-${r.round}`)}
                    onToggle={() => toggleStep(`review-${r.round}`)}
                    body={stepContent[`review-${r.round}`]}
                    round={r.round}
                    diffAvailable={r.round > 1}
                    onLoadDiff={() => api.getDiff(snap.id, "review", r.round)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="run-side">
          <LiveAgentPanel
            items={liveStream}
            activeRole={activeAgent?.role ?? null}
            activeRound={activeAgent?.round ?? null}
            state={activeAgent ? "running" : isRunning ? "idle" : "done"}
            availableRounds={availableRounds}
            selected={replaySelection}
            onSelect={setReplaySelection}
          />
          <WorkspaceFiles
            files={workspace}
            reportTimes={snap.report_times ?? {}}
            reviewTimes={snap.review_times ?? {}}
            runStartedAt={runStartedAt}
            openFile={openFile}
            onOpen={setOpenFile}
          />
        </div>
      </div>

      {drawerRole && (
        <AgentDrawer
          role={drawerRole}
          rounds={rounds}
          verdicts={verdicts}
          snap={snap}
          onClose={() => setDrawerRole(null)}
          onJumpToStep={(round) => {
            const k: StepKey = drawerRole === "worker" ? `report-${round}` : `review-${round}`;
            setOpenSteps((cur) => new Set(cur).add(k));
            setDrawerRole(null);
          }}
        />
      )}

      {openFile && (
        <div className="file-viewer">
          <div className="file-viewer-head">
            <strong>{openFile}</strong>
            <button className="btn ghost" onClick={() => setOpenFile(null)}>
              Close
            </button>
          </div>
          <pre className="file-viewer-body">{fileContent || "Loading…"}</pre>
        </div>
      )}
    </div>
  );
}

interface StepProps {
  k: StepKey;
  role: "worker" | "critic";
  summary: string;
  verdict?: "PASS" | "FAIL";
  duration: number | null;
  open: boolean;
  onToggle: () => void;
  body?: string;
  round: number;
  diffAvailable: boolean;
  onLoadDiff: () => Promise<string>;
}

function Step({
  role,
  summary,
  verdict,
  duration,
  open,
  onToggle,
  body,
  diffAvailable,
  onLoadDiff,
}: StepProps) {
  const [view, setView] = useState<"body" | "diff">("body");
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const switchToDiff = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) onToggle();
    setView("diff");
    if (diff === null && !loadingDiff) {
      setLoadingDiff(true);
      try {
        setDiff(await onLoadDiff());
      } catch (err) {
        setDiff(`Error: ${String(err)}`);
      } finally {
        setLoadingDiff(false);
      }
    }
  };

  return (
    <div className={`tl-step role-${role} ${open ? "open" : ""}`}>
      <button className="tl-step-head" onClick={onToggle}>
        <span className="tl-step-icon">{role === "worker" ? "W" : "C"}</span>
        <span className="tl-step-role">{role}</span>
        <span className="tl-step-summary">{summary}</span>
        {duration !== null && (
          <span className="tl-step-duration">{fmtDuration(duration)}</span>
        )}
        {verdict && (
          <span className={`tl-step-verdict ${verdict.toLowerCase()}`}>{verdict}</span>
        )}
      </button>
      {open && (
        <>
          <div className="tl-step-tabs">
            <button
              className={`tl-step-tab ${view === "body" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setView("body");
              }}
            >
              Content
            </button>
            {diffAvailable && (
              <button
                className={`tl-step-tab ${view === "diff" ? "active" : ""}`}
                onClick={switchToDiff}
                title="Diff against previous round"
              >
                Diff vs prev
              </button>
            )}
          </div>
          {view === "body" ? (
            body ? (
              <pre className="tl-step-body">{body}</pre>
            ) : (
              <div className="tl-step-body empty">Loading…</div>
            )
          ) : diff === null ? (
            <div className="tl-step-body empty">Loading diff…</div>
          ) : diff === "" ? (
            <div className="tl-step-body empty">No previous round to diff against.</div>
          ) : (
            <pre className="tl-step-body tl-step-diff">{renderDiff(diff)}</pre>
          )}
        </>
      )}
    </div>
  );
}

function renderDiff(diff: string): JSX.Element[] {
  return diff.split(/\r?\n/).map((line, i) => {
    let cls = "diff-ctx";
    if (line.startsWith("+++") || line.startsWith("---")) cls = "diff-meta";
    else if (line.startsWith("@@")) cls = "diff-hunk";
    else if (line.startsWith("+")) cls = "diff-add";
    else if (line.startsWith("-")) cls = "diff-del";
    return (
      <span key={i} className={cls}>
        {line}
        {"\n"}
      </span>
    );
  });
}

function CollapsibleText({ text, threshold = 280 }: { text: string; threshold?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;
  if (!long) return <pre className="run-task-text">{text}</pre>;
  return (
    <>
      <pre className={`run-task-text ${open ? "" : "clamped"}`}>{text}</pre>
      <button className="task-expand" onClick={() => setOpen((o) => !o)}>
        {open ? "Show less" : `Show all (${text.length} chars)`}
      </button>
    </>
  );
}

interface AgentDrawerProps {
  role: "worker" | "critic";
  rounds: Array<{ round: number; worker?: string; critic?: string }>;
  verdicts: Record<number, "PASS" | "FAIL">;
  snap: RunSnapshot;
  onClose: () => void;
  onJumpToStep: (round: number) => void;
}

function AgentDrawer({ role, rounds, verdicts, snap, onClose, onJumpToStep }: AgentDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runStartedAt = new Date(snap.status.created_at).getTime() / 1000;
  const filtered = rounds.filter((r) => (role === "worker" ? r.worker : r.critic));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="drawer-title">
            {role === "worker" ? "👷 Worker" : "🔍 Critic"} · all rounds
          </span>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">
          {filtered.length === 0 ? (
            <p className="drawer-empty">No rounds completed yet.</p>
          ) : (
            <ul className="drawer-rounds">
              {filtered.map((r, idx) => {
                const verdict = verdicts[r.round];
                const fileName = role === "worker" ? r.worker! : r.critic!;
                const mtime =
                  role === "worker"
                    ? snap.report_times?.[fileName]
                    : snap.review_times?.[fileName];
                const prev = idx > 0 ? filtered[idx - 1] : null;
                const prevMtime = prev
                  ? role === "worker"
                    ? snap.report_times?.[prev.worker!]
                    : snap.review_times?.[prev.critic!]
                  : runStartedAt;
                const dur = mtime && prevMtime ? mtime - prevMtime : null;
                return (
                  <li key={r.round}>
                    <button
                      className="drawer-round"
                      onClick={() => onJumpToStep(r.round)}
                    >
                      <span className="drawer-round-n">Round {r.round}</span>
                      {dur !== null && (
                        <span className="drawer-round-dur">{fmtDuration(dur)}</span>
                      )}
                      {role === "critic" && verdict && (
                        <span className={`tl-step-verdict ${verdict.toLowerCase()}`}>
                          {verdict}
                        </span>
                      )}
                      <span className="drawer-round-arrow">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
