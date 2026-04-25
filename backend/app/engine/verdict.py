from __future__ import annotations

from typing import Literal

Verdict = Literal["PASS", "FAIL"]


class VerdictParseError(ValueError):
    pass


def parse_verdict(review_md: str) -> Verdict:
    """Parse the line directly under '## Verdict' in a Critic review.

    Required: section header '## Verdict' on its own line, followed by exactly
    'PASS' or 'FAIL' (uppercase) on the next non-empty line. Anything else
    raises VerdictParseError.
    """
    lines = review_md.splitlines()
    for i, line in enumerate(lines):
        if line.strip() == "## Verdict":
            for j in range(i + 1, len(lines)):
                candidate = lines[j].strip()
                if not candidate:
                    continue
                if candidate == "PASS":
                    return "PASS"
                if candidate == "FAIL":
                    return "FAIL"
                raise VerdictParseError(
                    f"verdict line must be 'PASS' or 'FAIL', got: {candidate!r}"
                )
            raise VerdictParseError("no verdict line after '## Verdict' header")
    raise VerdictParseError("no '## Verdict' section found in review")
