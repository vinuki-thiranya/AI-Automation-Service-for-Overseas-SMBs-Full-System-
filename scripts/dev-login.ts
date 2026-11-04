// Prints a one-time sign-in link for an existing dashboard user, without sending email. For local
// development only: the free Supabase email service allows a few emails an hour.
//   node scripts/dev-login.ts <email>
// The link goes to the dashboard's /auth/confirm, which verifies the token server-side.
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../core/src/localenv.ts";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/dev-login.ts <email>   (create the user first with scripts/invite-user.ts)");
  process.exit(1);
}
loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const res = await db.auth.admin.generateLink({ type: "magiclink", email });
if (res.error) {
  console.error(`generateLink: ${res.error.message}`);
  process.exit(1);
}
const siteUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";
console.log(`${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(res.data.properties.hashed_token)}&type=magiclink`);
console.log("One-time link, valid for about an hour. Open it in the browser you'll use for the dashboard.");
