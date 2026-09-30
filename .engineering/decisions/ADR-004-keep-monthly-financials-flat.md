# ADR-004: Keep the 14 quantity/financial columns flat (revisit for reporting)

- **Status:** Accepted (provisional)
- **Date:** 2026-09-10
- **Context area:** data-model

## Context
Source tasks carry repeated financial/quantity fields (e.g. 14 substance×unit
quantity columns on the EOG list; monthly Invoice/Accrual buckets on PWA tasks).
Normalizing them into child rows (substance × unit × period × value) is cleaner
for aggregate reporting but changes the shape users know from the source grids.
The 96 monthly PWA buckets were additionally all-zero in the sampled data.

## Decision
Migrate the active flat quantity columns **as flat columns**, matching the
grids users expect. Defer normalization. Treat the all-zero monthly buckets as
**pending** — re-profile after a full (non-sampled) extraction before deciding
whether any carry real data worth a child table.

## Alternatives considered
- **Normalize now into a child table.** Better for "total oil in 2025"-style
  reporting; worse for matching the familiar grid, and premature while we don't
  know if the monthly detail is even used. Rejected for now.
- **Drop the monthly buckets outright.** Risk of losing real data not seen in a
  300-row sample. Rejected — mark pending, verify on full data.

## Consequences
- Grids match the source; reporting that needs long-format can unpivot later or
  add a rollup — a reversible follow-up.
- A pending task remains: re-profile the monthly financial columns on the full
  Task extraction; promote to a child table only if real values appear.
- Provisional status: this ADR is expected to be revisited once Power BI
  reporting needs are known.
