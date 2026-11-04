// Booking operations used by the conversation tools and scheduled jobs. Adapter-agnostic:
// policy, slot ids, idempotency, confirmation (with ICS) and events all live here.
import { DateTime } from "luxon";
import { serviceById, type ServiceConfig } from "../config/index.ts";
import type { Ctx } from "../context.ts";
import { localNow, slotLabel } from "../hours.ts";
import type { BookingRow, ContactRow, OfferedSlot, ThreadRow } from "../store/types.ts";
import { shortId } from "../util.ts";
import { buildIcs } from "./ics.ts";
import { applyPolicy, pickSpread, type PartOfDay } from "./slots.ts";
import { SlotTakenError, type SlotCandidate } from "./types.ts";

const OFFER_TTL_MINUTES = 120;

export class BookingError extends Error {
  readonly code: "unknown_service" | "unknown_slot" | "slot_taken" | "provider_error" | "link_mode" | "needs_email" | "not_found" | "no_adapter";
  constructor(code: BookingError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function toOffered(ctx: Ctx, service: ServiceConfig, c: SlotCandidate): OfferedSlot {
  const start = c.start.setZone(ctx.client.config.timezone);
  return {
    slot_id: shortId(`${ctx.client.slug}|${service.id}|${start.toUTC().toISO()}|${c.practitionerId ?? ""}`),
    start: start.toISO()!,
    end: c.end.setZone(ctx.client.config.timezone).toISO()!,
    service_id: service.id,
    practitioner_id: c.practitionerId,
    practitioner: c.practitioner,
    label: slotLabel(ctx.client.config, start, c.practitioner),
  };
}

export async function findSlots(ctx: Ctx, thread: ThreadRow, q: {
  serviceId: string; fromDate?: string; toDate?: string; partOfDay?: PartOfDay; practitioner?: string; isNewPatient: boolean;
}): Promise<{ mode: "direct"; slots: OfferedSlot[] } | { mode: "link"; booking_link: string }> {
  const adapter = await ctx.deps.bookingFor(ctx.client);
  if (!adapter) throw new BookingError("no_adapter", "booking is not configured for this client");
  if (adapter.mode === "link") {
    const link = ctx.client.config.booking?.booking_link;
    if (!link) throw new BookingError("link_mode", "no booking_link configured");
    return { mode: "link", booking_link: link };
  }
  const service = serviceById(ctx.client.config, q.serviceId);
  if (!service) throw new BookingError("unknown_service", `unknown service_id '${q.serviceId}'`);
  if (service.bookable_online === false) throw new BookingError("unknown_service", `${service.name} is booked by the team, not online`);

  const tz = ctx.client.config.timezone;
  const now = localNow(ctx.client.config, ctx.now());
  const horizon = ctx.client.config.booking?.max_days_ahead ?? 60;
  let from = q.fromDate ? DateTime.fromISO(q.fromDate, { zone: tz }).startOf("day") : now;
  if (!from.isValid || from < now) from = now;
  let to = q.toDate ? DateTime.fromISO(q.toDate, { zone: tz }).endOf("day") : from.plus({ days: 14 });
  if (!to.isValid || to <= from) to = from.plus({ days: 14 });
  to = DateTime.min(to, now.plus({ days: horizon }));

  let candidates: SlotCandidate[];
  try {
    candidates = await adapter.findCandidates({ service, from, to });
  } catch (err) {
    await ctx.deps.alerts.recordFailure(ctx.client, "booking availability", err);
    throw new BookingError("provider_error", "the booking system is not responding");
  }
  const allowed = applyPolicy(ctx.client.config, service, candidates, {
    now, isNewPatient: q.isNewPatient, partOfDay: q.partOfDay, practitionerName: q.practitioner,
  });
  const slots = pickSpread(allowed).map((c) => toOffered(ctx, service, c));
  await ctx.store.updateThread(thread.id, { state: { ...thread.state, offered_slots: slots, offered_at: ctx.now().toISOString() } });
  thread.state = { ...thread.state, offered_slots: slots, offered_at: ctx.now().toISOString() };
  return { mode: "direct", slots };
}

/** Only slots this thread was actually offered (and recently) can be booked. */
export function resolveOffered(ctx: Ctx, thread: ThreadRow, slotId: string): OfferedSlot {
  const offeredAt = thread.state.offered_at ? new Date(thread.state.offered_at).getTime() : 0;
  if (ctx.now().getTime() - offeredAt > OFFER_TTL_MINUTES * 60_000) {
    throw new BookingError("unknown_slot", "those times have expired; call check_availability again");
  }
  const slot = thread.state.offered_slots?.find((s) => s.slot_id === slotId);
  if (!slot) throw new BookingError("unknown_slot", `slot_id '${slotId}' was not offered in this conversation; call check_availability first`);
  return slot;
}

function candidateFrom(slot: OfferedSlot): SlotCandidate {
  return { start: DateTime.fromISO(slot.start, { setZone: true }), end: DateTime.fromISO(slot.end, { setZone: true }), practitionerId: slot.practitioner_id, practitioner: slot.practitioner };
}

export async function bookOffered(ctx: Ctx, thread: ThreadRow, contact: ContactRow, slot: OfferedSlot, patient: {
  name: string; email: string | null; isNew: boolean; notes: string;
}): Promise<BookingRow> {
  const adapter = await ctx.deps.bookingFor(ctx.client);
  if (!adapter || adapter.mode === "link") throw new BookingError("link_mode", "direct booking is not available");
  const service = serviceById(ctx.client.config, slot.service_id);
  if (!service) throw new BookingError("unknown_service", "service no longer exists");
  const email = patient.email ?? contact.email;
  if (adapter.requiresEmail && !email) throw new BookingError("needs_email", "this booking system needs the patient's email address; ask for it");
  const cutoff = ctx.client.config.booking?.new_patient_cutoff;
  if (patient.isNew && cutoff && DateTime.fromISO(slot.start, { setZone: true }).setZone(ctx.client.config.timezone).toFormat("HH:mm") > cutoff) {
    throw new BookingError("unknown_slot", `new patients can't start after ${cutoff}; call check_availability with is_new_patient=true and offer an earlier time`);
  }

  // Re-check against the provider immediately before writing (someone may have taken it).
  const candidate = candidateFrom(slot);
  try {
    const fresh = await adapter.findCandidates({ service, from: candidate.start.minus({ minutes: 1 }), to: candidate.end.plus({ minutes: 1 }) });
    if (!fresh.some((c) => c.start.toMillis() === candidate.start.toMillis() && (c.practitionerId ?? "") === (candidate.practitionerId ?? ""))) {
      throw new SlotTakenError("slot no longer available");
    }
    const { externalId } = await adapter.book({
      slot: candidate, service, notes: patient.notes,
      patient: { name: patient.name, phone: contact.phone, email, isNew: patient.isNew },
      idempotencyKey: `${ctx.client.slug}|${thread.id}|${slot.slot_id}`,
    });
    const booking = await ctx.store.upsertBooking({
      client_id: ctx.client.id, contact_id: contact.id, thread_id: thread.id, adapter: adapter.name,
      external_booking_id: externalId, service_id: service.id, practitioner: slot.practitioner,
      starts_at: candidate.start.toUTC().toISO()!, ends_at: candidate.end.toUTC().toISO()!, status: "booked",
    });
    if (patient.name && !contact.name) await ctx.store.updateContact(contact.id, { name: patient.name });
    if (email && !contact.email) await ctx.store.updateContact(contact.id, { email });
    // Booked slots are no longer on offer.
    await ctx.store.updateThread(thread.id, { state: { ...thread.state, offered_slots: [] } });
    thread.state = { ...thread.state, offered_slots: [] };
    await ctx.deps.events.emit(ctx.client, "booking.created", { booking_id: booking.id, service: service.name, starts_at: booking.starts_at });
    if (email) await sendConfirmationEmail(ctx, booking, service, patient.name, email);
    return booking;
  } catch (err) {
    if (err instanceof SlotTakenError) throw new BookingError("slot_taken", "that time was just taken; offer other times");
    if (err instanceof BookingError) throw err;
    await ctx.deps.alerts.recordFailure(ctx.client, "booking write", err);
    throw new BookingError("provider_error", "the booking system did not accept the booking");
  }
}

async function sendConfirmationEmail(ctx: Ctx, booking: BookingRow, service: ServiceConfig, name: string, email: string) {
  const cfg = ctx.client.config;
  if (!cfg.channels.email?.enabled || cfg.booking?.send_ics === false) return;
  const start = DateTime.fromISO(booking.starts_at).setZone(cfg.timezone);
  const ics = buildIcs({
    uid: booking.id, start, end: DateTime.fromISO(booking.ends_at), summary: `${service.name} at ${cfg.name}`,
    location: cfg.business.address, description: `Booked for ${name}. To change it, reply to our message or call ${cfg.business.phone}.`,
    organizerName: cfg.name, now: DateTime.fromJSDate(ctx.now()),
  });
  try {
    await ctx.deps.channels.send(ctx.client, {
      channel: "email", to: email, subject: `Booking confirmed: ${slotLabel(cfg, start)}`,
      text: `Hi ${name},\n\nYou're booked for ${service.name} on ${slotLabel(cfg, start, booking.practitioner)} at ${cfg.business.address}.\n\n${cfg.business.policies?.cancellation ?? ""}\n\n${cfg.name}`,
      attachments: [{ filename: "appointment.ics", contentType: "text/calendar", contentBase64: Buffer.from(ics).toString("base64") }],
    });
  } catch (err) {
    await ctx.deps.alerts.recordFailure(ctx.client, "confirmation email", err);
  }
}

export async function cancelBooking(ctx: Ctx, booking: BookingRow, opts: { confirmLate: boolean; reason: string }):
  Promise<{ cancelled: true; late: boolean } | { cancelled: false; requires_confirmation: true; message: string }> {
  const cfg = ctx.client.config;
  const hours = (new Date(booking.starts_at).getTime() - ctx.now().getTime()) / 3600_000;
  const notice = cfg.business.policies?.cancellation_notice_hours ?? 0;
  const late = hours < notice;
  if (late && !opts.confirmLate) {
    return { cancelled: false, requires_confirmation: true, message: `This is within the ${notice}-hour cancellation window. ${cfg.business.policies?.cancellation ?? ""} Ask the customer to confirm.`.trim() };
  }
  const adapter = await ctx.deps.bookingFor(ctx.client);
  if (!adapter || adapter.mode === "link") throw new BookingError("link_mode", "cancel in the booking system");
  try {
    await adapter.cancel(booking.external_booking_id, opts.reason);
  } catch (err) {
    await ctx.deps.alerts.recordFailure(ctx.client, "booking cancel", err);
    throw new BookingError("provider_error", "the booking system did not accept the cancellation");
  }
  await ctx.store.updateBooking(booking.id, { status: "cancelled" });
  await ctx.deps.events.emit(ctx.client, "booking.cancelled", { booking_id: booking.id, late });
  return { cancelled: true, late };
}

export async function upcomingBookingFor(ctx: Ctx, contactId: string, bookingId: string): Promise<BookingRow> {
  const booking = await ctx.store.getBooking(bookingId);
  if (!booking || booking.client_id !== ctx.client.id || booking.contact_id !== contactId || !["booked", "rescheduled"].includes(booking.status)) {
    throw new BookingError("not_found", `booking '${bookingId}' is not an upcoming booking for this customer`);
  }
  return booking;
}

export function bookingLabel(ctx: Ctx, b: BookingRow): string {
  const service = b.service_id ? serviceById(ctx.client.config, b.service_id) : undefined;
  return `${service?.name ?? "Appointment"}, ${slotLabel(ctx.client.config, DateTime.fromISO(b.starts_at), b.practitioner)}`;
}
