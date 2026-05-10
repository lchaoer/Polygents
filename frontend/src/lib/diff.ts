// Minimal client-side unified-diff (line-based LCS).
// Used by RunComparePage to diff two reports across runs without a backend round-trip.
// Not a drop-in replacement for difflib — produces a single full-file hunk, no context windows.

export function computeUnifiedDiff(
  a: string,
  b: string,
  aLabel: string,
  bLabel: string
): string {
  const al = a.split(/\r?\n/);
  const bl = b.split(/\r?\n/);
  const n = al.length;
  const m = bl.length;

  // LCS length table — dp[i][j] = LCS length of al[i..] vs bl[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = al[i] === bl[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      ops.push(" " + al[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push("-" + al[i]);
      i++;
    } else {
      ops.push("+" + bl[j]);
      j++;
    }
  }
  while (i < n) {
    ops.push("-" + al[i]);
    i++;
  }
  while (j < m) {
    ops.push("+" + bl[j]);
    j++;
  }

  const header = `--- ${aLabel}\n+++ ${bLabel}\n@@ full file @@\n`;
  return header + ops.join("\n");
}
