// Lighthouse (mobile preset) against the built site, with the installed Chrome and the pinned CLI.
// Each page runs --runs times (default 3) and the median score per category counts, as Lighthouse
// recommends: a single local run swings by 10+ performance points. Runs go round-robin across pages so a
// burst of load on this machine doesn't land on one page, and a run is retried when Lighthouse's own host
// benchmark (benchmarkIndex) is under 1000, its "slow host" level, where the 4x CPU throttle overstates
// blocking time; a run that errors is retried too. Reports (the last run per page) go to qa/lighthouse/ (gitignored); exits 1 if any
// median is under the target.
//   npm run build -w site && npm run start -w site      (in another terminal)
//   node scripts/lighthouse.ts [--base http://localhost:3001] [--min 95] [--runs 3] [--only home,package]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "../core/src/config/index.ts";

const { values: opt } = parseArgs({ options: { base: { type: "string" }, min: { type: "string" }, runs: { type: "string" }, only: { type: "string" }, chrome: { type: "string" } } });
const base = (opt.base ?? "http://localhost:3001").replace(/\/$/, "");
const min = Number(opt.min ?? 95);
const runs = Math.max(1, Number(opt.runs ?? 3));
const PAGES = [
  { name: "home", path: "/" },
  { name: "package", path: "/packages/receptionist" },
  { name: "vertical", path: "/for/dental" },
  { name: "blog-post", path: "/blog/missed-calls-dental-clinic" },
].filter((p) => !opt.only || opt.only.split(",").includes(p.name));
const CHROME = opt.chrome ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
if (!CHROME) {
  console.error("Chrome not found; pass --chrome <path>.");
  process.exit(1);
}

const out = path.join(REPO_ROOT, "qa/lighthouse");
mkdirSync(out, { recursive: true });
const npxCli = [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"), "/usr/lib/node_modules/npm/bin/npx-cli.js"].find((p) => existsSync(p));
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

type Report = { categories: Record<string, { score: number | null }>; environment: { benchmarkIndex: number } };
const SLOW_HOST = 1000;
const env = { ...process.env, CHROME_PATH: CHROME };

function runOnce(page: (typeof PAGES)[number]): Report | null {
  const file = path.join(out, page.name);
  const args = ["--yes", "lighthouse@13.6.0", `${base}${page.path}`, "--quiet", "--output=json", "--output=html", `--output-path=${file}`,
    `--only-categories=${CATEGORIES.join(",")}`, "--chrome-flags=--headless=new"];
  const res = npxCli
    ? spawnSync(process.execPath, [npxCli, ...args], { cwd: REPO_ROOT, env, stdio: ["ignore", "ignore", "inherit"] })
    : spawnSync("npx", args, { cwd: REPO_ROOT, env, stdio: ["ignore", "ignore", "inherit"] });
  return res.status === 0 ? (JSON.parse(readFileSync(`${file}.report.json`, "utf8")) as Report) : null;
}

const results = new Map<string, number[][]>(PAGES.map((p) => [p.name, []]));
let slowRuns = 0;
for (let round = 0; round < runs; round++) {
  for (const page of PAGES) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const report = runOnce(page);
      const last = attempt === 2;
      if (!report) {
        if (last) break;
        continue;   // e.g. NO_FCP when headless Chrome is starved; try again
      }
      if (report.environment.benchmarkIndex < SLOW_HOST && !last) {
        slowRuns++;
        continue;
      }
      results.get(page.name)!.push(CATEGORIES.map((c) => Math.round((report.categories[c]?.score ?? 0) * 100)));
      break;
    }
  }
}

let failed = false;
for (const page of PAGES) {
  const perRun = results.get(page.name)!;
  if (perRun.length < runs) {
    console.error(`lighthouse failed on ${page.path}`);
    failed = true;
    continue;
  }
  const scores = CATEGORIES.map((_, i) => median(perRun.map((r) => r[i]!)));
  const low = scores.some((s) => s < min);
  failed ||= low;
  const spread = runs > 1 ? `  (performance runs: ${perRun.map((r) => r[0]).join(", ")})` : "";
  console.log(`${low ? "LOW " : "ok  "} ${page.path.padEnd(34)} ${CATEGORIES.map((c, i) => `${c} ${scores[i]}`).join("  ")}${spread}`);
}
console.log(`Medians of ${runs} run(s)${slowRuns ? `; ${slowRuns} run(s) retried because the machine was busy (benchmarkIndex < ${SLOW_HOST})` : ""}. Reports: ${path.relative(REPO_ROOT, out)}/`);
process.exit(failed ? 1 : 0);
