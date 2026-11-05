// Flags requirements outside a client's packages, so they're priced as change requests (spec §12 Prompt 6).
//   node scripts/scope-check.ts config/clients/<id>.json requirements.txt
//   node scripts/scope-check.ts --packages A,B requirements.txt          (before there's a client.json)
// requirements.txt: one requirement per line, in the clinic's words; blank lines and # comments are ignored.
// Prices come from the website's package list (site/src/content/packages.ts), the one place prices live.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readClientConfigFile } from "../core/src/config/index.ts";
import { PACKAGE_NAMES, checkScope, type PackageLetter } from "../core/src/scope.ts";
import { PACKAGES } from "../site/src/content/packages.ts";

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: { packages: { type: "string" } } });
const [first, second] = positionals;
const reqFile = opt.packages ? first : second;
if (!reqFile || (!opt.packages && !first)) {
  console.error("usage: node scripts/scope-check.ts <client.json> <requirements.txt>   or   --packages A,B <requirements.txt>");
  process.exit(2);
}
const owned = opt.packages ? opt.packages.split(",").map((p) => p.trim().toUpperCase()) : (readClientConfigFile(path.resolve(first!)).packages as string[]);
const who = opt.packages ? `Packages ${owned.join(" + ")}` : `${path.basename(first!)} (Packages ${owned.join(" + ")})`;
const price = (pkg: PackageLetter) => PACKAGES.find((p) => p.letter === pkg);

const lines = readFileSync(path.resolve(reqFile), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const flagged: string[] = [];
console.log(`Scope check for ${who}: ${lines.length} requirement(s)\n`);
for (const line of lines) {
  const v = checkScope(line, owned);
  let label: string;
  if (v.kind === "included") label = `\x1b[32min scope\x1b[0m       Package ${v.pkg} (${PACKAGE_NAMES[v.pkg]}): ${v.why}`;
  else if (v.kind === "needs_package") {
    const p = price(v.pkg);
    label = `\x1b[33mneeds Package ${v.pkg}\x1b[0m ${PACKAGE_NAMES[v.pkg]}, USD ${p?.price.toLocaleString("en-US")} setup: ${v.why}`;
  } else if (v.kind === "add_on") {
    const addOn = price(v.pkg)?.addOns?.[0];
    label = `\x1b[33madd-on\x1b[0m          ${v.addOn} (${addOn?.price ?? "see price list"}): ${v.why}`;
  } else if (v.kind === "never") label = `\x1b[31mnever included\x1b[0m  ${v.why}: say no politely, or refer it on`;
  else label = `\x1b[31mchange request\x1b[0m  ${v.why}. Quote at USD 90/hour (spec §3), or say no`;
  if (v.kind !== "included") flagged.push(line);
  console.log(`- ${line}\n    ${label}`);
}
console.log(`\n${lines.length - flagged.length} in scope, ${flagged.length} to price or decline before the proposal goes out.`);
