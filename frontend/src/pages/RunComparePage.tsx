import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import { computeUnifiedDiff } from "../lib/diff";
import { buildRounds, fmtDuration, summarizeMd, type RoundEntry } from "../lib/runDerive";
import type { RunSnapshot, WorkflowSummary } from "../types";

type Verdicts = Record<number, "PASS" | "FAIL">;
type StepBodies = Record<string, string>; // key: `${kind}-${round}` => md text

interface Side {
  snap: RunSnapshot;
  wfName: string;
  rounds: RoundEntry[];
  verdicts: Verdicts;
  bodies: StepBodies;
}

const STATE_LABEL: Record<RunSnapshot["status"]["state"], string> = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function parseVerdict(md: string): "PASS" | "FAIL" | undefined {
  const m = md.match(/^##\s+Verdict\s*\n(PASS|FAIL)\s*$/m);
  return m ? (m[1] as "PASS" | "FAIL") : undefined;
}

function renderDiffLine(line: string, key: number): JSX.Element {
  let cls = "diff-ctx";
  if (line.startsWith("+++") || line.startsWith("---")) cls = "diff-meta";
  else if (line.startsWith("@@")) cls = "diff-hunk";
  else if (line.startsWith("+")) cls = "diff-add";
  else if (line.startsWith("-")) cls = "diff-del";
  return (
    <span key={key} className={cls}>
      {line}
      {"\n"}
    </span>
  );
}

async function loadSide(id: string, wfNameById: Map<string, string>): Promise<Side> {
  const snap = await api.getRun(id);
  const rounds = buildRounds(snap.reports, snap.reviews);
  const bodies: StepBodies = {};
  const verdicts: Verdicts = {};
  await Promise.all(
    rounds.flatMap((r) => {
      const tasks: Promise<void>[] = [];
      if (r.worker) {
        tasks.push(
          api.readFile(id, `reports/round-${r.round}.md`).then((t) => {
            bodies[`report-${r.round}`] = t;
          }).catch(() => { bodies[`report-${r.round}`] = ""; })
        );
      }
      if (r.critic) {
        tasks.push(
          api.readFile(id, `reviews/round-${r.round}.md`).then((t) => {
            bodies[`review-${r.round}`] = t;
            const v = parseVerdict(t);
            if (v) verdicts[r.round] = v;
          }).catch(() => { bodies[`review-${r.round}`] = ""; })
        );
      }
      return tasks;
    })
  );
  return {
    snap,
    wfName: wfNameById.get(snap.workflow_id) ?? snap.workflow_id,
    rounds,
    verdicts,
    bodies,
  };
}

function totalDuration(side: Side): number | null {
  if (side.rounds.length === 0) return null;
  const start = new Date(side.snap.status.created_at).getTime() / 1000;
  let end: number | undefined;
  for (let i = side.rounds.length - 1; i >= 0; i--) {
    const r = side.rounds[i];
    const reviewMtime = r.critic ? side.snap.review_times?.[r.critic] : undefined;
    const reportMtime = r.worker ? side.snap.report_times?.[r.worker] : undefined;
    if (reviewMtime || reportMtime) {
      end = reviewMtime ?? reportMtime;
      break;
    }
  }
  return end ? end - start : null;
}

export default function RunComparePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const a = params.get("a");
  const b = params.get("b");

  const [sides, setSides] = useState<[Side, Side] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [crossDiffRound, setCrossDiffRound] = useState<number | null>(null);

  useEffect(() => {
    if (!a || !b) {
      setError("Missing run ids in URL.");
      return;
    }
    if (a === b) {
      setError("Cannot compare a run with itself.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const wfs: WorkflowSummary[] = await api.listWorkflows();
        const wfNameById = new Map(wfs.map((w) => [w.id, w.name]));
        const [sa, sb] = await Promise.all([
          loadSide(a, wfNameById),
          loadSide(b, wfNameById),
        ]);
        if (!cancelled) setSides([sa, sb]);
      } catch (e) {
        if (!cancelled) {
          const msg = String(e);
          setError(msg);
          toast.showError(`Failed to load comparison: ${msg}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [a, b, toast]);

  const sameTask = useMemo(() => {
    if (!sides) return false;
    return (
      sides[0].snap.workflow_id === sides[1].snap.workflow_id &&
      sides[0].snap.task.trim() === sides[1].snap.task.trim()
    );
  }, [sides]);

  const sharedRounds = useMemo(() => {
    if (!sides) return [] as number[];
    const aRounds = new Set(sides[0].rounds.filter((r) => r.worker).map((r) => r.round));
    return sides[1].rounds
      .filter((r) => r.worker && aRounds.has(r.round))
      .map((r) => r.round)
      .sort((x, y) => x - y);
  }, [sides]);

  const crossDiff = useMemo(() => {
    if (!sides || crossDiffRound === null) return null;
    const aBody = sides[0].bodies[`report-${crossDiffRound}`] ?? "";
    const bBody = sides[1].bodies[`report-${crossDiffRound}`] ?? "";
    return computeUnifiedDiff(aBody, bBody, `A/round-${crossDiffRound}`, `B/round-${crossDiffRound}`);
  }, [sides, crossDiffRound]);

  const toggleStep = (sideKey: "a" | "b", k: string) =>
    setOpenSteps((cur) => {
      const next = new Set(cur);
      const full = `${sideKey}:${k}`;
      if (next.has(full)) next.delete(full);
      else next.add(full);
      return next;
    });

  if (error) {
    return (
      <div className="page">
        <div className="empty">
          <p>{error}</p>
          <button className="btn" onClick={() => navigate("/runs")}>← Back to runs</button>
        </div>
      </div>
    );
  }
  if (!sides) {
    return (
      <div className="page">
        <p>Loading comparison…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Compare runs</h1>
          <p className="page-sub">
            Side-by-side reports and reviews. {sameTask ? "Same workflow + same task." : "Different workflows or tasks — meta only."}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => navigate("/runs")}>← Runs</button>
        </div>
      </div>

      <div className="cmp-meta">
        {sides.map((s, i) => (
          <SideMeta key={i} side={s} label={i === 0 ? "A" : "B"} />
        ))}
      </div>

      {sameTask && sharedRounds.length > 0 && (
        <div className="cmp-cross">
          <span className="cmp-cross-label">Cross-run report diff:</span>
          {sharedRounds.map((rn) => (
            <button
              key={rn}
              className={`btn ghost ${crossDiffRound === rn ? "active" : ""}`}
              onClick={() => setCrossDiffRound((cur) => (cur === rn ? null : rn))}
            >
              Round {rn}
            </button>
          ))}
          {crossDiffRound !== null && (
            <pre className="tl-step-body tl-step-diff cmp-cross-body">
              {crossDiff?.split(/\r?\n/).map(renderDiffLine)}
            </pre>
          )}
        </div>
      )}

      <div className="cmp-grid">
        {sides.map((s, i) => {
          const sideKey: "a" | "b" = i === 0 ? "a" : "b";
          return (
            <div key={i} className="cmp-col">
              <h2 className="cmp-col-title">Run {sideKey.toUpperCase()}</h2>
              {s.rounds.length === 0 && <p className="card-sub">No rounds.</p>}
              {s.rounds.map((r) => (
                <RoundCard
                  key={r.round}
                  side={s}
                  round={r}
                  open={(k) => openSteps.has(`${sideKey}:${k}`)}
                  onToggle={(k) => toggleStep(sideKey, k)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SideMeta({ side, label }: { side: Side; label: string }) {
  const total = totalDuration(side);
  const passedRounds = side.rounds.filter((r) => side.verdicts[r.round] === "PASS").length;
  const finalVerdict = (() => {
    const lastReviewed = [...side.rounds].reverse().find((r) => side.verdicts[r.round]);
    return lastReviewed ? side.verdicts[lastReviewed.round] : null;
  })();
  return (
    <div className="cmp-meta-card">
      <div className="cmp-meta-head">
        <span className="cmp-meta-label">Run {label}</span>
        <Link to={`/runs/${side.snap.id}`} className="cmp-meta-id">
          {side.snap.id.slice(-6)} ↗
        </Link>
      </div>
      <div className="cmp-meta-body">
        <div><span className="cmp-meta-k">Workflow</span><span>{side.wfName}</span></div>
        <div>
          <span className="cmp-meta-k">State</span>
          <span className={`run-row-state ${side.snap.status.state}`}>
            {STATE_LABEL[side.snap.status.state]}
          </span>
        </div>
        <div><span className="cmp-meta-k">Rounds</span><span>{side.rounds.length}</span></div>
        <div>
          <span className="cmp-meta-k">Final</span>
          <span>
            {finalVerdict ? (
              <span className={`tl-step-verdict ${finalVerdict.toLowerCase()}`}>{finalVerdict}</span>
            ) : (
              "—"
            )}
            <span className="cmp-meta-pct"> · {passedRounds}/{side.rounds.length} PASS</span>
          </span>
        </div>
        <div>
          <span className="cmp-meta-k">Duration</span>
          <span>{total !== null ? fmtDuration(total) : "—"}</span>
        </div>
        <div className="cmp-meta-task">
          <span className="cmp-meta-k">Task</span>
          <pre>{side.snap.task}</pre>
        </div>
      </div>
    </div>
  );
}

interface RoundCardProps {
  side: Side;
  round: RoundEntry;
  open: (k: string) => boolean;
  onToggle: (k: string) => void;
}

function RoundCard({ side, round, open, onToggle }: RoundCardProps) {
  const verdict = side.verdicts[round.round];
  const verdictClass = verdict === "PASS" ? "passed" : verdict === "FAIL" ? "failed" : "";
  return (
    <div className={`tl-round ${verdictClass}`}>
      <div className="tl-round-head">
        <span>Round {round.round}</span>
      </div>
      {round.worker && (
        <CmpStep
          k={`report-${round.round}`}
          role="worker"
          summary={summarizeMd(side.bodies[`report-${round.round}`])}
          body={side.bodies[`report-${round.round}`]}
          open={open(`report-${round.round}`)}
          onToggle={() => onToggle(`report-${round.round}`)}
        />
      )}
      {round.critic && (
        <CmpStep
          k={`review-${round.round}`}
          role="critic"
          summary={summarizeMd(side.bodies[`review-${round.round}`])}
          body={side.bodies[`review-${round.round}`]}
          verdict={verdict}
          open={open(`review-${round.round}`)}
          onToggle={() => onToggle(`review-${round.round}`)}
        />
      )}
    </div>
  );
}

interface CmpStepProps {
  k: string;
  role: "worker" | "critic";
  summary: string;
  body: string;
  verdict?: "PASS" | "FAIL";
  open: boolean;
  onToggle: () => void;
}

function CmpStep({ role, summary, body, verdict, open, onToggle }: CmpStepProps) {
  return (
    <div className={`tl-step role-${role} ${open ? "open" : ""}`}>
      <button className="tl-step-head" onClick={onToggle}>
        <span className="tl-step-icon">{role === "worker" ? "W" : "C"}</span>
        <span className="tl-step-role">{role}</span>
        <span className="tl-step-summary">{summary || "(empty)"}</span>
        {verdict && (
          <span className={`tl-step-verdict ${verdict.toLowerCase()}`}>{verdict}</span>
        )}
      </button>
      {open && (
        <pre className="tl-step-body">{body || "(empty)"}</pre>
      )}
    </div>
  );
}

// Minimal client-side unified-diff moved to ../lib/diff.ts
