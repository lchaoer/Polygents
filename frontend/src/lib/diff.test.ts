import { describe, expect, it } from "vitest";
import { computeUnifiedDiff } from "./diff";

function lines(out: string): string[] {
  return out.split("\n");
}

describe("computeUnifiedDiff", () => {
  it("produces standard headers", () => {
    const out = computeUnifiedDiff("hi\n", "hi\n", "A", "B");
    expect(out.startsWith("--- A\n+++ B\n@@ full file @@\n")).toBe(true);
  });

  it("emits only context lines when inputs are identical", () => {
    const out = computeUnifiedDiff("alpha\nbeta\ngamma", "alpha\nbeta\ngamma", "A", "B");
    const body = lines(out).slice(3);
    expect(body.every((l) => l.startsWith(" ") || l === "")).toBe(true);
    expect(body.filter((l) => l.startsWith("+") || l.startsWith("-"))).toEqual([]);
  });

  it("marks every line as deletion when b is empty", () => {
    const out = computeUnifiedDiff("a\nb\nc", "", "A", "B");
    const body = lines(out).slice(3);
    // Splitting "" gives one empty line which is a "+ " no, actually "".split() gives [""]
    // so we expect 3 deletions and 1 addition of the empty line.
    expect(body.filter((l) => l.startsWith("-")).length).toBe(3);
    expect(body.filter((l) => l.startsWith("+")).length).toBe(1);
  });

  it("marks every line as addition when a is empty", () => {
    const out = computeUnifiedDiff("", "x\ny", "A", "B");
    const body = lines(out).slice(3);
    expect(body.filter((l) => l.startsWith("+")).length).toBe(2);
    expect(body.filter((l) => l.startsWith("-")).length).toBe(1);
  });

  it("represents a single-line replacement as one - and one +", () => {
    const out = computeUnifiedDiff("hello\nworld", "hello\nplanet", "A", "B");
    const body = lines(out).slice(3);
    expect(body).toContain(" hello");
    expect(body).toContain("-world");
    expect(body).toContain("+planet");
  });

  it("preserves common prefix and suffix when middle changes", () => {
    const out = computeUnifiedDiff(
      "head\nold-1\nold-2\ntail",
      "head\nnew-1\nnew-2\nnew-3\ntail",
      "A",
      "B"
    );
    const body = lines(out).slice(3);
    expect(body[0]).toBe(" head");
    expect(body[body.length - 1]).toBe(" tail");
    expect(body.filter((l) => l.startsWith("-"))).toEqual(["-old-1", "-old-2"]);
    expect(body.filter((l) => l.startsWith("+"))).toEqual(["+new-1", "+new-2", "+new-3"]);
  });

  it("handles CRLF line endings the same as LF", () => {
    const out = computeUnifiedDiff("a\r\nb", "a\r\nc", "A", "B");
    const body = lines(out).slice(3);
    expect(body).toContain(" a");
    expect(body).toContain("-b");
    expect(body).toContain("+c");
  });

  it("uses the labels passed in the headers", () => {
    const out = computeUnifiedDiff("x", "y", "report A round 1", "report B round 1");
    expect(out).toContain("--- report A round 1");
    expect(out).toContain("+++ report B round 1");
  });
});
