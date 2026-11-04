// One-time Google consent for the test calendar + sheet (and later, per client).
//   node scripts/google-oauth.ts                 → writes GOOGLE_REFRESH_TOKEN into .env.local
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
const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", authUrl]] : process.platform === "darwin" ? ["open", [authUrl]] : ["xdg-open", [authUrl]];
execFile(opener[0] as string, opener[1] as string[], () => {});

const code = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timed out after 5 minutes")), 5 * 60_000);
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
const tokens = await tokenRes.json() as { refresh_token?: string; scope?: string; error?: string; error_description?: string };
if (!tokenRes.ok || !tokens.refresh_token) {
  console.error(`Token exchange failed: ${tokens.error ?? tokenRes.status} ${tokens.error_description ?? ""}`);
  process.exit(1);
}
const missing = SCOPES.filter((s) => !tokens.scope?.split(" ").includes(s));
if (missing.length) console.warn(`Warning: consent did not grant ${missing.join(", ")}`);

if (printJson) {
  console.log(JSON.stringify({ refresh_token: tokens.refresh_token }));
} else {
  const file = path.join(REPO_ROOT, ".env.local");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const line = `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
  const next = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(current) ? current.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, line) : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(file, next);
  console.log(`Saved GOOGLE_REFRESH_TOKEN (${mask(tokens.refresh_token)}) to .env.local.`);
}
console.log("Note: while the OAuth consent screen is in 'Testing', Google expires refresh tokens after 7 days. Publish it (or re-run this) before go-live.");
