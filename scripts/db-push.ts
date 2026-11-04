// Applies supabase/migrations to the hosted Supabase project in .env.local, with the pinned Supabase CLI.
//   node scripts/db-push.ts            → shows pending migrations and applies them
//   node scripts/db-push.ts --dry-run  → only lists what would run
// Needs SUPABASE_DB_URL (the Session pooler URI from Connect, with [YOUR-PASSWORD] left in place) and
// SUPABASE_DB_PASSWORD. The password is URL-encoded here and never printed.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../core/src/config/index.ts";
import { loadLocalEnv } from "../core/src/localenv.ts";

loadLocalEnv();
const template = process.env.SUPABASE_DB_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!template || !password) {
  console.error("Set SUPABASE_DB_URL (Session pooler URI) and SUPABASE_DB_PASSWORD in .env.local first.");
  process.exit(1);
}
const dbUrl = template.includes("[YOUR-PASSWORD]") ? template.replace("[YOUR-PASSWORD]", encodeURIComponent(password)) : template;
const host = new URL(dbUrl).hostname;
const args = ["--yes", "supabase@2.121.0", "db", "push", "--db-url", dbUrl, "--yes"];
if (process.argv.includes("--dry-run")) args.push("--dry-run");

console.log(`Pushing supabase/migrations to ${host}${process.argv.includes("--dry-run") ? " (dry run)" : ""}`);
// Run npx through node itself (no shell), so the URL is passed as one argument and never re-parsed.
const npxCli = [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"), "/usr/lib/node_modules/npm/bin/npx-cli.js"].find((p) => existsSync(p));
const res = npxCli
  ? spawnSync(process.execPath, [npxCli, ...args], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" })
  : spawnSync("npx", args, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
// The CLI can echo the connection string on errors: mask the password in everything we print.
const mask = (s: string) => s.replaceAll(encodeURIComponent(password), "***").replaceAll(password, "***");
process.stdout.write(mask(res.stdout ?? ""));
process.stderr.write(mask(res.stderr ?? ""));
process.exit(res.status ?? 1);
