# ADR-003: Stage raw data in Dataverse tables, transform to final tables

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context area:** migration

## Context
Microsoft is decommissioning PWA web data access, creating time pressure to
capture everything before it's gone. Extraction, cleansing, type mapping, and
lookup resolution are separate concerns that shouldn't be entangled in one step.

## Decision
Land raw source data (PWA OData and SharePoint lists) into **staging tables in
Dataverse first**, as loosely-typed columns, then transform staging → final
tables with typed columns, choices, and resolved lookups in a second stage.

## Alternatives considered
- **Load source directly into final tables.** Couples extraction to
  transformation; any mapping change means re-extracting from a source that is
  going away. Rejected — loses the frozen capture.
- **External staging (Data Lake / files).** Viable, but keeps the frozen
  snapshot outside the platform and adds another system. Dataverse staging keeps
  the captured snapshot queryable in-platform after PWA is gone. Chosen for
  simplicity given the team's stack.

## Consequences
- After PWA is gone, staging tables *are* the frozen source-of-record, queryable
  without the original system.
- Transformations are re-runnable against staging without re-extracting.
- Staging is intentionally permissive (few constraints); validation belongs in
  the transform, not in staging. (A validation-on-staging attempt caused early
  errors — staging should not validate.)
- Extra storage for duplicated (staging + final) data, accepted temporarily;
  staging is retired after go-live + a retention window.
