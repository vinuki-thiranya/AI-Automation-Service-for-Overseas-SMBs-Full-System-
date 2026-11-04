// Google Calendar: free/busy per practitioner calendar + event insert with a deterministic event id
// (so a retried booking returns 409 instead of creating a duplicate).
import { DateTime } from "luxon";
import type { ClientConfig } from "../config/index.ts";
import { requestJson, sha256Hex, HttpError, type FetchLike } from "../util.ts";
import { businessWindows, generateCandidates } from "./slots.ts";
import type { BookingAdapter, BookInput, SlotCandidate } from "./types.ts";

const API = "https://www.googleapis.com/calendar/v3";

export class GoogleTokenSource {
  private token: { value: string; expires: number } | null = null;
  private readonly creds: { clientId: string; clientSecret: string; refreshToken: string };
  private readonly fetchFn: FetchLike;

  constructor(creds: { clientId: string; clientSecret: string; refreshToken: string }, fetchFn: FetchLike) {
    this.creds = creds;
    this.fetchFn = fetchFn;
  }

  async get(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const res = await requestJson<{ access_token: string; expires_in: number }>(this.fetchFn, "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.creds.clientId, client_secret: this.creds.clientSecret,
        refresh_token: this.creds.refreshToken, grant_type: "refresh_token",
      }).toString(),
    });
    this.token = { value: res.access_token, expires: Date.now() + res.expires_in * 1000 };
    return res.access_token;
  }
}

/** Google event ids must be base32hex (a–v, 0–9), 5–1024 chars. */
export function googleEventId(key: string): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuv";
  const hex = sha256Hex(key);
  let out = "";
  for (let i = 0; i < hex.length; i += 2) out += alphabet[parseInt(hex.slice(i, i + 2), 16) % 32];
  return `rc${out}`;
}

export class GoogleCalendarAdapter implements BookingAdapter {
  readonly name = "google_calendar";
  readonly mode = "direct" as const;
  readonly requiresEmail = false;
  private readonly config: ClientConfig;
  private readonly tokens: GoogleTokenSource;
  private readonly fetchFn: FetchLike;

  constructor(config: ClientConfig, tokens: GoogleTokenSource, fetchFn: FetchLike) {
    this.config = config;
    this.tokens = tokens;
    this.fetchFn = fetchFn;
  }

  private calendars() {
    const cals = this.config.booking?.calendars ?? [];
    if (cals.length === 0) throw new Error("booking.calendars is empty");
    return cals;
  }

  private async auth() {
    return { Authorization: `Bearer ${await this.tokens.get()}` };
  }

  async findCandidates(q: { service: ClientConfig["business"]["services"][number]; from: DateTime; to: DateTime }): Promise<SlotCandidate[]> {
    const cals = this.calendars().filter((c) => !c.services?.length || c.services.includes(q.service.id));
    if (cals.length === 0) return [];
    const res = await requestJson<{ calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
      this.fetchFn, `${API}/freeBusy`, {
        method: "POST", headers: await this.auth(),
        json: { timeMin: q.from.toUTC().toISO(), timeMax: q.to.toUTC().toISO(), timeZone: this.config.timezone, items: cals.map((c) => ({ id: c.id })) },
      });
    const windows = businessWindows(this.config, q.from, q.to);
    return cals.flatMap((cal) => {
      const entry = res.calendars[cal.id];
      if (!entry || entry.errors?.length) return [];
      const busy = (entry.busy ?? []).map((b) => ({ start: DateTime.fromISO(b.start), end: DateTime.fromISO(b.end) }));
      return generateCandidates({
        windows, busy, durationMinutes: q.service.duration_minutes, bufferMinutes: this.config.booking?.buffer_minutes ?? 15,
        practitionerId: cal.id, practitioner: cal.practitioner ?? null,
      });
    });
  }

  async book(input: BookInput): Promise<{ externalId: string }> {
    const calendarId = input.slot.practitionerId ?? this.calendars()[0]!.id;
    const eventId = googleEventId(input.idempotencyKey);
    const contact = [input.patient.phone, input.patient.email].filter(Boolean).join(" · ");
    try {
      await requestJson(this.fetchFn, `${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST", headers: await this.auth(),
        json: {
          id: eventId,
          summary: `${input.service.name} — ${input.patient.name}${input.patient.isNew ? " (new patient)" : ""}`,
          description: [contact, input.notes, "Booked by the virtual assistant."].filter(Boolean).join("\n"),
          start: { dateTime: input.slot.start.toISO(), timeZone: this.config.timezone },
          end: { dateTime: input.slot.end.toISO(), timeZone: this.config.timezone },
          extendedProperties: { private: { recallo: "1", service_id: input.service.id } },
        },
      });
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409)) throw err;   // 409 = this booking already exists
    }
    return { externalId: `${calendarId}|${eventId}` };
  }

  async cancel(externalId: string): Promise<void> {
    const [calendarId, eventId] = externalId.split("|") as [string, string];
    try {
      await requestJson(this.fetchFn, `${API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { method: "DELETE", headers: await this.auth() });
    } catch (err) {
      if (!(err instanceof HttpError && (err.status === 404 || err.status === 410))) throw err;
    }
  }
}
