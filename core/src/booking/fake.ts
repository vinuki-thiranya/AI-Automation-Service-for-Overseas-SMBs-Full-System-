// In-memory calendar for tests, QA and demos without a real calendar: business hours minus
// existing bookings, with switches to simulate a slot being taken or the provider failing.
import { DateTime } from "luxon";
import type { ClientConfig, ServiceConfig } from "../config/index.ts";
import { businessWindows, generateCandidates } from "./slots.ts";
import { SlotTakenError, type AttendanceRecord, type BookingAdapter, type BookInput, type SlotCandidate } from "./types.ts";

export class FakeCalendarAdapter implements BookingAdapter {
  readonly name = "fake";
  readonly mode = "direct" as const;
  readonly requiresEmail = false;
  readonly booked = new Map<string, { start: DateTime; end: DateTime; practitionerId: string | null; patient: string; cancelled: boolean }>();
  readonly attendanceById = new Map<string, AttendanceRecord["status"]>();
  /** ISO starts that an outside party takes between offering and booking. */
  takenAfterOffer = new Set<string>();
  failing = false;
  private readonly config: ClientConfig;
  private seq = 0;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  private practitioners() {
    const cals = this.config.booking?.calendars ?? [];
    return cals.length ? cals : [{ id: "default", practitioner: undefined, services: undefined }];
  }

  async findCandidates(q: { service: ServiceConfig; from: DateTime; to: DateTime }): Promise<SlotCandidate[]> {
    if (this.failing) throw new Error("calendar provider unavailable (simulated)");
    const windows = businessWindows(this.config, q.from, q.to);
    return this.practitioners().flatMap((p) => generateCandidates({
      windows,
      busy: [...this.booked.values()].filter((b) => !b.cancelled && b.practitionerId === p.id),
      durationMinutes: q.service.duration_minutes,
      bufferMinutes: this.config.booking?.buffer_minutes ?? 15,
      stepMinutes: 30,
      practitionerId: p.id,
      practitioner: p.practitioner ?? null,
    }));
  }

  async book(input: BookInput): Promise<{ externalId: string }> {
    if (this.failing) throw new Error("calendar provider unavailable (simulated)");
    if (this.takenAfterOffer.has(input.slot.start.toUTC().toISO()!)) throw new SlotTakenError("slot no longer available");
    const existing = [...this.booked.entries()].find(([, b]) =>
      !b.cancelled && b.practitionerId === input.slot.practitionerId && b.start < input.slot.end && input.slot.start < b.end);
    if (existing) {
      if (existing[1].patient === input.idempotencyKey) return { externalId: existing[0] };
      throw new SlotTakenError("slot no longer available");
    }
    const id = `fake-${++this.seq}`;
    this.booked.set(id, { start: input.slot.start, end: input.slot.end, practitionerId: input.slot.practitionerId, patient: input.idempotencyKey, cancelled: false });
    return { externalId: id };
  }

  async cancel(externalId: string): Promise<void> {
    const b = this.booked.get(externalId);
    if (b) b.cancelled = true;
  }

  async attendance(): Promise<AttendanceRecord[]> {
    return [...this.attendanceById.entries()].map(([externalId, status]) => ({ externalId, status }));
  }
}

/** Link-out mode: no booking API (Jane is partner-gated) — the assistant sends booking_link. */
export class LinkOutAdapter implements BookingAdapter {
  readonly name: string;
  readonly mode = "link" as const;
  readonly requiresEmail = false;
  constructor(name: string) {
    this.name = name;
  }
  async findCandidates(): Promise<SlotCandidate[]> { return []; }
  async book(): Promise<{ externalId: string }> { throw new Error("link-out mode: direct booking is not available"); }
  async cancel(): Promise<void> { throw new Error("link-out mode: cancel in the booking system"); }
}
