"""Tests for SDK client helpers (the bits we own, not the SDK itself)."""
from __future__ import annotations

from app.engine.sdk_client import _summarize_tool_input


def test_read_tool_returns_file_path():
    assert _summarize_tool_input("Read", {"file_path": "src/foo.py"}) == "src/foo.py"


def test_write_tool_returns_path_alias():
    assert _summarize_tool_input("Write", {"path": "out.md"}) == "out.md"


def test_edit_tool_returns_file_path():
    assert _summarize_tool_input("Edit", {"file_path": "a.py", "old_string": "x", "new_string": "y"}) == "a.py"


def test_bash_truncates_long_commands():
    long = "echo " + "x" * 200
    out = _summarize_tool_input("Bash", {"command": long})
    assert out.endswith("…")
    assert len(out) <= 121


def test_bash_short_command_kept_intact():
    assert _summarize_tool_input("Bash", {"command": "ls -la"}) == "ls -la"


def test_glob_returns_pattern():
    assert _summarize_tool_input("Glob", {"pattern": "**/*.ts"}) == "**/*.ts"


def test_grep_returns_pattern():
    assert _summarize_tool_input("Grep", {"pattern": "TODO"}) == "TODO"


def test_todowrite_returns_empty():
    assert _summarize_tool_input("TodoWrite", {"todos": [{"content": "x"}]}) == ""


def test_unknown_tool_falls_back_to_keys():
    out = _summarize_tool_input("MysteryTool", {"foo": 1, "bar": 2, "baz": 3})
    assert out == "foo=…, bar=…"


def test_non_dict_input_returns_empty():
    assert _summarize_tool_input("Read", None) == ""
    assert _summarize_tool_input("Read", "string") == ""
