// Resolves credential references ('<client_id>/<name>') to secret values.
// Production: Supabase Vault through the service-role-only get_client_secret RPC.
// Local dev / QA: SECRET__<client>__<name> environment variables (CORE_DEV_SECRETS=1).
//
// Composite credentials are stored as JSON strings, e.g.
//   <id>/twilio    {"account_sid":"AC...","auth_token":"..."}
//   <id>/google    {"refresh_token":"..."}            (OAuth client id/secret are agency-level env)
//   <id>/acuity    {"user_id":"123","api_key":"..."}
//   <id>/microsoft {"tenant_id":"...","client_id":"...","client_secret":"..."}
//   <id>/telegram  {"bot_token":"..."}
// Simple ones are plain strings: anthropic, openai, whatsapp, resend, cliniko, calendly, hubspot, pipedrive, gohighlevel.
import type { SupabaseStore } from "./store/supabase.ts";

export interface SecretResolver {
  get(ref: string): Promise<string>;
}

export class MissingSecretError extends Error {}

export async function getJsonSecret<T>(secrets: SecretResolver, ref: string): Promise<T> {
  const raw = await secrets.get(ref);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new MissingSecretError(`credential ${ref} must be a JSON object`);
  }
}

export class VaultSecrets implements SecretResolver {
  private readonly cache = new Map<string, { value: string; expires: number }>();
  private readonly storeFor: (ref: string) => Promise<SupabaseStore>;
  private readonly ttlMs: number;

  constructor(storeFor: (ref: string) => Promise<SupabaseStore>, ttlMs = 5 * 60_000) {
    this.storeFor = storeFor;
    this.ttlMs = ttlMs;
  }

  async get(ref: string): Promise<string> {
    const hit = this.cache.get(ref);
    if (hit && hit.expires > Date.now()) return hit.value;
    const store = await this.storeFor(ref);
    const res = await store.db.rpc("get_client_secret", { p_ref: ref });
    if (res.error) throw new Error(`vault lookup ${ref}: ${res.error.message}`);
    if (typeof res.data !== "string" || res.data === "") throw new MissingSecretError(`credential ${ref} is not set in Vault`);
    this.cache.set(ref, { value: res.data, expires: Date.now() + this.ttlMs });
    return res.data;
  }
}

export function envSecretName(ref: string): string {
  return `SECRET__${ref.replace("/", "__").replace(/-/g, "_")}`;
}

export class EnvSecrets implements SecretResolver {
  async get(ref: string): Promise<string> {
    const value = process.env[envSecretName(ref)];
    if (!value) throw new MissingSecretError(`credential ${ref} not set (env ${envSecretName(ref)})`);
    return value;
  }
}

export class MapSecrets implements SecretResolver {
  private readonly values: Record<string, string>;
  constructor(values: Record<string, string>) {
    this.values = values;
  }
  async get(ref: string): Promise<string> {
    const v = this.values[ref];
    if (v === undefined) throw new MissingSecretError(`credential ${ref} not set`);
    return v;
  }
}
