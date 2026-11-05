// Screenshots of the dashboard or site from a running server, with the installed Chrome (no browser
// download). Light and dark (dashboard), desktop and mobile. Output: qa/screenshots/<app>/ (gitignored).
//   node scripts/screenshots.ts site                       (expects `npm run start -w site` on :3001)
//   node scripts/screenshots.ts dashboard --login <url>    (a one-time link from scripts/dev-login.ts)
//   options: --base <url>  --only <name,...>  --chrome <path to chrome.exe>
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright-core";
import { REPO_ROOT } from "../core/src/config/index.ts";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { base: { type: "string" }, login: { type: "string" }, only: { type: "string" }, chrome: { type: "string" }, slug: { type: "string" } },
});
const app = positionals[0];
if (app !== "site" && app !== "dashboard") {
  console.error("usage: node scripts/screenshots.ts site|dashboard [--login <url>] [--base <url>] [--only a,b]");
  process.exit(1);
}

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

const base = (opt.base ?? (app === "site" ? "http://localhost:3001" : "http://localhost:3000")).replace(/\/$/, "");
const slug = opt.slug ?? "demo-clinic";
// `act` drives the page first (clicks, typing); `element` screenshots one element instead of the page.
type Shot = { name: string; path: string; full?: boolean; act?: (page: Page) => Promise<void>; element?: string };
const PAGES: Record<string, Shot[]> = {
  site: [
    { name: "home", path: "/", full: true },
    { name: "packages", path: "/packages", full: true },
    { name: "package-receptionist", path: "/packages/receptionist", full: true },
    { name: "for-dental", path: "/for/dental", full: true },
    { name: "for-dental-us", path: "/en-us/for/dental" },
    { name: "case-study", path: "/case-studies" },
    { name: "contact", path: "/contact" },
    { name: "blog", path: "/blog" },
    { name: "blog-post", path: "/blog/missed-calls-dental-clinic", full: true },
    {
      name: "demo-chat", path: "/", element: "section[aria-labelledby=demo]",
      act: async (page) => {
        await page.getByRole("button", { name: "How much is a check-up?" }).click();
        await page.waitForTimeout(1600);
        await page.getByRole("button", { name: "Book me in tomorrow" }).click();
        await page.waitForTimeout(1600);
        await page.getByRole("button", { name: "8:15am" }).click();
        await page.waitForTimeout(1600);
      },
    },
    {
      name: "calculator", path: "/", element: "section[aria-labelledby=calculator]",
      act: async (page) => {
        await page.getByRole("spinbutton", { name: /miss in a week, exact value/ }).fill("14");
        await page.waitForTimeout(500);
      },
    },
  ],
  dashboard: [
    { name: "login", path: "/login" },
    { name: "overview", path: `/c/${slug}`, full: true },
    { name: "overview-7d", path: `/c/${slug}?range=7d` },
    { name: "conversations", path: `/c/${slug}/conversations` },
    { name: "search", path: `/c/${slug}/conversations?q=parking` },
    { name: "search-empty", path: `/c/${slug}/conversations?q=zzzzzz` },
    { name: "approvals", path: "/c/demo-physio/approvals", full: true },
    { name: "billing", path: `/c/${slug}/billing` },
    { name: "help", path: `/c/${slug}/help` },
    { name: "agency", path: "/agency" },
  ],
};
const only = opt.only?.split(",");
const pages = PAGES[app]!.filter((p) => !only || only.includes(p.name));
const out = path.join(REPO_ROOT, "qa/screenshots", app);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const viewports = [{ tag: "desktop", width: 1440, height: 900, mobile: false }, { tag: "mobile", width: 390, height: 844, mobile: true }];
const schemes = app === "dashboard" ? (["light", "dark"] as const) : (["light"] as const);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(app === "site" ? 3200 : 900);   // let the hero / count-up finish
}

// The sign-in link works once: sign in a single time and reuse the session cookies everywhere.
let storageState: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>["storageState"]>> | undefined;
if (app === "dashboard" && opt.login) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(opt.login);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 20_000 });
  if (new URL(page.url()).pathname === "/login") throw new Error("Sign-in link rejected (expired or already used): make a new one with scripts/dev-login.ts");
  storageState = await context.storageState();
  await context.close();
}

for (const scheme of schemes) {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: scheme, deviceScaleFactor: 1, storageState });
    const page = await context.newPage();
    for (const p of pages) {
      if (app === "dashboard" && !storageState && p.name !== "login") continue;
      const res = await page.goto(`${base}${p.path}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      if (p.act) await p.act(page);
      const file = path.join(out, `${p.name}.${vp.tag}${schemes.length > 1 ? `.${scheme}` : ""}.png`);
      if (p.element) await page.locator(p.element).screenshot({ path: file });
      else await page.screenshot({ path: file, fullPage: Boolean(p.full) });
      console.log(`${res?.status() ?? "?"}  ${path.relative(REPO_ROOT, file)}`);
    }
    await context.close();
  }
}
await browser.close();
