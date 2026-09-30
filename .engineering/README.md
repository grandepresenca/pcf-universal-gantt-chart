# .engineering

Versioned engineering knowledge for this repository, consumable by humans and
by any AI agent (Claude Code, others). Knowledge belongs to the project, not to
a tool.

## Layout
- `standards/` — how we write code here. Durable craft rules.
  - `software-engineering.md` — general, framework-agnostic
  - `typescript.md` — TypeScript / the compiler as a correctness tool
  - `react.md` — components, rendering cost, hooks
  - `pcf.md` — PCF lifecycle, dataset, manifest, performance, write-back
- `decisions/` — Architecture Decision Records (ADRs): *why* things are the way
  they are. Read the relevant ADR before changing an area it covers.

## When to add here (human-gated)
- A **standard** changes when we adopt or retire a durable practice — not for a
  one-off. Keep them short; a standard nobody reads is worse than none.
- An **ADR** is written when a decision (a) shaped the system and (b) someone
  could reasonably question in six months. Not every choice is an ADR; copy
  `decisions/ADR-000-template.md`.

Agents may *suggest* additions at the end of a task; a human decides whether it's
durable and general enough to keep.
