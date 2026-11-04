// Cliniko (AU/UK allied health). API key auth; the shard (au1, uk1, ...) is the key's suffix.
// Config: booking.account_id = business id, booking.calendars[].id = practitioner id,
// business.services[].external_id = appointment type id. Docs: https://docs.api.cliniko.com
import { DateTime } from "luxon";
import type { ClientConfig, ServiceConfig } from "../config/index.ts";
import { basicAuth, requestJson, splitName, type FetchLike } from "../util.ts";
import type { AttendanceRecord, BookingAdapter, BookInput, SlotCandidate } from "./types.ts";

interface Page<T> { links?: { next?: string } ; [k: string]: unknown; total_entries?: number; data?: T[] }

export class ClinikoAdapter implements BookingAdapter {
  readonly name = "cliniko";
  readonly mode = "direct" as const;
  readonly requiresEmail = false;
  private readonly config: ClientConfig;
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly fetchFn: FetchLike;
  private readonly base: string;

  constructor(config: ClientConfig, apiKey: string, opsEmail: string, fetchFn: FetchLike) {
    this.config = config;
    this.apiKey = apiKey;
    this.userAgent = `Recallo (${opsEmail})`;
    this.fetchFn = fetchFn;
    const shard = apiKey.split("-").at(-1);
    if (!shard || !/^[a-z]{2}\d$/.test(shard)) throw new Error("Cliniko API key must end with its shard, e.g. -au1");
    this.base = `https://api.${shard}.cliniko.com/v1`;
  }

  private get<T>(path: string): Promise<T> {
    return requestJson<T>(this.fetchFn, path.startsWith("http") ? path : `${this.base}${path}`, { headers: this.headers() });
  }
  private send<T>(method: string, path: string, json: unknown): Promise<T> {
    return requestJson<T>(this.fetchFn, `${this.base}${path}`, { method, headers: this.headers(), json });
  }
  private headers() {
    return { Authorization: basicAuth(this.apiKey, ""), "User-Agent": this.userAgent };
  }

  private businessId(): string {
    const id = this.config.booking?.account_id;
    if (!id) throw new Error("booking.account_id (Cliniko business id) is required");
    return id;
  }

  private appointmentType(service: ServiceConfig): string {
    if (!service.external_id) throw new Error(`service ${service.id} has no external_id (Cliniko appointment type id)`);
    return service.external_id;
  }

  async findCandidates(q: { service: ServiceConfig; from: DateTime; to: DateTime }): Promise<SlotCandidate[]> {
    const typeId = this.appointmentType(q.service);
    const practitioners = (this.config.booking?.calendars ?? []).filter((c) => !c.services?.length || c.services.includes(q.service.id));
    const out: SlotCandidate[] = [];
    for (const p of practitioners) {
      // available_times accepts at most 7 days per request.
      for (let from = q.from.startOf("day"); from < q.to; from = from.plus({ days: 7 })) {
        const to = DateTime.min(from.plus({ days: 6 }), q.to);
        let url: string | undefined = `/businesses/${this.businessId()}/practitioners/${p.id}/appointment_types/${typeId}/available_times?from=${from.toISODate()}&to=${to.toISODate()}&per_page=100`;
        while (url) {
          const page: Page<never> & { available_times?: { appointment_start: string }[] } = await this.get(url);
          for (const t of page.available_times ?? []) {
            const start = DateTime.fromISO(t.appointment_start, { zone: this.config.timezone });
            out.push({ start, end: start.plus({ minutes: q.service.duration_minutes }), practitionerId: p.id, practitioner: p.practitioner ?? null });
          }
          url = page.links?.next;
        }
      }
    }
    return out;
  }

  private async findOrCreatePatient(patient: BookInput["patient"]): Promise<string> {
    const { first, last } = splitName(patient.name);
    if (patient.email) {
      const found = await this.get<{ patients?: { id: string }[] }>(`/patients?q[]=${encodeURIComponent(`email:=${patient.email}`)}`);
      if (found.patients?.[0]) return found.patients[0].id;
    }
    const byName = await this.get<{ patients?: { id: string; patient_phone_numbers?: { number: string }[] }[] }>(
      `/patients?q[]=${encodeURIComponent(`first_name:=${first}`)}&q[]=${encodeURIComponent(`last_name:=${last}`)}`);
    const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
    const match = byName.patients?.find((p) => patient.phone && p.patient_phone_numbers?.some((n) => digits(n.number) === digits(patient.phone!)));
    if (match) return match.id;
    const created = await this.send<{ id: string }>("POST", "/patients", {
      first_name: first,
      last_name: last,
      ...(patient.email ? { email: patient.email } : {}),
      ...(patient.phone ? { patient_phone_numbers: [{ phone_type: "Mobile", number: patient.phone }] } : {}),
    });
    return created.id;
  }

  async book(input: BookInput): Promise<{ externalId: string }> {
    const patientId = await this.findOrCreatePatient(input.patient);
    const startIso = input.slot.start.toUTC().toISO()!;
    // Idempotency: an existing appointment for this patient at this time is the same booking.
    const existing = await this.get<{ individual_appointments?: { id: string }[] }>(
      `/patients/${patientId}/appointments?q[]=${encodeURIComponent(`starts_at:=${startIso}`)}`).catch(() => ({ individual_appointments: [] }));
    if (existing.individual_appointments?.[0]) return { externalId: existing.individual_appointments[0].id };
    const created = await this.send<{ id: string }>("POST", "/individual_appointments", {
      appointment_start: startIso,
      appointment_type_id: this.appointmentType(input.service),
      business_id: this.businessId(),
      patient_id: patientId,
      practitioner_id: input.slot.practitionerId,
      notes: input.notes || "Booked by the virtual assistant.",
    });
    return { externalId: created.id };
  }

  async cancel(externalId: string, reason: string): Promise<void> {
    // cancellation_reason 50 = "Other" in Cliniko's enumeration.
    await this.send("PATCH", `/individual_appointments/${externalId}/cancel`, { cancellation_reason: 50, cancellation_note: reason.slice(0, 250) });
  }

  async attendance(from: DateTime, to: DateTime): Promise<AttendanceRecord[]> {
    const out: AttendanceRecord[] = [];
    let url: string | undefined = `/individual_appointments?q[]=${encodeURIComponent(`starts_at:>=${from.toUTC().toISO()}`)}&q[]=${encodeURIComponent(`starts_at:<${to.toUTC().toISO()}`)}&per_page=100`;
    while (url) {
      const page: { individual_appointments?: { id: string; did_not_arrive?: boolean; cancelled_at?: string | null; patient_arrived?: boolean }[]; links?: { next?: string } } = await this.get(url);
      for (const a of page.individual_appointments ?? []) {
        if (a.cancelled_at) continue;
        if (a.did_not_arrive) out.push({ externalId: a.id, status: "no_show" });
        else if (a.patient_arrived) out.push({ externalId: a.id, status: "attended" });
      }
      url = page.links?.next;
    }
    return out;
  }
}
