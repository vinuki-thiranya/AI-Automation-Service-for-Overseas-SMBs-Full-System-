// Acuity Scheduling. Basic auth (user id + API key). Email is mandatory for client bookings.
// Config: services[].external_id = appointmentTypeID, calendars[].id = calendarID (optional).
// Docs: https://developers.acuityscheduling.com/reference
import { DateTime } from "luxon";
import type { ClientConfig, ServiceConfig } from "../config/index.ts";
import { basicAuth, requestJson, splitName, type FetchLike } from "../util.ts";
import type { BookingAdapter, BookInput, SlotCandidate } from "./types.ts";

const API = "https://acuityscheduling.com/api/v1";

export class AcuityAdapter implements BookingAdapter {
  readonly name = "acuity";
  readonly mode = "direct" as const;
  readonly requiresEmail = true;
  private readonly config: ClientConfig;
  private readonly auth: string;
  private readonly fetchFn: FetchLike;

  constructor(config: ClientConfig, creds: { user_id: string; api_key: string }, fetchFn: FetchLike) {
    this.config = config;
    this.auth = basicAuth(creds.user_id, creds.api_key);
    this.fetchFn = fetchFn;
  }

  private typeId(service: ServiceConfig): string {
    if (!service.external_id) throw new Error(`service ${service.id} has no external_id (Acuity appointmentTypeID)`);
    return service.external_id;
  }

  async findCandidates(q: { service: ServiceConfig; from: DateTime; to: DateTime }): Promise<SlotCandidate[]> {
    const cals = this.config.booking?.calendars?.length ? this.config.booking.calendars : [{ id: "", practitioner: undefined }];
    const out: SlotCandidate[] = [];
    for (const cal of cals) {
      for (let day = q.from.setZone(this.config.timezone).startOf("day"); day < q.to; day = day.plus({ days: 1 })) {
        const params = new URLSearchParams({ appointmentTypeID: this.typeId(q.service), date: day.toISODate()!, timezone: this.config.timezone });
        if (cal.id) params.set("calendarID", cal.id);
        const times = await requestJson<{ time: string; slotsAvailable?: number }[]>(this.fetchFn, `${API}/availability/times?${params}`, { headers: { Authorization: this.auth } });
        for (const t of times) {
          if (t.slotsAvailable === 0) continue;
          const start = DateTime.fromISO(t.time, { setZone: true });
          out.push({ start, end: start.plus({ minutes: q.service.duration_minutes }), practitionerId: cal.id || null, practitioner: cal.practitioner ?? null });
        }
      }
    }
    return out;
  }

  async book(input: BookInput): Promise<{ externalId: string }> {
    if (!input.patient.email) throw new Error("Acuity needs the patient's email address");
    const { first, last } = splitName(input.patient.name);
    const res = await requestJson<{ id: number }>(this.fetchFn, `${API}/appointments`, {
      method: "POST", headers: { Authorization: this.auth },
      json: {
        datetime: input.slot.start.toISO(),
        appointmentTypeID: Number(this.typeId(input.service)),
        ...(input.slot.practitionerId ? { calendarID: Number(input.slot.practitionerId) } : {}),
        firstName: first, lastName: last, email: input.patient.email,
        ...(input.patient.phone ? { phone: input.patient.phone } : {}),
        notes: input.notes,
      },
    });
    return { externalId: String(res.id) };
  }

  async cancel(externalId: string, reason: string): Promise<void> {
    await requestJson(this.fetchFn, `${API}/appointments/${externalId}/cancel`, { method: "PUT", headers: { Authorization: this.auth }, json: { cancelNote: reason } });
  }
}
