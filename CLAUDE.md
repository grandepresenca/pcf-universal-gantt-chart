# pcf-universal-gantt-chart — King Ranch fork

## What this repo is
A PowerApps Component Framework (PCF) control rendering an interactive Gantt
chart over a Dataverse dataset. TypeScript + React 17, wrapping
`gantt-task-react`. Built with `pcf-scripts` (Webpack 5).

## Why this fork exists
Two presentation-only customizations for the King Ranch project (Project
Online → Dataverse migration) — no data-model or date-logic changes:
1. **Recursive nested hierarchy** — indent tasks by Parent Record to N levels.
2. **Extra columns** in the left list grid, configurable, beyond Title/Start/End.

## Key source files
- `UniversalGanttChartComponent/index.ts` — PCF entry (init/updateView/
  getOutputs/destroy); reads the dataset, maps it to the Gantt.
- `.../components/universal-gantt.tsx` — assembles the chart; hierarchy/task
  assembly; the save handlers (updateRecord).
- `.../components/task-list-table.tsx` / `task-list-header.tsx` — the LEFT
  grid rows/header. Extra columns and indentation land here.
- `.../components/view-switcher.tsx`, `gantt-tooltip.tsx`, `helper.ts` — support.
- `.../ControlManifest.Input.xml` — PCF properties. New configurable inputs
  are declared here; changing it requires a full rebuild.

## Data assumptions — do not break
- Target table is the native `task` activity. Primary name = `subject`.
- Dates come from `scheduledstart` / `scheduledend` (User Local behaviour).
- Hierarchy is the self-lookup `klein_parenttaskid`; Task→Project is `klein_projectid`.
- Never change how dates are read/written. Never change the schema. This fork
  touches rendering and the manifest only.

## Commands
- `npm ci` / `npm install` — dependencies
- `npm run build` — compile (must pass WITHOUT `--openssl-legacy-provider`)
- `npm run lint` — ESLint (0 errors required)
- `npm run typecheck` — `tsc --noEmit` (0 errors required)
- `npm test` — Jest (all pass required)
- `npm start` — local PCF harness (manual visual check)

## Engineering knowledge — consult before planning
Standards and past decisions live in `.engineering/`. Before planning any
change, read what's relevant:
- `.engineering/standards/software-engineering.md` — general craft
- `.engineering/standards/typescript.md` — TypeScript rules
- `.engineering/standards/react.md` — React/component rules
- `.engineering/standards/pcf.md` — PCF lifecycle, dataset, performance
- `.engineering/decisions/` — Architecture Decision Records (ADRs): why
  things are the way they are. Read the relevant ADR before changing an area
  it covers; if you would contradict an ADR, STOP and raise it.

## How to work in this repo

### Risk-adaptive workflow
Match rigor to blast radius. Classify the change first:

- **Low risk** — mechanical, reversible, no logic change (rename, remove dead
  code, formatting, a typed annotation that changes no behaviour). Just make
  it, then run build + lint + typecheck + test.
- **High risk** — anything touching: the dataset read path, dates, the
  manifest, the parent/hierarchy logic, save/updateRecord, or public types.
  Before editing, state in one short block: current behaviour, desired
  behaviour, files involved, risks, and the smallest change that works.
  Get agreement before large edits. Add/extend tests for the logic.

When unsure which bucket, treat it as high risk.

### Evidence before assumption
- Verify against the code, the compiler, or a quick check before asserting.
  "I read X and it does Y" beats "X probably does Y". You have already caught
  real bugs this way (a missing null-guard, a rendering side-effect) — keep doing it.
- Existing code is context, not proof of correctness. It may already contain
  bugs (this repo shipped `debugger` statements). Don't preserve a behaviour
  just because it's there; understand it, then decide.
- Never fix what you don't understand. If the cause isn't clear, investigate
  or ask — do not apply a change hoping it works.
- "Verified in the deploy" and "merged to master" are separate gates. Before
  relying on one branch containing another's work (rebasing onto it, calling
  a precondition closed), check the merge in git (`git fetch`, then
  `git merge-base --is-ancestor`, or the PR state). A feature was once called
  merged because it had been validated in the deploy; git showed it wasn't.

### Definition of Done — verified, not claimed
A task is done only when, checked by running the commands:
1. The requirement is actually satisfied.
2. `npm run build` exits 0 (no OpenSSL flag).
3. `npm run lint` exits 0.
4. `npm run typecheck` exits 0.
5. `npm test` passes; new/changed logic has tests.
6. The diff was read; it contains only what the task needs (no drive-by edits).
7. No `any`, `@ts-ignore`, or `eslint-disable` added to force a pass. If a rule
   genuinely must be relaxed, STOP and ask.
8. Regression, security, and performance implications were considered
   (see the standards); anything notable is stated.
9. A one-paragraph summary: what changed, which files, why.

"It compiles" is not done.

### Knowledge capture
If a task revealed something reusable — a non-obvious platform behaviour, a
recurring pattern, a decision worth recording — say so at the end and propose
where it belongs (a standard, or a new ADR). Do NOT create these unprompted;
suggest, and let the human decide. Not every fix is a lesson.

## What NOT to do
- Don't add dependencies without saying why; prefer existing ones.
- Don't touch date reading/writing or anything that changes stored values.
- Don't commit secrets, connection strings, or environment files.
- Don't disable lint/type rules to get green. Ask instead.
