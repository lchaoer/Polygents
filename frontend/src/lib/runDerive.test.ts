import { describe, expect, it } from "vitest";
import {
  buildRounds,
  deriveGraphState,
  fmtDuration,
  fmtSize,
  roundBoundaries,
  summarizeMd,
  tagFor,
} from "./runDerive";
import type { RunSnapshot } from "../types";

describe("buildRounds", () => {
  it("pairs report and review by round number", () => {
    const out = buildRounds(
      ["round-1.md", "round-2.md"],
      ["round-1.md", "round-2.md"]
    );
    expect(out).toEqual([
      { round: 1, worker: "round-1.md", critic: "round-1.md" },
      { round: 2, worker: "round-2.md", critic: "round-2.md" },
    ]);
  });

  it("handles missing critic for last round", () => {
    const out = buildRounds(["round-1.md", "round-2.md"], ["round-1.md"]);
    expect(out).toEqual([
      { round: 1, worker: "round-1.md", critic: "round-1.md" },
      { round: 2, worker: "round-2.md" },
    ]);
  });

  it("ignores files that don't match round-N.md pattern", () => {
    const out = buildRounds(["junk.txt", "round-1.md"], []);
    expect(out).toEqual([{ round: 1, worker: "round-1.md" }]);
  });

  it("sorts rounds ascending even if input is unsorted", () => {
    const out = buildRounds(["round-3.md", "round-1.md", "round-2.md"], []);
    expect(out.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("returns empty list for no files", () => {
    expect(buildRounds([], [])).toEqual([]);
  });
});

describe("roundBoundaries", () => {
  it("uses run start as first round's start", () => {
    const bounds = roundBoundaries(
      { "round-1.md": 100 },
      { "round-1.md": 110 },
      90
    );
    expect(bounds).toEqual([{ round: 1, start: 90, end: 110 }]);
  });

  it("chains boundaries: each round starts when previous review ended", () => {
    const bounds = roundBoundaries(
      { "round-1.md": 100, "round-2.md": 150 },
      { "round-1.md": 110, "round-2.md": 160 },
      90
    );
    expect(bounds).toEqual([
      { round: 1, start: 90, end: 110 },
      { round: 2, start: 110, end: 160 },
    ]);
  });

  it("falls back to report mtime when review is missing", () => {
    const bounds = roundBoundaries(
      { "round-1.md": 100 },
      {}, // no review yet
      90
    );
    expect(bounds[0].end).toBe(100);
  });

  it("returns empty array when there are no rounds", () => {
    expect(roundBoundaries({}, {}, 90)).toEqual([]);
  });
});

describe("tagFor", () => {
  const bounds = [
    { round: 1, start: 100, end: 110 },
    { round: 2, start: 110, end: 160 },
  ];

  it("returns R1 for mtime within round 1 window", () => {
    expect(tagFor(105, bounds)).toBe("R1");
  });

  it("returns R2 for mtime within round 2 window", () => {
    expect(tagFor(150, bounds)).toBe("R2");
  });

  it("returns null for mtime outside any window", () => {
    expect(tagFor(50, bounds)).toBeNull();
    expect(tagFor(200, bounds)).toBeNull();
  });

  it("first match wins for boundary mtimes", () => {
    // 110 is end of R1 and start of R2; the for-loop returns R1 first
    expect(tagFor(110, bounds)).toBe("R1");
  });
});

const baseSnap: RunSnapshot = {
  id: "x",
  workflow_id: "wf",
  status: {
    state: "running",
    current_round: 1,
    workflow_id: "wf",
    created_at: "2026-05-10T00:00:00Z",
    updated_at: "2026-05-10T00:00:00Z",
    error: null,
  },
  task: "",
  checklist: "",
  reports: [],
  reviews: [],
};

describe("deriveGraphState", () => {
  it("everything idle when nothing has happened", () => {
    const g = deriveGraphState({
      snap: { ...baseSnap, status: { ...baseSnap.status, state: "pending" } },
      rounds: [],
      verdicts: {},
      activeAgent: null,
    });
    expect(g.task).toBe("idle");
    expect(g.worker).toBe("idle");
    expect(g.critic).toBe("idle");
    expect(g.done).toBe("idle");
  });

  it("worker running when activeAgent is worker", () => {
    const g = deriveGraphState({
      snap: baseSnap,
      rounds: [],
      verdicts: {},
      activeAgent: { role: "worker", round: 1 },
    });
    expect(g.task).toBe("done");
    expect(g.worker).toBe("running");
    expect(g.critic).toBe("idle");
    expect(g.workerRound).toBe(1);
  });

  it("worker done after report written, critic running while reviewing", () => {
    const g = deriveGraphState({
      snap: baseSnap,
      rounds: [{ round: 1, worker: "round-1.md" }],
      verdicts: {},
      activeAgent: { role: "critic", round: 1 },
    });
    expect(g.worker).toBe("done");
    expect(g.critic).toBe("running");
  });

  it("critic shows failed style on FAIL verdict", () => {
    const g = deriveGraphState({
      snap: baseSnap,
      rounds: [{ round: 1, worker: "round-1.md", critic: "round-1.md" }],
      verdicts: { 1: "FAIL" },
      activeAgent: null,
    });
    expect(g.critic).toBe("failed");
    expect(g.lastVerdict).toBe("FAIL");
  });

  it("done turns green when run is passed", () => {
    const g = deriveGraphState({
      snap: { ...baseSnap, status: { ...baseSnap.status, state: "passed" } },
      rounds: [{ round: 1, worker: "round-1.md", critic: "round-1.md" }],
      verdicts: { 1: "PASS" },
      activeAgent: null,
    });
    expect(g.done).toBe("done");
  });

  it("done turns failed when run failed", () => {
    const g = deriveGraphState({
      snap: { ...baseSnap, status: { ...baseSnap.status, state: "failed" } },
      rounds: [],
      verdicts: {},
      activeAgent: null,
    });
    expect(g.done).toBe("failed");
  });
});

describe("summarizeMd", () => {
  it("returns Click to expand for undefined", () => {
    expect(summarizeMd(undefined)).toBe("Click to expand");
  });

  it("returns (empty) for empty string", () => {
    expect(summarizeMd("")).toBe("(empty)");
  });

  it("skips heading lines", () => {
    expect(summarizeMd("# Title\n\nReal first line")).toBe("Real first line");
  });

  it("truncates to 117 chars + ellipsis if too long", () => {
    const long = "a".repeat(150);
    expect(summarizeMd(long)).toBe("a".repeat(117) + "…");
  });
});

describe("fmtDuration", () => {
  it("subsecond shows <1s", () => {
    expect(fmtDuration(0.5)).toBe("<1s");
  });
  it("seconds rounded", () => {
    expect(fmtDuration(28.4)).toBe("28s");
  });
  it("minute round number", () => {
    expect(fmtDuration(120)).toBe("2m");
  });
  it("minutes + seconds", () => {
    expect(fmtDuration(90)).toBe("1m 30s");
  });
});

describe("fmtSize", () => {
  it("bytes", () => {
    expect(fmtSize(500)).toBe("500 B");
  });
  it("kilobytes", () => {
    expect(fmtSize(2048)).toBe("2.0 KB");
  });
  it("megabytes", () => {
    expect(fmtSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
