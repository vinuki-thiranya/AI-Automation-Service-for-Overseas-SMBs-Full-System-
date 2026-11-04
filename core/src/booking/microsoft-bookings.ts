// Microsoft Bookings via Microsoft Graph (app-only, BookingsAppointment.ReadWrite.All).
// Config: booking.account_id = bookingBusiness id, calendars[].id = staff member id,
// services[].external_id = Bookings service id. Credential JSON: {tenant_id, client_id, client_secret}.
import { DateTime, Interval } from "luxon";
import type { ClientConfig, ServiceConfig } from "../config/index.ts";
import { requestJson, type FetchLike } from "../util.ts";
import { generateCandidates } from "./slots.ts";
import type { BookingAdapter, BookInput, SlotCandidate } from "./types.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";

interface GraphDateTime { dateTime: string; timeZone: string }

export class MicrosoftBookingsAdapter implements BookingAdapter {
  readonly name = "microsoft_bookings";
  readonly mode = "direct" as const;
  readonly requiresEmail = false;
  private readonly config: ClientConfig;
  private readonly creds: { tenant_id: string; client_id: string; client_secret: string };
  private readonly fetchFn: FetchLike;
  private token: { value: string; expires: number } | null = null;

  constructor(config: ClientConfig, creds: { tenant_id: string; client_id: string; client_secret: string }, fetchFn: FetchLike) {
    this.config = config;
    this.creds = creds;
    this.fetchFn = fetchFn;
  }

  private async auth() {
    if (!this.token || this.token.expires < Date.now() + 60_000) {
      const res = await requestJson<{ access_token: string; expires_in: number }>(this.fetchFn,
        `https://login.microsoftonline.com/${this.creds.tenant_id}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: this.creds.client_id, client_secret: this.creds.client_secret,
            scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
          }).toString(),
        });
      this.token = { value: res.access_token, expires: Date.now() + res.expires_in * 1000 };
    }
    return { Authorization: `Bearer ${this.token.value}` };
  }

  private business(): string {
    const id = this.config.booking?.account_id;
    if (!id) throw new Error("booking.account_id (Bookings business id) is required");
    return encodeURIComponent(id);
  }

  private graphTime(dt: DateTime, zone = this.config.timezone): GraphDateTime {
    return { dateTime: dt.setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: zone };
  }

  private parseGraphTime(t: GraphDateTime): DateTime {
    const zone = t.timeZone === "UTC" || !t.timeZone ? "utc" : t.timeZone;
    return DateTime.fromISO(t.dateTime, { zone });
  }

  async findCandidates(q: { service: ServiceConfig; from: DateTime; to: DateTime }): Promise<SlotCandidate[]> {
    const staff = (this.config.booking?.calendars ?? []).filter((c) => !c.services?.length || c.services.includes(q.service.id));
    if (staff.length === 0) return [];
    const res = await requestJson<{ value: { staffId: string; availabilityItems: { status: string; startDateTime: GraphDateTime; endDateTime: GraphDateTime }[] }[] }>(
      this.fetchFn, `${GRAPH}/solutions/bookingBusinesses/${this.business()}/getStaffAvailability`, {
        method: "POST", headers: await this.auth(),
        json: { staffIds: staff.map((s) => s.id), startDateTime: this.graphTime(q.from), endDateTime: this.graphTime(q.to) },
      });
    return res.value.flatMap((entry) => {
      const s = staff.find((x) => x.id === entry.staffId);
      const windows = entry.availabilityItems
        .filter((i) => i.status === "available" || i.status === "slotsAvailable")
        .map((i) => Interval.fromDateTimes(this.parseGraphTime(i.startDateTime), this.parseGraphTime(i.endDateTime)))
        .filter((i) => i.isValid);
      return generateCandidates({
        windows, busy: [], durationMinutes: q.service.duration_minutes, bufferMinutes: 0,
        practitionerId: entry.staffId, practitioner: s?.practitioner ?? null,
      });
    });
  }

  async book(input: BookInput): Promise<{ externalId: string }> {
    if (!input.service.external_id) throw new Error(`service ${input.service.id} has no external_id (Bookings service id)`);
    const res = await requestJson<{ id: string }>(this.fetchFn, `${GRAPH}/solutions/bookingBusinesses/${this.business()}/appointments`, {
      method: "POST", headers: await this.auth(),
      json: {
        serviceId: input.service.external_id,
        staffMemberIds: input.slot.practitionerId ? [input.slot.practitionerId] : [],
        startDateTime: this.graphTime(input.slot.start, "UTC"),
        endDateTime: this.graphTime(input.slot.end, "UTC"),
        customerTimeZone: this.config.timezone,
        serviceNotes: input.notes,
        isLocationOnline: false,
        customers: [{
          "@odata.type": "#microsoft.graph.bookingCustomerInformation",
          name: input.patient.name,
          ...(input.patient.email ? { emailAddress: input.patient.email } : {}),
          ...(input.patient.phone ? { phone: input.patient.phone } : {}),
        }],
      },
    });
    return { externalId: res.id };
  }

  async cancel(externalId: string, reason: string): Promise<void> {
    await requestJson(this.fetchFn, `${GRAPH}/solutions/bookingBusinesses/${this.business()}/appointments/${encodeURIComponent(externalId)}/cancel`, {
      method: "POST", headers: await this.auth(), json: { cancellationMessage: reason },
    });
  }
}
