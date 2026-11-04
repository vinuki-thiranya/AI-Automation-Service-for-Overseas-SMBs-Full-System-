// Agency-side alerting and client events.
//  - Alerts: Telegram, deduplicated; >3 client-facing failures in an hour puts that client in degraded
//    mode for 30 minutes ("we'll call you back" + escalation) and pages you (spec §6.5).
//  - Events: POST to the client's n8n webhook so per-client automations can react (Slack, CRM extras, ...).
import type { Client } from "./config/index.ts";
import type { ClientEvent, EventSink, OpsAlerts } from "./context.ts";
import { TelegramBot } from "./telegram.ts";
import { errorMessage, type FetchLike } from "./util.ts";

const FAILURE_WINDOW_MS = 3600_000;
const FAILURE_THRESHOLD = 3;
const DEGRADED_MS = 30 * 60_000;

export class Alerts implements OpsAlerts {
  private readonly bot: TelegramBot | null;
  private readonly chatId: string;
  private readonly clock: () => Date;
  private readonly lastSent = new Map<string, number>();
  private readonly failures = new Map<string, number[]>();
  private readonly degradedUntil = new Map<string, number>();
  readonly log: string[] = [];

  constructor(telegram: { botToken: string; chatId: string }, clock: () => Date, fetchFn: FetchLike = fetch) {
    this.bot = telegram.botToken && telegram.chatId ? new TelegramBot(telegram.botToken, fetchFn) : null;
    this.chatId = telegram.chatId;
    this.clock = clock;
  }

  async notify(key: string, text: string, quietMinutes = 30): Promise<void> {
    const now = this.clock().getTime();
    const last = this.lastSent.get(key);
    if (last && now - last < quietMinutes * 60_000) return;
    this.lastSent.set(key, now);
    this.log.push(text);
    console.error(JSON.stringify({ level: "alert", key, text }));
    if (!this.bot) return;
    try {
      await this.bot.sendMessage(this.chatId, `⚠️ Recallo core: ${text}`.slice(0, 4000));
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "telegram alert failed", error: errorMessage(err) }));
    }
  }

  async recordFailure(client: Client, what: string, err: unknown): Promise<boolean> {
    const now = this.clock().getTime();
    const list = (this.failures.get(client.slug) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    list.push(now);
    this.failures.set(client.slug, list);
    console.error(JSON.stringify({ level: "error", client: client.slug, what, error: errorMessage(err) }));
    if (list.length > FAILURE_THRESHOLD) {
      const wasDegraded = this.isDegraded(client);
      this.degradedUntil.set(client.slug, now + DEGRADED_MS);
      if (!wasDegraded) {
        await this.notify(`degraded:${client.slug}`, `${client.slug}: ${list.length} failures in the last hour (latest: ${what}: ${errorMessage(err)}). Customers get "we'll call you back" for 30 min.`);
      }
      return true;
    }
    return false;
  }

  isDegraded(client: Client): boolean {
    return (this.degradedUntil.get(client.slug) ?? 0) > this.clock().getTime();
  }
}

export class N8nEvents implements EventSink {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: FetchLike;

  constructor(baseUrl: string, token: string, fetchFn: FetchLike = fetch) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.fetchFn = fetchFn;
  }

  async emit(client: Client, event: ClientEvent, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.fetchFn(`${this.baseUrl}/${client.slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ event, client: client.slug, at: new Date().toISOString(), ...payload }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Events are best-effort hooks for optional automations; never block a customer turn on them.
    }
  }
}

export class CaptureEvents implements EventSink {
  readonly events: { client: string; event: ClientEvent; payload: Record<string, unknown> }[] = [];
  async emit(client: Client, event: ClientEvent, payload: Record<string, unknown>): Promise<void> {
    this.events.push({ client: client.slug, event, payload });
  }
}
