# Standard: PowerApps Component Framework (PCF)

Platform-specific rules. These encode behaviour that isn't obvious from the
types and that has bitten this project or is likely to.

## Lifecycle
The control lifecycle is `init` → `updateView` (many times) → `getOutputs`
(as needed) → `destroy`. Respect each:
- **`init`**: set up once. Store the notifyOutputChanged callback and container;
  don't do heavy work you'll redo in updateView.
- **`updateView` fires often** — on data change, container resize, any bound
  property change. It must be **cheap and idempotent**. Do not rebuild
  everything unconditionally. Guard expensive work (tree building, metadata
  calls) behind an actual-change check; recomputing an unchanged tree on every
  resize is a real performance bug.
- **`getOutputs`**: return the current output values; keep it pure and fast.
- **`destroy`**: tear down everything init/updateView created — React roots,
  event listeners, timers, subscriptions. Leaks here accumulate across the
  host app's lifetime.

## Dataset access
- A dataset column may be **missing, null, or still loading**. Check
  `dataset.loading` before rendering rows, and guard every `getValue` — never
  assume a column is present or populated. A bound property can be optional in
  the manifest and absent at runtime.
- `getValue(column)` returns a union (`string | number | Date | boolean |
  EntityReference | ...`). Cast to the specific type the column holds, and only
  after you've confirmed the column's `of-type` in the manifest. A wrong cast
  compiles and fails silently at runtime.
- Read `sortedRecordIds` for order; don't rely on object key order of `records`.
- **Never mutate the incoming dataset or its records.** Derive new structures.
  The host owns that object; mutating it causes undefined behaviour.
- Paging: large datasets arrive in pages. If you need all records, handle
  `paging` explicitly; don't assume the first page is everything. (This bit the
  data migration too — the OData feed paged at 300/1000.)

## Lookups and entity references
- `getNamedReference()` returns an `EntityReference` whose entity type is `etn`.
  Runtime objects have sometimes carried `logicalName` instead; code that needs
  the entity name should handle both, and handle **neither being present**
  (currently a known gap — the fallback can be `undefined`, which then reaches
  `updateRecord`/`getEntityMetadata`; fix with a guard in a shared helper).

## Manifest (`ControlManifest.Input.xml`)
- The manifest is the control's contract. Adding a property (e.g. a new
  configurable column) is declared here, and **any manifest change requires a
  full rebuild** and regenerates `ManifestTypes.d.ts` — verify that generated
  file's diff is intentional.
- Match `of-type` / `of-type-group` to how you read the value. A `Whole.None`
  read as a string, or a `Date.All` mishandled for time zones, is a latent bug.
- `usage="input"` vs `bound`, `required` true/false — declare honestly;
  `required="false"` means you must handle its absence in code.
- Before bumping, read the current control version from
  `ControlManifest.Input.xml` and the solution version from `Solution.xml` —
  never assume from memory or a prompt. (A task prompt has given the wrong
  current versions twice.)

## Writing back to Dataverse
- Writes go through `context.webAPI` (`updateRecord`, etc.) and are asynchronous
  and fallible. Always `await` and `try/catch`; on failure, surface it
  (`navigation.openErrorDialog`) and don't leave the UI in a half-updated state.
- After a successful write, `dataset.refresh()` to re-sync; don't hand-patch
  local state to match what you hope the server saved.
- Be deliberate about time zones on date writes. This control applies a
  `crmUserTimeOffset` correction — preserve that maths exactly; date handling
  is explicitly out of scope for presentation changes.

## Performance specifics
- The control runs inside the host app's page; its cost is the user's cost.
  Keep the bundle lean (know what ships), and keep `updateView` off the
  critical path for interactions like resize and scroll.
- Batch DOM/React work; avoid synchronous layout thrash. For large task lists,
  virtualization or capping visible rows beats rendering thousands of nodes.
- Metadata and Web API calls are network round-trips — cache within a session
  (as the colour theme does), and never call them in a tight loop over records.

## Testing PCF logic
- The PCF glue (init/updateView/destroy, dataset objects) is awkward to unit
  test; the pure logic it drives is not. Extract decision logic (hierarchy,
  mapping, type resolution) into pure modules and test those directly. Keep the
  glue thin enough to verify by reading and by the local harness (`npm start`).
