# ADR-008: Quality gate + separated Dev/QA agents for AI-assisted work

- **Status:** Accepted
- **Date:** 2026-09-29
- **Context area:** engineering-process

## Context
Development uses Claude Code agents. The question was how to get mature,
trustworthy output without relying on an agent "being good" — maturity can't be
prompted into existence, only enforced and reviewed.

## Decision
Trust is structural, not attitudinal, built on three layers: (1) an automatic
gate that fails objectively — ESLint (complexity, no-`any`, unsafe rules),
`tsc` strict, build, and Jest; (2) a **Definition of Done verified by running
those commands**, forbidding the usual cheats (`any`, `@ts-ignore`,
`eslint-disable`); (3) two subagents — `pcf-dev` (can edit) and `pcf-qa`
(read-only: reads, builds, tests, reports) — so the reviewer is not the author.
Rigor is risk-adaptive (see CLAUDE.md). Verifiable rules live in tooling, not
only in prose.

## Alternatives considered
- **Single agent, trust the prompt.** No independent check; "senior engineer"
  in a prompt guarantees nothing. Rejected.
- **Human-only review, no automated gate.** Doesn't scale and misses what tools
  catch reliably (complexity, unsafe types). Rejected as the sole mechanism.
- **Elaborate learning/workflow protocols in the prompt.** More text to obey is
  the fragility we're trying to escape; automation and human diff-review proved
  more reliable in practice. Deferred — capture knowledge as standards/ADRs
  instead, and only formalize protocols if a real need emerges.

## Consequences
- Every commit passes build + lint + typecheck + test, verified.
- The gate depends on modern tooling versions (ESLint 8+, @typescript-eslint 6+),
  which drove part of the modernization order.
- Knowledge lives in `.engineering/` (standards, ADRs), consumable by any agent
  or human — not locked to one tool.
- Knowledge capture is human-gated: agents suggest lessons; humans decide. Not
  every correction becomes a durable artifact.
