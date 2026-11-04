// Production entry point: wires real stores, Vault secrets, provider channels and models, then listens.
import { createBookingAdapter } from "./booking/factory.ts";
import type { BookingAdapter } from "./booking/types.ts";
import { LiveChannels, WebchatOutbox } from "./channels/index.ts";
import type { Client } from "./config/index.ts";
import type { Deps } from "./context.ts";
import { createCrmAdapter } from "./crm/adapters.ts";
import type { CrmAdapter } from "./crm/types.ts";
import { assertServerEnv, loadEnv } from "./env.ts";
import { LiveModelFactory } from "./llm/factory.ts";
import { Alerts, N8nEvents } from "./ops.ts";
import { EnvSecrets, VaultSecrets, type SecretResolver } from "./secrets.ts";
import { buildServer } from "./server.ts";
import { RegionalStores, type SupabaseStore } from "./store/supabase.ts";
import { sha256Hex } from "./util.ts";

function ttlCache<T>(ttlMs: number) {
  const map = new Map<string, { value: T; expires: number }>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = map.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await load();
    map.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  };
}

async function main() {
  const env = loadEnv();
  assertServerEnv(env);
  const regions = new RegionalStores(env.supabase);
  const clientCache = ttlCache<{ client: Client; store: SupabaseStore } | null>(60_000);

  const findClient = (slug: string) => clientCache(slug, async () => {
    for (const store of regions.all()) {
      const client = await store.getClientBySlug(slug);
      if (client) return { client, store };
    }
    return null;
  });

  // Vault secrets live in the client's regional project; the ref starts with the client slug.
  const secrets: SecretResolver = env.devSecrets
    ? new EnvSecrets()
    : new VaultSecrets(async (ref) => {
        const found = await findClient(ref.split("/")[0]!);
        if (!found) throw new Error(`no client for credential ${ref}`);
        return found.store;
      });

  const clock = () => new Date();
  const webchat = new WebchatOutbox();
  const bookingCache = ttlCache<BookingAdapter | null>(5 * 60_000);
  const crmCache = ttlCache<CrmAdapter | null>(5 * 60_000);
  // Rebuild adapters whenever the client config changes (new calendar, new CRM, rotated credential ref).
  const configKey = (c: Client) => `${c.slug}|${sha256Hex(JSON.stringify(c.config))}`;

  const deps: Deps = {
    env,
    clock,
    fetchFn: fetch,
    secrets,
    channels: new LiveChannels(env, secrets, webchat),
    webchat,
    models: new LiveModelFactory(secrets),
    events: new N8nEvents(env.n8nEventsBaseUrl, env.jobToken),
    alerts: new Alerts(env.opsTelegram, clock),
    storeForRegion: (region) => regions.forRegion(region),
    allStores: () => regions.all(),
    findClient,
    bookingFor: (client) => bookingCache(configKey(client), () => createBookingAdapter(client, env, secrets, fetch)),
    crmFor: (client) => crmCache(configKey(client), () => createCrmAdapter(client, env, secrets, fetch)),
  };

  const app = buildServer(deps);
  await app.listen({ host: "0.0.0.0", port: env.port });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, "shutting down");
      app.close().then(() => process.exit(0), () => process.exit(1));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
