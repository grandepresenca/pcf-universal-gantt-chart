// cli.ts — offline entry point. Reads the two extract files, runs the
// analysis, writes a Markdown report and the full JSON result. Never touches
// the network: the extracts were taken in the browser (snippets/).
//
// Usage: node dist/tools/migration-validation/src/cli.js --dv <file> --pwa <file> [--out <dir>] [--limit <n>]

import * as fs from "fs";
import * as path from "path";
import { analyse } from "./analysis";
import { parseDataverseExtract, parsePwaExtract } from "./extracts";
import { renderReport } from "./report";

interface Args {
  dv: string;
  pwa: string;
  out: string;
  limit: number;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dv = get("--dv");
  const pwa = get("--pwa");
  if (dv === undefined || pwa === undefined) {
    throw new Error("Usage: --dv <dataverse-tasks.json> --pwa <pwa-tasks.json> [--out <dir>] [--limit <n>]");
  }
  const limit = Number(get("--limit") ?? "50");
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return { dv, pwa, out: get("--out") ?? "reports", limit };
}

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dataverse = parseDataverseExtract(readJson(args.dv));
  const pwa = parsePwaExtract(readJson(args.pwa));
  const result = analyse(dataverse.rows, pwa.rows, args.limit);
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, "-");
  fs.mkdirSync(args.out, { recursive: true });
  const md = path.join(args.out, `validation-${stamp}.md`);
  const json = path.join(args.out, `validation-${stamp}.json`);
  fs.writeFileSync(md, renderReport(result, { generatedAt, pwa: pwa.header, dataverse: dataverse.header }));
  fs.writeFileSync(json, JSON.stringify({ generatedAt, pwa: pwa.header, dataverse: dataverse.header, result }, null, 2));
  const v = result.parents.verdicts;
  console.log(`Joined ${result.totals.joined} tasks. Parents: ${v.agree} agree, ${result.totals.joined - v.agree} differ.`);
  console.log(`Missing in Dataverse: ${result.missingInDv.count}. Not in PWA: ${result.extraInDv.count}.`);
  console.log(`Projects with differences: ${result.projects.withDifferences.length} of ${result.projects.all.length}.`);
  console.log(`Report: ${md}\nJSON:   ${json}`);
}

try {
  main();
} catch (e) {
  console.error(`Validation failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
