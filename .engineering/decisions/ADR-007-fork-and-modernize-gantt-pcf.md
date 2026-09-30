# ADR-007: Fork and modernize an existing Gantt PCF rather than build new

- **Status:** Accepted
- **Date:** 2026-09-29
- **Context area:** pcf

## Context
The MDA needs a Gantt that shows the project WBS with nested tasks, similar to
the Planner web view. An open-source PCF (`MaTeMaTuK/pcf-universal-gantt-chart`,
on `gantt-task-react`) covers most of it but lacks two things we need: recursive
multi-level indentation and configurable extra columns in the list grid. It is
also from 2020 and doesn't build on Node 20.

## Decision
Fork the existing PCF and extend it, rather than build a Gantt from scratch or
use a paid component. First modernize the toolchain (build on Node 20 without
the legacy OpenSSL flag; enable lint/typecheck gate), then add the two features.

## Alternatives considered
- **Build from scratch.** Full control, but re-implements Gantt rendering,
  view switching, and drag interactions the fork already has. Rejected — high
  cost for capability that exists.
- **Paid/commercial Gantt control.** Licensing and less control over the two
  custom behaviours. Rejected for an isolated internal tool.
- **Use the fork as-is.** Doesn't meet the two requirements. Rejected.

## Consequences
- We own a fork: we carry its maintenance and its dependency debt (tracked as
  backlog: second-wave upgrades, dev-only audit findings).
- The fork must live in a 4Trix/client org long-term, not a personal account
  (open governance item).
- Modernization done behaviour-preserving and gated; features build on a green
  baseline.
- `gantt-task-react` stays at 0.3.7 (next version requires React 18) — a ceiling
  to revisit only with a React upgrade.
