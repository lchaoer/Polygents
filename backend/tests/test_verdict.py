import pytest

from app.engine.verdict import VerdictParseError, parse_verdict


def test_parse_pass():
    md = "# Review\n\n## Verdict\nPASS\n\n## Checklist Results\n"
    assert parse_verdict(md) == "PASS"


def test_parse_fail():
    md = "## Verdict\n\n\nFAIL\n\nrest\n"
    assert parse_verdict(md) == "FAIL"


def test_lowercase_rejected():
    md = "## Verdict\npass\n"
    with pytest.raises(VerdictParseError):
        parse_verdict(md)


def test_extra_text_rejected():
    md = "## Verdict\nPASS — looks good\n"
    with pytest.raises(VerdictParseError):
        parse_verdict(md)


def test_missing_section():
    md = "no verdict here\n"
    with pytest.raises(VerdictParseError):
        parse_verdict(md)


def test_missing_value_after_section():
    md = "## Verdict\n"
    with pytest.raises(VerdictParseError):
        parse_verdict(md)


def test_section_with_extra_whitespace():
    md = "## Verdict\n   PASS   \n"
    assert parse_verdict(md) == "PASS"
