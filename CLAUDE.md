# pcf-universal-gantt-chart — King Ranch fork

## What this repo is
A PowerApps Component Framework (PCF) control that renders an interactive
Gantt chart over a Dataverse dataset. TypeScript + React (17), wrapping the
`gantt-task-react` library. Built with `pcf-scripts` (Webpack under the hood).

## Why this fork exists
Two customizations for the King Ranch project (Project Online → Dataverse
migration), both **presentation only** — no data-model or date-logic changes:
1. **Recursive nested hierarchy** — indent tasks by Parent Record to N
   levels (child → grandchild → great-grandchild), not just one level.
2. **Extra columns** in the left-hand list grid, configurable, beyond the
   fixed Title / Start / End.

## Key source files (from the build output)
- `UniversalGanttChartComponent/index.ts` — PCF entry: init/updateView/
  getOutputs/destroy, reads the dataset, maps it to the Gantt.
- `UniversalGanttChartComponent/components/universal-gantt.tsx` — assembles
  the chart; where hierarchy/task assembly happens.
- `UniversalGanttChartComponent/components/task-list-table.tsx` — the LEFT
  grid rows. Extra columns and indentation land here.
- `UniversalGanttChartComponent/components/task-list-header.tsx` — the LEFT
  grid header. Extra column headers land here.
- `UniversalGanttChartComponent/components/view-switcher.tsx`,
  `gantt-tooltip.tsx`, `helper.ts` — supporting pieces.
- `ControlManifest.Input.xml` (in the component folder) — PCF properties.
  New configurable inputs (e.g. extra columns) are declared here.

## Data context (do not break these assumptions)
- Target table is the native `task` activity. Primary name = `subject`.
- Dates come from `scheduledstart` / `scheduledend` (User Local behaviour).
- Hierarchy comes from the self-lookup `klein_parenttaskid`.
- Task → Project link is `klein_projectid`.
- Never change how dates are read or written. Never change the data schema.
  This fork touches rendering and the control manifest only.

## Build state and the FIRST task
The 2020-era toolchain does not build on Node 17+ without the legacy OpenSSL
flag (`ERR_OSSL_EVP_UNSUPPORTED`). It currently only builds with
`NODE_OPTIONS=--openssl-legacy-provider`.

**First task for this repo: modernize the toolchain so `npm run build`
succeeds on Node 20 WITHOUT that flag.** This includes updating build
tooling and, as part of the same effort, ESLint to v8 and
`@typescript-eslint` to v6+ so the quality gate below can be enabled.
Do it incrementally, smallest steps, verifying the build after each bump,
and explain every version change. If a bump cascades into many breakages,
stop and report before continuing — do not force it.

## Commands
- `npm install` — install dependencies
- `npm run build` — compile the PCF. Must pass (goal: without the OpenSSL flag).
- `npm start` — local PCF test harness (`pcf-scripts start`)
- `npm run lint` — ESLint (to be added during modernization)
- `npm run typecheck` — `tsc --noEmit` (to be added during modernization)
- Any change to `ControlManifest.Input.xml` requires a full rebuild; say so.

## Definition of Done (verified, not claimed)
A task is done only when ALL are true, checked by running the commands:
1. `npm run build` exits 0 (once modernized: without the OpenSSL flag).
2. `npm run lint` exits 0 once lint exists (zero errors).
3. `npm run typecheck` exits 0 once it exists.
4. No new `any`, no `@ts-ignore`, no `eslint-disable` added to force a pass.
   If a rule genuinely must be relaxed, STOP and ask the human.
5. The change is the smallest that solves the problem; no drive-by refactors.
6. A one-paragraph summary states what changed, which files, and why.

"It compiles" is not done. "Build + lint + typecheck pass and I read the
diff" is done.

## Code quality rules (concrete, so they can be checked)
### Single responsibility
- A React component either derives data OR renders — not heavy logic in JSX.
  Put tree/level/hierarchy math in pure functions in their own module
  (e.g. `hierarchy.ts`), unit-testable in isolation.
- No function over ~40 lines or cyclomatic complexity > 10 (lint enforces
  this after modernization). If it trips, split it.

### Type safety
- Strict TypeScript. No `any`; unknown external data is `unknown`, narrowed.
- Every dataset column read is guarded: the column may be missing, null, or
  still loading (`dataset.loading`). Never assume a value is present.
- Public functions have explicit parameter and return types.

### PCF lifecycle correctness
- Respect init / updateView / getOutputs / destroy. Clean up listeners and
  timers in destroy — no leaks.
- updateView fires often; keep it cheap and idempotent. Don't rebuild the
  whole tree on every call if inputs didn't change.
- Handle dataset paging/loading before rendering rows. Don't mutate the
  incoming dataset; derive new structures.

### Error handling
- No empty catch blocks. Failures are surfaced, never swallowed.
- Guard against cycles in the parent chain so recursion always terminates —
  this matters for the hierarchy feature.

## What NOT to do
- Do not add dependencies without saying why; prefer existing deps.
- Do not touch date reading/writing or anything that changes stored values.
- Do not commit secrets, connection strings, or environment files.
- Do not disable lint/type rules to get green. Ask instead.

## Working style
- Read the surrounding code before editing; match the existing style.
- Prefer small, reviewable commits over one large change.
- When unsure about product intent (should grandchildren collapse with the
  parent? which extra columns?), ask rather than guess.
