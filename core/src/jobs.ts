// Scheduled work, triggered by n8n (scheduler / nightly / reports workflows → POST /v1/jobs/*).
// Every job is idempotent: running it twice in a window sends nothing twice.
import { DateTime } from "luxon";
import { bookingLabel } from "./booking/service.ts";
import { inWhatsAppWindow } from "./compliance.ts";
import { makeCtx, type Ctx, type Deps } from "./context.ts";
import { escalationTimeouts } from "./escalation.ts";
import { localNow } from "./hours.ts";
import { nurtureTick } from "./leads.ts";
import { sendToThread } from "./messaging.ts";
import { rollupDay, sendOwnerReport } from "./reporting.ts";
import type { BookingRow, ContactRow, ThreadRow } from "./store/types.ts";
import { SupabaseStore } from "./store/supabase.ts";
import { errorMessage, firstName } from "./util.ts";

export interface JobReport {
  clients: number;
  results: Record<string, Record<string, number | string>>;
  errors: { client: string; error: string }[];
}

async function forEachClient(deps: Deps, fn: (ctx: Ctx) => Promise<Record<string, number | string>>): Promise<JobReport> {
  const report: JobReport = { clients: 0, results: {}, errors: [] };
  for (const store of deps.allStores()) {
    for (const client of await store.listActiveClients()) {
      report.clients++;
      const ctx = makeCtx(deps, client, store);
      try {
        report.results[client.slug] = await fn(ctx);
      } catch (err) {
        report.errors.push({ client: client.slug, error: errorMessage(err) });
        await deps.alerts.recordFailure(client, "scheduled job", err);
      }
    }
  }
  return report;
}

async function bookingThread(ctx: Ctx, booking: BookingRow, contact: ContactRow): Promise<ThreadRow | null> {
  if (booking.thread_id) {
    const t = await ctx.store.getThread(booking.thread_id);
    if (t) return t;
  }
  const channel = ctx.client.config.channels.whatsapp?.enabled ? "whatsapp" : ctx.client.config.channels.sms?.enabled ? "sms" : null;
  if (!channel || !contact.phone) return null;
  return (await ctx.store.findLatestThread(ctx.client.id, contact.id, channel)) ?? ctx.store.insertThread({ client_id: ctx.client.id, contact_id: contact.id, channel });
}

/** Sends on the thread's channel; WhatsApp outside 24h uses the template, else falls back to SMS. */
async function sendTransactional(ctx: Ctx, thread: ThreadRow, contact: ContactRow, text: string, templateKey: string, params: string[]): Promise<boolean> {
  const cfg = ctx.client.config;
  if (thread.channel === "whatsapp" && !inWhatsAppWindow(thread, ctx.now())) {
    const name = cfg.channels.whatsapp?.templates?.[templateKey];
    if (name) return (await sendToThread(ctx, thread, contact, text, { template: { name, bodyParams: params } })).sent;
    if (cfg.channels.sms?.enabled && contact.phone) {
      const sms = (await ctx.store.findLatestThread(ctx.client.id, contact.id, "sms")) ?? await ctx.store.insertThread({ client_id: ctx.client.id, contact_id: contact.id, channel: "sms" });
      return (await sendToThread(ctx, sms, contact, text)).sent;
    }
    return false;
  }
  return (await sendToThread(ctx, thread, contact, text)).sent;
}

export async function sendReminders(ctx: Ctx): Promise<number> {
  const cfg = ctx.client.config;
  const offsets = cfg.booking?.reminders_hours_before ?? [24, 2];
  const now = ctx.now();
  const horizon = new Date(now.getTime() + Math.max(...offsets) * 3600_000);
  let sent = 0;
  for (const booking of await ctx.store.listBookingsStartingBetween(ctx.client.id, now.toISOString(), horizon.toISOString())) {
    if (booking.status !== "booked" || !booking.contact_id) continue;
    for (const offset of [...offsets].sort((a, b) => b - a)) {
      const key = `${offset}h`;
      if (booking.reminders_sent.includes(key)) continue;
      const start = new Date(booking.starts_at).getTime();
      if (start - now.getTime() > offset * 3600_000) continue;           // not due yet
      const madeInsideWindow = start - new Date(booking.created_at).getTime() < offset * 3600_000;
      booking.reminders_sent = [...booking.reminders_sent, key];
      await ctx.store.updateBooking(booking.id, { reminders_sent: booking.reminders_sent });
      // A smaller offset already due means this one is stale (e.g. job outage): skip silently.
      const smallerDue = offsets.some((o) => o < offset && start - now.getTime() <= o * 3600_000);
      if (madeInsideWindow || smallerDue) continue;
      const contact = await ctx.store.getContact(booking.contact_id);
      if (!contact || contact.opted_out_at) continue;
      const thread = await bookingThread(ctx, booking, contact);
      if (!thread) continue;
      const label = bookingLabel(ctx, booking);
      const text = `Hi ${firstName(contact.name) || "there"}, a reminder of your ${label} at ${cfg.name}, ${cfg.business.address}. Need to change it? Just reply here.`;
      if (await sendTransactional(ctx, thread, contact, text, offset >= 12 ? "reminder_24h" : "reminder_2h", [firstName(contact.name) || "there", label])) sent++;
      break;
    }
  }
  return sent;
}

export async function noShowFollowUps(ctx: Ctx): Promise<number> {
  const cfg = ctx.client.config;
  const adapter = await ctx.deps.bookingFor(ctx.client);
  if (!adapter?.attendance) return 0;
  const now = DateTime.fromJSDate(ctx.now());
  const from = now.minus({ hours: 24 });
  const records = await adapter.attendance(from, now);
  const bookings = await ctx.store.listBookingsStartingBetween(ctx.client.id, from.toUTC().toISO()!, now.toUTC().toISO()!);
  let sent = 0;
  for (const rec of records) {
    const booking = bookings.find((b) => b.external_booking_id === rec.externalId);
    if (!booking || booking.status === rec.status) continue;
    if (booking.status === "booked") await ctx.store.updateBooking(booking.id, { status: rec.status });
    if (rec.status !== "no_show" || !booking.contact_id) continue;
    const due = new Date(booking.ends_at).getTime() + (cfg.booking?.no_show_followup_minutes ?? 30) * 60_000;
    if (due > ctx.now().getTime() || !(await ctx.store.markOnce(ctx.client.id, `noshow:${booking.id}`))) continue;
    const contact = await ctx.store.getContact(booking.contact_id);
    if (!contact || contact.opted_out_at) continue;
    const thread = await bookingThread(ctx, booking, contact);
    if (!thread) continue;
    const text = `Hi ${firstName(contact.name) || "there"}, we missed you today at ${cfg.name}. No problem at all. Would you like me to find you a new time?`;
    if (await sendTransactional(ctx, thread, contact, text, "no_show", [firstName(contact.name) || "there"])) sent++;
  }
  return sent;
}

/** Every 5 minutes. */
export function runTick(deps: Deps): Promise<JobReport> {
  return forEachClient(deps, async (ctx) => {
    const reminders = await sendReminders(ctx);
    const noShows = await noShowFollowUps(ctx).catch(async (err) => { await deps.alerts.recordFailure(ctx.client, "no-show check", err); return 0; });
    const nurture = await nurtureTick(ctx);
    const esc = await escalationTimeouts(ctx);
    return { reminders, noShows, nurture, ownerPinged: esc.ownerPinged, escalationsExpired: esc.expired };
  });
}

/** Nightly: roll up yesterday and today-so-far; purge expired transcripts (Supabase). */
export async function runNightly(deps: Deps): Promise<JobReport> {
  const report = await forEachClient(deps, async (ctx) => {
    const today = localNow(ctx.client.config, ctx.now());
    await rollupDay(ctx, today.minus({ days: 1 }).toISODate()!);
    await rollupDay(ctx, today.toISODate()!);
    return { rolledUp: 2 };
  });
  for (const store of deps.allStores()) {
    if (!(store instanceof SupabaseStore)) continue;
    const res = await store.db.rpc("purge_expired_transcripts");
    if (res.error) await deps.alerts.notify("purge", `retention purge failed: ${res.error.message}`, 24 * 60);
  }
  return report;
}

/** Hourly: daily digest at 07:00 local, weekly report on the configured day/time. */
export function runReports(deps: Deps): Promise<JobReport> {
  return forEachClient(deps, async (ctx) => {
    const cfg = ctx.client.config;
    const now = localNow(cfg, ctx.now());
    const yesterday = now.minus({ days: 1 }).toISODate()!;
    let daily = 0;
    let weekly = 0;
    if (cfg.reporting.daily_digest !== false && now.hour === 7 && await ctx.store.markOnce(ctx.client.id, `digest:${yesterday}`)) {
      await rollupDay(ctx, yesterday);
      if (await sendOwnerReport(ctx, "daily", yesterday)) daily++;
    }
    const [wh] = (cfg.reporting.weekly_time ?? "07:30").split(":").map(Number) as [number];
    const weekday = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][now.weekday - 1];
    if (weekday === (cfg.reporting.weekly_day ?? "mon") && now.hour === wh && await ctx.store.markOnce(ctx.client.id, `weekly:${now.toISODate()}`)) {
      if (await sendOwnerReport(ctx, "weekly", yesterday)) weekly++;
    }
    return { daily, weekly };
  });
}
