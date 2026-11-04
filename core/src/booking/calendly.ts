// Calendly Scheduling API (paid plans): event_type_available_times + POST /invitees.
// Auth: personal access token or OAuth access token. Email is mandatory for invitees.
// Config: services[].external_id = event type URI. Docs: https://developer.calendly.com
import { DateTime } from "luxon";
import type { ClientConfig, ServiceConfig } from "../config/index.ts";
import { requestJson, type FetchLike } from "../util.ts";
import type { BookingAdapter, BookInput, SlotCandidate } from "./types.ts";

const API = "https://api.calendly.com";

export class CalendlyAdapter implements BookingAdapter {
  readonly name = "calendly";
  readonly mode = "direct" as const;
  readonly requiresEmail = true;
  private readonly config: ClientConfig;
  private readonly token: string;
  private readonly fetchFn: FetchLike;

  constructor(config: ClientConfig, token: string, fetchFn: FetchLike) {
    this.config = config;
    this.token = token;
    this.fetchFn = fetchFn;
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  private eventType(service: ServiceConfig): string {
    if (!service.external_id) throw new Error(`service ${service.id} has no external_id (Calendly event type URI)`);
    return service.external_id;
  }

  async findCandidates(q: { service: ServiceConfig; from: DateTime; to: DateTime }): Promise<SlotCandidate[]> {
    const out: SlotCandidate[] = [];
    // The endpoint serves at most 7 days per request and only future times.
    for (let from = DateTime.max(q.from, DateTime.utc().plus({ minutes: 1 })); from < q.to; from = from.plus({ days: 7 })) {
      const to = DateTime.min(from.plus({ days: 7 }), q.to);
      const params = new URLSearchParams({ event_type: this.eventType(q.service), start_time: from.toUTC().toISO()!, end_time: to.toUTC().toISO()! });
      const res = await requestJson<{ collection: { start_time: string; status: string }[] }>(this.fetchFn, `${API}/event_type_available_times?${params}`, { headers: this.headers() });
      for (const t of res.collection) {
        if (t.status !== "available") continue;
        const start = DateTime.fromISO(t.start_time).setZone(this.config.timezone);
        out.push({ start, end: start.plus({ minutes: q.service.duration_minutes }), practitionerId: null, practitioner: null });
      }
    }
    return out;
  }

  async book(input: BookInput): Promise<{ externalId: string }> {
    if (!input.patient.email) throw new Error("Calendly needs the invitee's email address");
    const res = await requestJson<{ resource: { uri: string; event: string } }>(this.fetchFn, `${API}/invitees`, {
      method: "POST", headers: this.headers(),
      json: {
        event_type: this.eventType(input.service),
        start_time: input.slot.start.toUTC().toISO(),
        invitee: {
          name: input.patient.name,
          email: input.patient.email,
          timezone: this.config.timezone,
          ...(input.patient.phone ? { text_reminder_number: input.patient.phone } : {}),
        },
      },
    });
    return { externalId: res.resource.event };
  }

  async cancel(externalId: string, reason: string): Promise<void> {
    // externalId is the scheduled event URI: https://api.calendly.com/scheduled_events/<uuid>
    await requestJson(this.fetchFn, `${externalId}/cancellation`, { method: "POST", headers: this.headers(), json: { reason } });
  }
}
