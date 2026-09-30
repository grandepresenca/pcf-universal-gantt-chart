# Architecture Decision Records

Each ADR captures one decision: its context, the choice, the alternatives
rejected, and the consequences. They are immutable once Accepted — to change a
decision, write a new ADR that supersedes the old one (update the old one's
Status to "Superseded by ADR-XXX").

Copy `ADR-000-template.md` to start one. Number sequentially.

## Index
| ADR | Title | Status | Area |
|---|---|---|---|
| 001 | Native `task` (Activity) table vs custom | Accepted | data-model |
| 002 | Two-pass Load/Link for self-referential lookups | Accepted | migration |
| 003 | Stage raw data in Dataverse, then transform | Accepted | migration |
| 004 | Keep monthly financial columns flat (provisional) | Accepted | data-model |
| 005 | `klein_legacyid` alternate key as migration identity | Accepted | migration |
| 006 | Cost fields as Currency, not Decimal | Accepted | data-model |
| 007 | Fork and modernize an existing Gantt PCF | Accepted | pcf |
| 008 | Quality gate + separated Dev/QA agents | Accepted | engineering-process |

Keep this table current when adding an ADR.
