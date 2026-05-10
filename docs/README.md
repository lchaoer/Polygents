# Polygents Documentation

> **Polygents** is a Worker + Critic dual-agent loop. One agent does the work, a second agent reviews it against a fixed checklist and answers PASS or FAIL. They iterate until PASS — or until `max_rounds` is hit.

This is the documentation hub. Pick the doc that matches what you need:

| Doc | Read this if you want to know… | Audience |
|---|---|---|
| [01 — Overview](01-overview.md) | What Polygents is, why it exists, what it deliberately does **not** do | Anyone touching the project for the first time |
| [02 — Architecture](02-architecture.md) | How the system is wired: data flow, file protocol, SSE events, module boundaries | Anyone modifying code |
| [03 — Features](03-features.md) | Every UI surface, interaction, keyboard shortcut, live-visualization detail | Users + frontend contributors |
| [04 — Development](04-development.md) | How to run, test, extend, and the conventions to follow | Anyone contributing code |

## Quick links

- **Run it locally** → [04 — Development § Getting started](04-development.md#getting-started)
- **Why two agents and not three?** → [01 — Overview § Scope](01-overview.md#scope-and-non-goals)
- **What does the live UI actually show?** → [03 — Features § Run detail page](03-features.md#run-detail-page)
- **Where are events / SSE described?** → [02 — Architecture § Event stream](02-architecture.md#event-stream-sse)

## Historical design docs

The original v2 rewrite design and implementation plan live under [`plans/`](plans/) for context — they predate the current 2-agent visualization era and exist for archaeology, not as current spec.

- [2026-04-25 Design](plans/2026-04-25-polygents-rewrite-design.md)
- [2026-04-25 Implementation Plan](plans/2026-04-25-polygents-rewrite-implementation-plan.md)
