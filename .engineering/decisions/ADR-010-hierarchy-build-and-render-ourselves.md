# ADR-010: Build and render the task hierarchy ourselves; client-side collapse

- **Status:** Accepted
- **Date:** 2026-10-01 (decisions approved); recorded 2026-10-02
- **Deciders:** Yuri Porto
- **Context area:** pcf

## Context
Fork customization #1 (ADR-007) is to show the WBS nested to any depth by the
self-lookup `klein_parenttaskid` (ADR-001), like Project Online's outline.

What the control did before this work:
- `generateTasks` made one pass over `dataset.sortedRecordIds` and looked up a
  record's parent one level only.
- A parent of type "project" set `task.project` (library grouping and
  collapse). Any other parent set `task.dependencies = [parent]`, which draws
  a finish-to-start **arrow**, not nesting.
- So Task1 → Task2 → Task3 rendered as flat rows joined by arrows, in the
  view's sort order.
- Every expander click stored state in `index.ts` and called
  `dataset.refresh()`, a full server reload.

Facts about `gantt-task-react` 0.3.7 (`dist/index.js`) that constrain the
design:
1. **It never sorts.** There is no `sort(` in the bundle. Rows and bars come
   out in the order of the `tasks` array passed in.
2. **Collapse only works for `type === "project"`.** `convertToBarTask` forces
   `hideChildren` to `undefined` on every other row (line 1030), and the
   library's expander handler ignores rows where it is `undefined` (2413). A
   parent of type "task" can never be collapsed through the library.
3. **Hidden rows are removed only when `onExpanderClick` is passed** (2191).
   Removal calls `getChildren` (1354). It follows `project` links for projects
   and `dependencies` links otherwise, recurses with **no visited set**, and
   duplicates its results at every level (`children.concat(children, …)`).
   A parent cycle reached through dependencies hangs the browser.
4. `project` and `dependencies` are used only for grouping and arrows.

Data facts:
- The data model has no real predecessor links, so no true dependency arrows
  exist to lose.
- Outline depth in the source data is unknown; Project Online WBS is usually
  five levels or fewer.
- Whether the first data page covers a whole project depends on volume and on
  where the Gantt is hosted (see Consequences: step 0).

## Decision
**Build the tree ourselves, in pure code, and render it ourselves. The library
only draws bars for the rows we give it, in the order we give them.**

1. **Tree building is pure and iterative** (`hierarchy.ts`):
   - `orderByHierarchy` returns parent-before-children depth-first order with
     depths. Orphans become roots. It is cycle-safe and has no recursion.
   - `buildRows` adds `hasChildren`, and `visibleRows` handles collapse.
   - `findCycleIds` reports the tasks that sit on a parent cycle.
2. **Parent matching** (commit b905249):
   - `readParentId` is strict: only a real lookup shape counts. A plain string
     value is "no parent", never a crash.
   - `normalizeId` (trim, strip one pair of `{}`, lower-case) is applied to
     both sides. `Task.id` and every id handed to the Gantt keep the original
     record id, so `updateRecord`, selection and `openDatasetItem` are
     unaffected.
   - Parents are matched only among `dataset.sortedRecordIds`, the records the
     view renders, and the first one wins.
3. **D1: no parent → dependency arrows.** Indentation expresses the parent
   relationship. An arrow would wrongly imply a finish-to-start dependency,
   and it feeds the cycle-prone `getChildren`.
4. **D2: project grouping is replaced by the general tree.**
   - We no longer set `project` or `hideChildren`, and we no longer pass
     `onExpanderClick`, so the library's `removeHiddenTasks`/`getChildren`
     never runs.
   - Project-type tasks still draw project bars, because that comes from
     `type`. Their children nest under them like under any other parent.
5. **D3: siblings are ordered by start date at every level, roots included.
   The view's order only breaks ties.**
   - This is a separate stable `sortByStart` step before `orderByHierarchy`,
     whose contract (siblings keep input order) is unchanged.
   - It is in-memory only: the view still decides which records arrive.
     Invalid dates sort last.
6. **Client-side collapse.**
   - `UniversalGantt` holds the collapsed ids (`ReadonlySet<string>`), and
     `visibleRows` drops a collapsed node's whole subtree in one O(n) pass.
     `<Gantt>` receives only the visible tasks.
   - The state survives `updateView` and the extra-columns `<Gantt key>`
     remount, and lasts as long as the control instance. Everything starts
     expanded.
   - The server refresh on toggle, `_projects` and `handleExpanderStateChange`
     are removed.
7. **Indentation and expander in our list** (`NameCell`, through a
   `HierarchyContext`; not through `task.hideChildren`, which the library
   blanks per fact 2):
   - The indentation is a spacer `<span>` of 16px per level. It is not cell
     padding (`react.md`).
   - It is capped at half the name cell, or at 128px when List Cell Width is
     not a px value.
   - The expander shows ▼ or ▶ on any row with loaded children, whatever its
     type. A click toggles our state and does not select the row.
8. **Cycles are a data error, logged once:**
   - one `console.warn` per control instance, listing up to 10 ids;
   - no on-screen notice;
   - each task on a cycle is still shown exactly once.
9. **Paging: show a notice now; add `loadNextPage` only if the data demands
   it.**
   - The control reads one page (`setPageSize(5000)`).
   - When `paging.hasNextPage` is true, show "more were not loaded; narrow the
     view".
   - A child whose parent was not loaded renders as a root and never crashes.

## Alternatives considered
- **B. Extend the library's grouping** (set `project` for any parent).
  - It still needs our own ordering, because the library does not nest
    (fact 1).
  - It cannot collapse non-project parents (fact 2).
  - It keeps the cycle hang in `getChildren` (fact 3).
  - Rejected.
- **C. Hybrid:** our ordering and indentation, the library's collapse. It
  inherits both of B's defects. Rejected.
- **Keep the server refresh on toggle.** It costs a network round-trip per
  click, resets scroll and selection, and its only benefit is fresh data as a
  side effect; the grid's own Refresh already provides that. Rejected.
- **Keep the view order and skip D3** (or offer a manifest switch). The
  requirement is "like Project": siblings by start. A switch is a manifest
  change nobody has asked for. Rejected for now.
- **Load every page (`loadNextPage` until done) now.**
  - How hosts accumulate records is unconfirmed.
  - Each page triggers a full `updateView`.
  - A table-wide view could pull tens of thousands of rows into the browser.
  - Deferred until the volume check says it is needed.
- **Accept raw strings as parent ids** so the PCF test harness can show a
  tree. That would put code in production that exists only for testing.
  Rejected: the harness shows flat rows, and the tree is verified on deploy.

## Consequences
**What this makes easy:**
- Arbitrary depth, collapse on any parent type, and cycles are all handled.
- The hard logic is pure and unit-tested:
  - contract tests, plus mutation checks on every helper;
  - `buildHierarchy`, `indentPx` and `expanderSymbol` are tested too.
- Toggling needs no network.

**What it costs:**
- No dependency arrows at all (D1). If real predecessor links ever enter the
  data model, they need their own mapping.
- Row order changes from the view's sort to tree order by start date (D3).
  Users who sorted the view another way will notice.
- Collapse state lasts as long as the control instance; a page reload
  re-expands everything (as before).
- The ordering is recomputed on every `updateView` (O(n log n)). The existing
  "rebuild only on actual change" debt in `updateView` (`pcf.md`) is not
  addressed here.
- The tree's visual behaviour (indentation, collapse, scroll and selection
  across a toggle) can only be verified on deploy. The harness cannot supply
  real lookups.

**Required at deploy:**
- **Display Mode = Read Only** on kingranch-dev. In Editable mode, a click
  that moves the pointer slightly ends a drag and writes the dates through
  `updateRecord`.

**Follow-ups and preconditions:**
- **Step 0:** a read-only data check before rendering lands: task count per
  project and in total, which surface hosts the Gantt, and whether lookup
  guids and record ids match after normalization. A flat tree on deploy means
  an id-format mismatch, not a tree-logic bug.
- **Extra-columns:** deploy-verify and merge it to master before the
  rendering commits are rebased onto it.
- **Implementation order on `feature/hierarchy`:**
  - landed: commits 1–4 and 5a (pure render helpers);
  - 5b: render ordered, indented rows; D1–D3;
  - 5c: client-side collapse;
  - 6: paging notice;
  - 7: control version bump.

**Revisit if:**
- the volume check shows projects span more than one page (then implement
  `loadNextPage`);
- real dependency links enter the data model;
- users need the view's order back (then add a manifest switch);
- `gantt-task-react` is upgraded (re-verify facts 1–4).
