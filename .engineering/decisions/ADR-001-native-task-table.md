# ADR-001: Use the native `task` (Activity) table instead of a custom table

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Yuri, Amar
- **Context area:** data-model

## Context
Project Online tasks must land in Dataverse. Two homes were possible: a custom
table (`klein_task`) or the platform's native `task` activity entity. We had
already begun building `klein_task` when scheduling requirements surfaced:
allocate people to tasks with a visual board, see tasks on record timelines,
and (later, custom-built) recompute dates. The team explicitly accepts a single
security role and an isolated environment, and does not need the native
Activity status model to be avoided.

## Decision
Migrate tasks into the **native `task` activity table**. Reuse its native
columns where they fit (`subject` as primary name, `scheduledstart`/
`scheduledend`, `actualstart`/`actualend`, `percentcomplete`) and add custom
`klein_*` columns for everything else (WBS, EVM metrics, flags, financial codes,
the self-lookup `klein_parenttaskid`, and the `klein_projectid` link).

## Alternatives considered
- **Custom `klein_task` table.** Cleaner status model and a typed Project
  lookup out of the box, no Activity baggage. Rejected because it forfeits
  native scheduling surfaces (timeline, "Enable for Resource Scheduling") that
  the team wants, and the overlap of reusable native fields was small but real.
  The tradeoff flipped once "usable for scheduling" became a goal.
- **Project Operations / Project for the Web data model.** Purpose-built for
  CPM scheduling. Rejected: separate product, separate licensing, and its own
  data model — out of scope for a data migration; would replace the strategy,
  not support it. (Manual CPM will be built on top instead.)

## Consequences
- Tasks appear in the platform's activity surfaces (timeline, activity views).
  `regardingobjectid` (polymorphic) is populated separately after load to drive
  the Project timeline; the typed `klein_projectid` handles data/reporting.
- Table type (Standard vs Activity) is immutable after creation — this choice
  is effectively permanent once data is loaded.
- Native status/state model (Open/Completed/Canceled) is accepted as-is;
  richer scheduling state lives in custom columns/flags.
- Primary column is `subject`, not `name` — every mapping and the Gantt's
  Title binding must use `subject`.
- Revisit if the team ever adopts Project Operations wholesale, which would
  supersede this.
