import type { RunSnapshot, WorkspaceFile } from "../types";

export interface RoundEntry {
  round: number;
  worker?: string;
  critic?: string;
}

export type NodeState = "idle" | "running" | "done" | "failed";

export interface GraphState {
  task: NodeState;
  worker: NodeState;
  critic: NodeState;
  done: NodeState;
  lastVerdict: "PASS" | "FAIL" | null;
  workerRound: number;
  criticRound: number;
}

export interface RoundBoundary {
  round: number;
  start: number;
  end: number;
}

const ROUND_RE = /round-(\d+)\.md$/;

export function buildRounds(reports: string[], reviews: string[]): RoundEntry[] {
  const m = new Map<number, RoundEntry>();
  for (const f of reports) {
    const n = Number(f.match(ROUND_RE)?.[1]);
    if (!n) continue;
    m.set(n, { ...(m.get(n) ?? { round: n }), round: n, worker: f });
  }
  for (const f of reviews) {
    const n = Number(f.match(ROUND_RE)?.[1]);
    if (!n) continue;
    m.set(n, { ...(m.get(n) ?? { round: n }), round: n, critic: f });
  }
  return [...m.values()].sort((a, b) => a.round - b.round);
}

export function roundBoundaries(
  reportTimes: Record<string, number>,
  reviewTimes: Record<string, number>,
  runStartedAt: number
): RoundBoundary[] {
  const rounds = new Set<number>();
  for (const f of Object.keys(reportTimes)) {
    const n = Number(f.match(ROUND_RE)?.[1]);
    if (n) rounds.add(n);
  }
  const sorted = [...rounds].sort((a, b) => a - b);
  const out: RoundBoundary[] = [];
  let prevEnd = runStartedAt;
  for (const n of sorted) {
    const reviewMtime = reviewTimes[`round-${n}.md`];
    const reportMtime = reportTimes[`round-${n}.md`];
    const end = reviewMtime ?? reportMtime ?? prevEnd;
    out.push({ round: n, start: prevEnd, end });
    prevEnd = end;
  }
  return out;
}

export function tagFor(mtime: number, bounds: RoundBoundary[]): string | null {
  for (const b of bounds) {
    if (mtime >= b.start && mtime <= b.end + 0.5) return `R${b.round}`;
  }
  return null;
}

export function deriveGraphState(args: {
  snap: RunSnapshot | null;
  rounds: RoundEntry[];
  verdicts: Record<number, "PASS" | "FAIL">;
  activeAgent: { role: "worker" | "critic"; round: number } | null;
}): GraphState {
  const { snap, rounds, verdicts, activeAgent } = args;
  const state = snap?.status.state ?? "pending";
  const isRunning = state === "running" || state === "pending";
  const lastRound = rounds[rounds.length - 1];
  const lastVerdict = lastRound ? verdicts[lastRound.round] ?? null : null;

  let task: NodeState = "idle";
  let worker: NodeState = "idle";
  let critic: NodeState = "idle";
  let done: NodeState = "idle";

  if (rounds.length > 0 || activeAgent) task = "done";
  if (state === "passed") done = "done";
  if (state === "failed") done = "failed";

  if (activeAgent?.role === "worker") worker = "running";
  else if (lastRound?.worker) worker = "done";

  if (activeAgent?.role === "critic") critic = "running";
  else if (lastRound?.critic) critic = lastVerdict === "FAIL" ? "failed" : "done";

  if (!isRunning && state !== "passed" && state !== "failed") {
    worker = worker === "running" ? "idle" : worker;
    critic = critic === "running" ? "idle" : critic;
  }

  return {
    task,
    worker,
    critic,
    done,
    lastVerdict,
    workerRound:
      activeAgent?.role === "worker" ? activeAgent.round : lastRound?.round ?? 0,
    criticRound:
      activeAgent?.role === "critic"
        ? activeAgent.round
        : lastRound?.critic
        ? lastRound.round
        : 0,
  };
}

export function summarizeMd(text: string | undefined): string {
  if (text === undefined) return "Click to expand";
  if (text === "") return "(empty)";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    return line.length > 120 ? line.slice(0, 117) + "…" : line;
  }
  return text.slice(0, 120);
}

export function fmtDuration(seconds: number): string {
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function tagWorkspaceFile(
  file: WorkspaceFile,
  bounds: RoundBoundary[]
): string | null {
  return tagFor(file.mtime, bounds);
}
