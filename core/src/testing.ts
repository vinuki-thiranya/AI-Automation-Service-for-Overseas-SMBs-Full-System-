// In-memory wiring of the whole service for unit tests and the QA suite: same Deps shape as main.ts,
// with MemoryStore, captured channels and events, a fake calendar, mock (or live) models and a settable clock.
import { FakeCalendarAdapter } from "./booking/fake.ts";
import type { BookingAdapter } from "./booking/types.ts";
import { CaptureChannels, WebchatOutbox } from "./channels/index.ts";
import type { Client, ClientConfig } from "./config/index.ts";
import { makeCtx, type Ctx, type Deps } from "./context.ts";
import type { CrmAdapter, CrmContact, CrmFields } from "./crm/types.ts";
import type { AppEnv } from "./env.ts";
import { embedFaq, loadFaqSources } from "./faq.ts";
import { handleInbound, type InboundOutcome } from "./ingest/handlers.ts";
import type { InboundMessage } from "./ingest/normalize.ts";
import { MockModelFactory, type ModelFactory } from "./llm/factory.ts";
import { Alerts, CaptureEvents } from "./ops.ts";
import { MapSecrets } from "./secrets.ts";
import { MemoryStore } from "./store/memory.ts";
import type { Channel } from "./store/types.ts";
import { toE164, uuid } from "./util.ts";

export const TEST_ENV: AppEnv = {
  port: 0,
  publicBaseUrl: "https://ops.test.local",
  coreSecret: "test-core-secret-0123456789abcdef0123456789",
  jobToken: "test-job-token-0123456789abcdef0123456789abc",
  metaAppSecret: "test-meta-app-secret",
  whatsappGraphVersion: "v26.0",
  googleOAuth: { clientId: "", clientSecret: "" },
  supabase: {},
  n8nEventsBaseUrl: "http://n8n.invalid/webhook",
  opsTelegram: { botToken: "", chatId: "" },
  opsEmail: "ops@test.local",
  devSecrets: false,
};

export class CaptureCrm implements CrmAdapter {
  readonly name = "capture";
  readonly upserts: { contact: CrmContact; fields: CrmFields }[] = [];
  readonly notes: { externalId: string; text: string }[] = [];
  async upsertContact(contact: CrmContact, fields: CrmFields) {
    this.upserts.push({ contact, fields });
    return { externalId: contact.externalId ?? `crm-${this.upserts.length}` };
  }
  async addNote(externalId: string, text: string) {
    this.notes.push({ externalId, text });
  }
}

export interface Harness {
  deps: Deps;
  store: MemoryStore;
  channels: CaptureChannels;
  events: CaptureEvents;
  alerts: Alerts;
  calendar: FakeCalendarAdapter;
  crm: CaptureCrm;
  client: Client;
  ctx: Ctx;
  /** Current simulated time; move it with setNow/advance. */
  now(): Date;
  setNow(d: Date): void;
  advance(minutes: number): void;
  /** Deliver a customer (or staff) message as if a provider webhook arrived. */
  receive(channel: Channel, from: string, text: string, extra?: Partial<InboundMessage>): Promise<InboundOutcome>;
  /** Chunk + embed the client's FAQ sources into the store (as new-client.ts does). */
  loadFaq(): Promise<number>;
}

export function createHarness(config: ClientConfig, opts: { now?: Date; models?: ModelFactory; booking?: BookingAdapter | null } = {}): Harness {
  let current = opts.now ?? new Date("2026-11-10T00:00:00Z");   // Tue 11am in Sydney (AEDT)
  const clock = () => new Date(current.getTime());
  const store = new MemoryStore(clock);
  const channels = new CaptureChannels();
  const events = new CaptureEvents();
  const alerts = new Alerts({ botToken: "", chatId: "" }, clock);
  const calendar = new FakeCalendarAdapter(config);
  const crm = new CaptureCrm();
  const client: Client = { id: uuid(), slug: config.client_id, region: config.region, status: config.status ?? "demo", config };
  store.addClient(client);

  const deps: Deps = {
    env: TEST_ENV,
    clock,
    fetchFn: async () => { throw new Error("network disabled in tests"); },
    secrets: new MapSecrets({}),
    channels,
    webchat: new WebchatOutbox(),
    models: opts.models ?? new MockModelFactory(),
    events,
    alerts,
    storeForRegion: () => store,
    allStores: () => [store],
    findClient: async (slug) => (slug === client.slug ? { client, store } : null),
    bookingFor: async () => (opts.booking === undefined ? calendar : opts.booking),
    crmFor: async () => (config.crm && config.crm.adapter !== "none" ? crm : null),
  };
  const ctx = makeCtx(deps, client, store);
  let seq = 0;

  return {
    deps, store, channels, events, alerts, calendar, crm, client, ctx,
    now: clock,
    setNow: (d) => { current = d; },
    advance: (minutes) => { current = new Date(current.getTime() + minutes * 60_000); },
    receive: (channel, from, text, extra = {}) => {
      const phone = channel === "whatsapp" || channel === "sms" ? toE164(from) : null;
      return handleInbound(ctx, {
        channel,
        externalId: channel === "whatsapp" ? from.replace(/^\+/, "") : from,
        providerMessageId: `test-${++seq}`,
        text,
        timestamp: clock().toISOString(),
        name: null, phone, email: null, attachments: [], buttonPayload: null, metadata: {},
        ...extra,
      });
    },
    loadFaq: async () => {
      const models = await deps.models.forClient(client);
      if (!models.embedder) return 0;
      return (await embedFaq(store, client.id, models.embedder, await loadFaqSources(config))).chunks;
    },
  };
}
