// One-time Google consent for the test calendar + sheet (and later, per client).
//   node scripts/google-oauth.ts                 → writes GOOGLE_REFRESH_TOKEN into .env.local, and creates the
//                                                  "Nuvadesk test" calendar + "Nuvadesk QA" sheet if TEST_*_ID are empty
//   node scripts/google-oauth.ts --print-json    → prints {"refresh_token": "..."} for a client's *.secrets.json
// Uses a Desktop-app OAuth client (GOOGLE_OAUTH_CLIENT_ID/SECRET in .env.local), the loopback redirect and PKCE.
// Run it yourself in a terminal: the token is written to the file and never printed (unless --print-json).
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { REPO_ROOT } from "../core/src/config/index.ts";
import { loadLocalEnv, mask } from "../core/src/localenv.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/spreadsheets",
  // Lets the dev run create its own throwaway calendar; per-client consent doesn't need it.
  "https://www.googleapis.com/auth/calendar.app.created",
];

loadLocalEnv();
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env.local first (Desktop app OAuth client).");
  process.exit(1);
}
const printJson = process.argv.includes("--print-json");

const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("hex");

const server = createServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const redirectUri = `http://127.0.0.1:${port}`;

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "),
  access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", state,
})}`;

console.log("Opening Google consent in your browser. If it doesn't open, visit:\n\n" + authUrl + "\n");
// Not `cmd /c start`: cmd splits the URL at its first "&".
const opener = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", authUrl]] : process.platform === "darwin" ? ["open", [authUrl]] : ["xdg-open", [authUrl]];
execFile(opener[0] as string, opener[1] as string[], () => {});

const code = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timed out after 10 minutes")), 10 * 60_000);
  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    const got = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || !got) {
      res.writeHead(400).end("Invalid OAuth response. You can close this tab.");
      if (url.searchParams.get("error")) { clearTimeout(timer); reject(new Error(`Google returned: ${url.searchParams.get("error")}`)); }
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" }).end("Nuvadesk: consent received. You can close this tab.");
    clearTimeout(timer);
    resolve(got);
  });
});
server.close();

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
});
const tokens = await tokenRes.json() as { refresh_token?: string; access_token?: string; scope?: string; error?: string; error_description?: string };
if (!tokenRes.ok || !tokens.refresh_token) {
  console.error(`Token exchange failed: ${tokens.error ?? tokenRes.status} ${tokens.error_description ?? ""}`);
  process.exit(1);
}
const missing = SCOPES.filter((s) => !tokens.scope?.split(" ").includes(s));
if (missing.length) console.warn(`Warning: consent did not grant ${missing.join(", ")}`);

const envFile = path.join(REPO_ROOT, ".env.local");
function saveEnv(key: string, value: string): void {
  const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(envFile, re.test(current) ? current.replace(re, () => line) : `${current.trimEnd()}
${line}
`);
}
async function googlePost(url: string, body: unknown): Promise<{ id?: string; spreadsheetId?: string }> {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json() as { id?: string; spreadsheetId?: string };
}

if (printJson) {
  console.log(JSON.stringify({ refresh_token: tokens.refresh_token }));
} else {
  saveEnv("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
  console.log(`Saved GOOGLE_REFRESH_TOKEN (${mask(tokens.refresh_token)}) to .env.local.`);
  if (!process.env.TEST_CALENDAR_ID) {
    const cal = await googlePost("https://www.googleapis.com/calendar/v3/calendars", { summary: "Nuvadesk test", timeZone: "Australia/Sydney" });
    saveEnv("TEST_CALENDAR_ID", cal.id!);
    console.log(`Created calendar "Nuvadesk test" and saved TEST_CALENDAR_ID.`);
  }
  if (!process.env.TEST_SHEET_ID) {
    const sheet = await googlePost("https://sheets.googleapis.com/v4/spreadsheets", { properties: { title: "Nuvadesk QA" } });
    saveEnv("TEST_SHEET_ID", sheet.spreadsheetId!);
    console.log(`Created spreadsheet "Nuvadesk QA" and saved TEST_SHEET_ID.`);
  }
}
console.log("Note: while the OAuth consent screen is in 'Testing', Google expires refresh tokens after 7 days. Publish it (or re-run this) before go-live.");
