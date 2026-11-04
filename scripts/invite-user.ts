// Gives someone dashboard access. Run by the agency; the service role never reaches the dashboard.
//   node scripts/invite-user.ts <email> --agency                      agency: every client
//   node scripts/invite-user.ts <email> <client-slug> owner|staff      one client
//   add --email to send Supabase's invite email (free plan: a few per hour); otherwise they sign in
//   at /login with a magic link, or you print one with scripts/dev-login.ts.
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../core/src/localenv.ts";

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { agency: { type: "boolean" }, email: { type: "boolean" } } });
const [email, slug, role] = positionals;
if (!email || (!flags.agency && (!slug || !["owner", "staff"].includes(role ?? "")))) {
  console.error("usage: node scripts/invite-user.ts <email> --agency | <email> <client-slug> owner|staff [--email]");
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
const siteUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";

async function findUser(address: string) {
  for (let page = 1; ; page++) {
    const res = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (res.error) throw new Error(res.error.message);
    const hit = res.data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (hit || res.data.users.length < 1000) return hit ?? null;
  }
}

let user = await findUser(email);
if (!user) {
  const res = flags.email
    ? await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl}/auth/callback` })
    : await db.auth.admin.createUser({ email, email_confirm: true });
  if (res.error) throw new Error(`create user: ${res.error.message}`);
  user = res.data.user;
  console.log(`Created ${email}${flags.email ? " and sent the invite email" : ""}.`);
}

const assigned = flags.agency
  ? await db.rpc("assign_agency_role", { p_user_id: user!.id })
  : await db.rpc("assign_client_role", { p_user_id: user!.id, p_client_slug: slug, p_role: role });
if (assigned.error) throw new Error(`assign role: ${assigned.error.message}`);
console.log(`${email} is now ${flags.agency ? "agency (all clients)" : `${role} of ${slug}`}. Sign in at ${siteUrl}/login`);
