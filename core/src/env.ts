// Agency-level settings from the process environment (infra/.env via compose).
// Client-level secrets never live here; they come from Supabase Vault (see secrets/).

export type Region = "au" | "eu" | "us";

export interface AppEnv {
  port: number;
  publicBaseUrl: string;          // https://ops.<DOMAIN> — used for Twilio signature URLs and links
  coreSecret: string;             // HMAC key for webchat sessions, lead-form tokens, webhook verify tokens
  jobToken: string;               // bearer token n8n uses to call /v1/jobs/*
  metaAppSecret: string;          // verifies X-Hub-Signature-256 on WhatsApp webhooks
  whatsappGraphVersion: string;
  googleOAuth: { clientId: string; clientSecret: string };
  supabase: Partial<Record<Region, { url: string; serviceRoleKey: string }>>;
  n8nEventsBaseUrl: string;       // http://n8n:5678/webhook — core posts client events here
  opsTelegram: { botToken: string; chatId: string };
  opsEmail: string;               // contact used in provider User-Agent headers (Cliniko requires one)
  devSecrets: boolean;            // resolve credential refs from SECRET__* env vars (local dev / QA only)
}

function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function loadEnv(): AppEnv {
  const supabase: AppEnv["supabase"] = {};
  for (const region of ["au", "eu", "us"] as const) {
    const url = opt(`SUPABASE_${region.toUpperCase()}_URL`);
    const key = opt(`SUPABASE_${region.toUpperCase()}_SERVICE_ROLE_KEY`);
    if (url && key) supabase[region] = { url, serviceRoleKey: key };
  }
  const env: AppEnv = {
    port: Number(opt("PORT", "8080")),
    publicBaseUrl: opt("PUBLIC_BASE_URL", "http://localhost:8080").replace(/\/+$/, ""),
    coreSecret: opt("CORE_SECRET"),
    jobToken: opt("CORE_JOB_TOKEN"),
    metaAppSecret: opt("META_APP_SECRET"),
    whatsappGraphVersion: opt("WHATSAPP_GRAPH_VERSION", "v26.0"),
    googleOAuth: { clientId: opt("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: opt("GOOGLE_OAUTH_CLIENT_SECRET") },
    supabase,
    n8nEventsBaseUrl: opt("N8N_EVENTS_BASE_URL", "http://n8n:5678/webhook").replace(/\/+$/, ""),
    opsTelegram: { botToken: opt("TELEGRAM_BOT_TOKEN"), chatId: opt("TELEGRAM_CHAT_ID") },
    opsEmail: opt("OPS_EMAIL", "ops@example.com"),
    devSecrets: opt("CORE_DEV_SECRETS") === "1",
  };
  return env;
}

/** Fails fast at boot when something the server cannot run without is missing. */
export function assertServerEnv(env: AppEnv): void {
  const missing: string[] = [];
  if (env.coreSecret.length < 32) missing.push("CORE_SECRET (>= 32 chars)");
  if (env.jobToken.length < 32) missing.push("CORE_JOB_TOKEN (>= 32 chars)");
  if (!env.metaAppSecret) missing.push("META_APP_SECRET");
  if (Object.keys(env.supabase).length === 0 && !env.devSecrets) missing.push("SUPABASE_<REGION>_URL + _SERVICE_ROLE_KEY");
  if (missing.length) throw new Error(`missing configuration: ${missing.join(", ")}`);
}
