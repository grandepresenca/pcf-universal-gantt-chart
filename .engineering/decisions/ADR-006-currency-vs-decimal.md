# ADR-006: Cost fields as Currency (Money), not Decimal

- **Status:** Accepted
- **Date:** 2026-09-11
- **Context area:** data-model

## Context
PWA cost fields include negatives (variances: CV, SV, VAC) and are monetary.
An early staging attempt created a cost column as Decimal with a 0-minimum,
which rejected a legitimate negative value (`-100592...`).

## Decision
Model all monetary fields (Cost, ActualCost, EAC, VAC, BCWS/BCWP/ACWP, CV, SV,
etc.) as **Currency (Money)**. Keep Decimal for non-money numerics (hours,
durations, ratios, coordinates, percentages). Confirm the environment base
currency is USD before creating any Money column.

## Alternatives considered
- **Decimal for costs.** Avoids the Money machinery (`_base` shadow columns,
  `transactioncurrencyid`), but loses currency formatting and, as configured,
  blocked negatives. Rejected — Money handles negatives natively and formats
  correctly for users.
- **Float/Double.** Imprecise for money. Rejected.

## Consequences
- Each Money column adds a `_base` column and the table gains
  `transactioncurrencyid` + `exchangerate`. Accepted for correct behaviour.
- Base currency must be USD (source is 100% USD, environment isolated) — set
  before column creation; not cheaply changed after data loads.
- Numeric ranges/precision must allow negatives and the source's decimal places
  (e.g. round 13-decimal ratios to 4; null-out sentinel values like TCPI's
  4294967295).
