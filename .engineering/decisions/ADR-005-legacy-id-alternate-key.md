# ADR-005: `klein_legacyid` alternate key as the migration identity

- **Status:** Accepted
- **Date:** 2026-09-11
- **Context area:** migration

## Context
Migration must be re-runnable (idempotent) across rehearsals, must resolve
relationships between records, and must preserve traceability back to the source.
Dataverse GUIDs are generated on insert and can't be the join key from source.

## Decision
Every migrated table carries `klein_legacyid` (text) holding the source's
identifier (PWA GUID, or `<list>:<itemid>` for SharePoint), with an **alternate
key** on it. All upserts match on it; all cross-table lookups resolve through it.
Companion audit columns: `klein_legacysource`, `klein_legacycreatedon`
(also mapped to `overriddencreatedon`), `klein_migratedon`.

## Alternatives considered
- **Match on a natural business key** (project number, task WBS). Not reliably
  unique or stable across all entities; some lack one. Rejected.
- **No alternate key, match on primary name.** Ambiguous (duplicate names) and
  not idempotent. Rejected.

## Consequences
- Upserts are idempotent; rehearsals re-run freely.
- Original creation dates are preserved via `overriddencreatedon` — but only on
  the *first* insert; a first load that omits it can't be corrected by update,
  so the mapping must be right the first time.
- The alternate-key index must be Active before Link dataflows (see ADR-002).
- Traceability: any final record points back to its source row.
