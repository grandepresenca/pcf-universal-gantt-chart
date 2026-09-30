# ADR-002: Two-pass "Load then Link" dataflows for self-referential lookups

- **Status:** Accepted
- **Date:** 2026-09-11
- **Context area:** migration

## Context
Records with self-referential lookups (Project → Parent Project, Task → Parent
Task) can't be inserted in a single pass: a child row may be processed before
its parent exists, and within a dataflow the write order isn't guaranteed. A
lookup that can't resolve at insert time fails the row. Task's parent hierarchy
is genuinely multi-level (depth ~4–5), so ordering can't be hand-arranged.

## Decision
Load in two passes per table family. **Load** dataflow: insert all rows with
every scalar column and non-self lookups, but *without* the self-referential
lookup. **Link** dataflow (Update-only): map just the alternate key
(`klein_legacyid`) plus the self lookup, resolved by the target's alternate
key. Because Load created every row first, Link always finds the parent.

## Alternatives considered
- **Single pass with topological sort of parents-before-children.** Fragile:
  depends on write ordering the platform doesn't guarantee, and re-sorting on
  every run. Rejected.
- **Sort so root/parent rows come first.** Works only for one level; Task's
  multi-level tree breaks it. Rejected.
- **Custom .NET upsert with explicit ordering.** More control, but heavier and
  unnecessary at this data volume; dataflows stay declarative and re-runnable.
  Rejected for now (would reconsider only at much larger scale or complex rules).

## Consequences
- Every migrated table needs a `klein_legacyid` text column with an **alternate
  key**, created before any Link dataflow — this is a hard prerequisite and the
  key must be Active (built on an empty table to avoid duplicate-key failures).
- Loads are idempotent (upsert by alternate key): safe to re-run without
  duplicating. Enables repeated rehearsals.
- Two dataflows per family is more artifacts, accepted for determinism.
- Same pattern applies uniformly (Project parent, Task parent), so it's learned
  once.
