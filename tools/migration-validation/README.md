# Migration validator: PWA vs Dataverse (read-only)

Checks the Project Online → Dataverse task migration. It has two parts:

1. **Extract in the browser.** Two snippets run in each system's own signed-in tab and
   download one JSON file each. They use **GET requests only**, so nothing is written
   to either system and no app registration is needed.
2. **Analyse offline with Node.** The CLI reads the two files and writes a Markdown
   report plus the full JSON result. It makes no network calls at all.

Join key (confirmed on real data): **PWA `TaskId` = Dataverse `klein_legacyid`**.
Both sides are normalized, so case and braces don't matter.

## 1. Extract (browser)

Sign in as a user who can **read every task**: a Dataverse role with read on all tasks,
and in PWA, access to every project in reporting (ProjectData). Otherwise the extract
is silently partial.

**Dataverse:** open any page of the org (`https://<org>.crm.dynamics.com/...`), press
F12, open the Console, paste the contents of `snippets/dataverse-extract.js`, and press
Enter. The console shows progress page by page, and then `dataverse-tasks.json` downloads.

**PWA:** open the PWA site (`https://<tenant>.sharepoint.com/teams/kingranch/...`),
then do the same with `snippets/pwa-extract.js`. That downloads `pwa-tasks.json`.

Both snippets follow paging to the end, retry throttled requests (429/503), and write
a header with the source, URL, time and row count. If one fails, it says
`extract FAILED` and writes no file.

Chrome may ask you to type `allow pasting` before it accepts a pasted snippet. Only
paste these reviewed files.

## 2. Analyse (offline)

From the repo root, on any machine with Node 20:

```bash
npm ci
npm run validator:build
mkdir -p tools/migration-validation/extracts      # git-ignored: customer data
# move the two downloaded files into that folder, then:
npm run validator -- \
  --dv  tools/migration-validation/extracts/dataverse-tasks.json \
  --pwa tools/migration-validation/extracts/pwa-tasks.json \
  --out tools/migration-validation/reports         # git-ignored
# optional: --limit 100   (examples per finding; counts are always complete)
```

The CLI refuses swapped files, truncated files (row count differs from the header)
and rows without their key.

## 3. What the report contains

**Comparison basis (stated in the report):** the level-0 project summary task is
**excluded on both sides**. In PWA that's `TaskIsProjectSummary = true` or
`TaskOutlineLevel = 0`; in Dataverse it's `klein_outlinelevel = 0`. Whether a project
has its level-0 row is shown in separate columns, so it never shows up as a +1. A
parent that *is* the level-0 row counts as "no parent" everywhere.

1. **Parents, three-way check:** the PWA source parent (`ParentTaskId`) vs the Dataverse
   lookup (`klein_parenttaskid`) vs the parent derived from the WBS (`wbs.ts`), for every
   task found in both systems.
   - **Dataverse differs (PWA = WBS):** the lookup is wrong in Dataverse; a migration issue.
   - **WBS differs:** the WBS code doesn't match the hierarchy.
   - **PWA differs:** the source's own parent disagrees with its WBS.
   - **All differ:** inspect individually.
   - The report also shows the three pairwise agreement counts.
2. **Dataverse internal checks:**
   - orphans (outline level above 1 with no parent);
   - parent lookups that point outside the extract;
   - duplicate `klein_legacyid`;
   - unusable, duplicate and gap WBS codes;
   - `klein_outlinelevel` that doesn't match the WBS depth;
   - `klein_wbs` that differs from PWA's `TaskWBS`.
3. **Per-project counts** (level 0 excluded), for projects that differ only:
   - PWA count, Dataverse count, and the difference;
   - tasks missing in Dataverse, and extra tasks in Dataverse;
   - inactive PWA tasks;
   - level-0 present on each side.

   It also lists Dataverse projects with no PWA match, and Dataverse projects whose
   tasks come from more than one PWA project.
4. **Unmatched tasks:** every task in PWA but not in Dataverse, and the reverse.

Expected on the King Ranch data:
- **The Active Projects view is flat by design.** This report is about tasks, not projects.
- **The Project form subgrid** is where the nesting should match.

## Troubleshooting

- **Many "missing" tasks on one side? Suspect permissions first, not the migration.**
  If the signed-in account can't see every task (Dataverse) or every project (PWA
  reporting), that extract is silently partial. Check the header row counts against
  what you expect, then re-extract with an account that can read everything.
- **The PWA snippet keeps getting throttled.** After 5 retries it stops and writes no
  file, so a partial extract can't be mistaken for a complete one. Wait and re-run. A
  one-query-per-project mode isn't built yet; it will be added only if throttling
  actually blocks the extract.
