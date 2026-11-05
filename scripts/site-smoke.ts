// Smoke test of the built website (spec Prompt 5 SEO): robots.txt, sitemap.xml, every expected page
// present in the sitemap and answering 200, one <h1>, a title, a canonical, hreflang alternates, and
// JSON-LD that parses. Runs against `npm run start -w site`; CI runs it from validate.sh.
//   node scripts/site-smoke.ts [--base http://localhost:3001]
import { readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "../core/src/config/index.ts";
import { LOCALES, localePath } from "../site/src/content/locales.ts";
import { PACKAGES } from "../site/src/content/packages.ts";
import { VERTICALS } from "../site/src/content/verticals.ts";

const { values: opt } = parseArgs({ options: { base: { type: "string" } } });
const base = (opt.base ?? "http://localhost:3001").replace(/\/$/, "");

const LOCALISED = ["/", "/packages", ...PACKAGES.map((p) => `/packages/${p.slug}`), ...VERTICALS.map((v) => `/for/${v.slug}`),
  "/case-studies", "/about", "/contact", "/privacy"];
const POSTS = readdirSync(path.join(REPO_ROOT, "site/src/content/blog")).filter((f) => f.endsWith(".mdx")).map((f) => `/blog/${f.slice(0, -4)}`);
const EXPECTED = [...LOCALISED.flatMap((p) => LOCALES.map((l) => localePath(l, p))), "/blog", ...POSTS];

const problems: string[] = [];
const check = (ok: unknown, msg: string) => { if (!ok) problems.push(msg); };
const get = (p: string) => fetch(`${base}${p}`, { redirect: "manual" });

const robots = await get("/robots.txt");
const robotsText = await robots.text();
check(robots.status === 200, `robots.txt: HTTP ${robots.status}`);
check(/^Sitemap: \S+\/sitemap\.xml$/m.test(robotsText), "robots.txt: no Sitemap line");
check(!/^Disallow: \/\s*$/m.test(robotsText), "robots.txt: disallows the whole site");

const sitemap = await get("/sitemap.xml");
const xml = await sitemap.text();
check(sitemap.status === 200, `sitemap.xml: HTTP ${sitemap.status}`);
// Sitemap URLs carry NEXT_PUBLIC_SITE_URL; compare paths only.
const listed = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname));
for (const p of EXPECTED) check(listed.has(p), `sitemap.xml: missing ${p}`);
for (const p of listed) check(EXPECTED.includes(p), `sitemap.xml: unexpected ${p}`);

for (const p of EXPECTED) {
  const res = await get(p);
  if (res.status !== 200) {
    problems.push(`${p}: HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  check((html.match(/<h1[\s>]/g) ?? []).length === 1, `${p}: expected exactly one <h1>`);
  check(/<title>[^<]{10,}<\/title>/.test(html), `${p}: missing or short <title>`);
  check(/<meta name="description" content="[^"]{50,}"/.test(html), `${p}: missing or short meta description`);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  check(canonical && new URL(canonical).pathname === p, `${p}: canonical is ${canonical ?? "missing"}`);
  if (!p.startsWith("/blog")) {
    for (const lang of ["en-AU", "en-GB", "en-US", "x-default"]) check(html.includes(`hrefLang="${lang}"`), `${p}: no hreflang ${lang}`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]!) as { "@context"?: string };
      check(data["@context"] === "https://schema.org", `${p}: JSON-LD without schema.org @context`);
    } catch {
      problems.push(`${p}: JSON-LD does not parse`);
    }
  }
}
// Each page has one URL: the AU prefix redirects to the clean path, and unknown pages are 404s.
const prefixed = await get("/en-au/packages");
check(prefixed.status === 308 && prefixed.headers.get("location")?.endsWith("/packages"), `/en-au/packages: expected 308 to /packages, got ${prefixed.status}`);
check((await get("/no-such-page")).status === 404, "/no-such-page: expected 404");

if (problems.length) {
  console.error(`site smoke: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`site smoke: ok (${EXPECTED.length} pages, robots, sitemap, canonicals, hreflang, JSON-LD)`);
