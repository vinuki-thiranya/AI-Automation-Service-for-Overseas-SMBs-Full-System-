// Dependency container and per-request context. Production wiring lives in main.ts;
// tests and QA build the same shape with in-memory implementations.
import type { BookingAdapter } from "./booking/types.ts";
import type { ChannelSender, WebchatOutbox } from "./channels/index.ts";
import type { Client } from "./config/index.ts";
import type { CrmAdapter } from "./crm/types.ts";
import type { AppEnv } from "./env.ts";
import type { ModelFactory } from "./llm/factory.ts";
import type { SecretResolver } from "./secrets.ts";
import type { Store } from "./store/types.ts";
import type { FetchLike } from "./util.ts";

export type ClientEvent =
  | "lead.created" | "lead.hot" | "lead.scored" | "booking.created" | "booking.cancelled" | "booking.rescheduled"
  | "escalation.opened" | "escalation.claimed" | "contact.opted_out" | "missed_call.texted";

export interface EventSink {
  emit(client: Client, event: ClientEvent, payload: Record<string, unknown>): Promise<void>;
}

export interface OpsAlerts {
  /** Agency alert (Telegram). Deduplicated per key for `quietMinutes`. */
  notify(key: string, text: string, quietMinutes?: number): Promise<void>;
  /** Records a client-facing failure; returns true once the client crosses the failure threshold. */
  recordFailure(client: Client, what: string, err: unknown): Promise<boolean>;
  /** True while a client is in degraded "we'll call you back" mode after repeated failures. */
  isDegraded(client: Client): boolean;
}

export interface Deps {
  env: AppEnv;
  clock: () => Date;
  fetchFn: FetchLike;
  secrets: SecretResolver;
  channels: ChannelSender;
  /** Staff replies to web chat wait here until the widget polls. */
  webchat: WebchatOutbox;
  models: ModelFactory;
  events: EventSink;
  alerts: OpsAlerts;
  /** Region routing: every client's data lives in its region's Supabase project. */
  storeForRegion(region: Client["region"]): Store;
  allStores(): Store[];
  /** Resolve a client by slug across regions (cached). */
  findClient(slug: string): Promise<{ client: Client; store: Store } | null>;
  bookingFor(client: Client): Promise<BookingAdapter | null>;
  crmFor(client: Client): Promise<CrmAdapter | null>;
}

export interface Ctx {
  deps: Deps;
  client: Client;
  store: Store;
  now(): Date;
}

export function makeCtx(deps: Deps, client: Client, store: Store): Ctx {
  return { deps, client, store, now: deps.clock };
}
