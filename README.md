# Polygents

A **Worker + Critic** dual-agent loop. One agent does the job, a second agent reviews it against a fixed checklist and answers `PASS` or `FAIL`. They iterate until `PASS` — or until `max_rounds`.

Single-user, local, file-system-as-source-of-truth, web UI with live agent visualization.

## Run it

```bash
./scripts/dev.sh
# backend  -> http://127.0.0.1:8001
# frontend -> http://127.0.0.1:5173
```

Requires Python 3.10+, Node 18+, and `ANTHROPIC_API_KEY` in your environment. On Windows you also need Git Bash. Full setup notes in [docs/04-development.md](docs/04-development.md).

## Documentation

The project documentation lives in [`docs/`](docs/). Start here:

- [docs/README.md](docs/README.md) — index and quick-links
- [docs/01-overview.md](docs/01-overview.md) — what Polygents is, why it exists, what it deliberately doesn't do
- [docs/02-architecture.md](docs/02-architecture.md) — system design, file protocol, SSE event stream, module map
- [docs/03-features.md](docs/03-features.md) — every UI surface and interaction
- [docs/04-development.md](docs/04-development.md) — run, test, conventions, pitfalls

## Status

Backend: 46 pytest cases. Frontend: 38 vitest cases. All passing.
