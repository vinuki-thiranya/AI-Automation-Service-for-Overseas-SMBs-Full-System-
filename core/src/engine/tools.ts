// Tools the conversation model can call (spec §4.2). Every input is validated here: the model's
// arguments are untrusted, and only slots/bookings that belong to this thread and customer are accepted.
import { z } from "zod";
import { BookingError, bookOffered, bookingLabel, cancelBooking, findSlots, resolveOffered, upcomingBookingFor } from "../booking/service.ts";
import type { Ctx } from "../context.ts";
import { openEscalation, type EscalationReason } from "../escalation.ts";
import { startLeadFlow } from "../leads.ts";
import type { ToolOutcome, ToolSpec } from "../llm/types.ts";
import { sendToThread } from "../messaging.ts";
import type { ContactRow, ThreadRow } from "../store/types.ts";
import { errorMessage } from "../util.ts";

export interface ToolEnv {
  ctx: Ctx;
  thread: ThreadRow;
  contact: ContactRow;
  /** Set when a tool escalated, so the engine knows the thread is now with a human. */
  escalated: boolean;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schemas = {
  check_availability: z.object({
    service_id: z.string(),
    from_date: dateStr.optional(),
    to_date: dateStr.optional(),
    part_of_day: z.enum(["morning", "afternoon", "evening"]).optional(),
    practitioner: z.string().max(80).optional(),
    is_new_patient: z.boolean().optional(),
  }),
  book_appointment: z.object({
    slot_id: z.string().max(32),
    patient_name: z.string().min(2).max(120),
    is_new_patient: z.boolean(),
    email: z.string().email().optional(),
    notes: z.string().max(300).optional(),
  }),
  reschedule: z.object({ booking_id: z.string().max(64), new_slot_id: z.string().max(32) }),
  cancel: z.object({
    booking_id: z.string().max(64),
    confirm_late_cancellation: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  }),
  create_lead: z.object({ interest: z.string().max(300), notes: z.string().max(300).optional() }),
  escalate_to_human: z.object({
    reason: z.enum(["customer_request", "low_confidence", "complaint", "emergency", "tool_failure"]),
    summary: z.string().min(5).max(600),
    urgent: z.boolean().optional(),
  }),
  send_document: z.object({ document_id: z.string().max(64) }),
};

type ToolName = keyof typeof schemas;

export function toolSpecs(ctx: Ctx): ToolSpec[] {
  const cfg = ctx.client.config;
  const serviceIds = cfg.business.services.map((s) => s.id);
  const specs: ToolSpec[] = [];
  if (cfg.booking) {
    specs.push(
      {
        name: "check_availability",
        description: "Find open appointment times for a service. Returns up to 6 slots with slot_id and label (or a booking link in link-out mode). Call again with different dates or part_of_day if none suit.",
        input_schema: {
          type: "object", additionalProperties: false, required: ["service_id"],
          properties: {
            service_id: { type: "string", enum: serviceIds },
            from_date: { type: "string", description: "YYYY-MM-DD, practice timezone. Defaults to today." },
            to_date: { type: "string", description: "YYYY-MM-DD. Defaults to 14 days after from_date." },
            part_of_day: { type: "string", enum: ["morning", "afternoon", "evening"] },
            practitioner: { type: "string", description: "Practitioner name if the customer asked for someone specific." },
            is_new_patient: { type: "boolean" },
          },
        },
      },
      {
        name: "book_appointment",
        description: "Book one of the slots offered in this conversation. Only use a slot_id returned by check_availability. Needs the patient's full name.",
        input_schema: {
          type: "object", additionalProperties: false, required: ["slot_id", "patient_name", "is_new_patient"],
          properties: {
            slot_id: { type: "string" },
            patient_name: { type: "string" },
            is_new_patient: { type: "boolean" },
            email: { type: "string", description: "Only if the customer gave it." },
            notes: { type: "string", description: "Short admin note. No health details beyond the reason for the visit." },
          },
        },
      },
      {
        name: "reschedule",
        description: "Move one of the customer's upcoming bookings (booking_id from the turn context) to a newly offered slot_id.",
        input_schema: {
          type: "object", additionalProperties: false, required: ["booking_id", "new_slot_id"],
          properties: { booking_id: { type: "string" }, new_slot_id: { type: "string" } },
        },
      },
      {
        name: "cancel",
        description: "Cancel one of the customer's upcoming bookings. If it is inside the cancellation window the tool asks you to confirm with the customer first; then call again with confirm_late_cancellation=true.",
        input_schema: {
          type: "object", additionalProperties: false, required: ["booking_id"],
          properties: { booking_id: { type: "string" }, confirm_late_cancellation: { type: "boolean" }, reason: { type: "string" } },
        },
      },
    );
  }
  if (cfg.lead_qualification) {
    specs.push({
      name: "create_lead",
      description: "Start lead qualification for someone interested in a treatment who isn't booking yet. Returns the first question to ask.",
      input_schema: {
        type: "object", additionalProperties: false, required: ["interest"],
        properties: { interest: { type: "string" }, notes: { type: "string" } },
      },
    });
  }
  specs.push({
    name: "escalate_to_human",
    description: "Hand the conversation to a staff member. Use when the customer asks for a person, is upset, or you can't answer reliably. The AI pauses on this conversation while staff reply.",
    input_schema: {
      type: "object", additionalProperties: false, required: ["reason", "summary"],
      properties: {
        reason: { type: "string", enum: ["customer_request", "low_confidence", "complaint", "emergency", "tool_failure"] },
        summary: { type: "string", description: "One or two sentences for staff: who, what they need, what you've told them." },
        urgent: { type: "boolean" },
      },
    },
  });
  if (cfg.business.documents?.length) {
    specs.push({
      name: "send_document",
      description: "Send the customer one of the practice's documents (as a link message).",
      input_schema: {
        type: "object", additionalProperties: false, required: ["document_id"],
        properties: { document_id: { type: "string", enum: cfg.business.documents.map((d) => d.id) } },
      },
    });
  }
  return specs;
}

const ok = (data: Record<string, unknown>): ToolOutcome => ({ content: JSON.stringify({ ok: true, ...data }) });
const fail = (error: string, extra: Record<string, unknown> = {}): ToolOutcome => ({ content: JSON.stringify({ ok: false, error, ...extra }), isError: true });

export async function executeTool(env: ToolEnv, name: string, rawInput: unknown): Promise<ToolOutcome> {
  if (!(name in schemas)) return fail(`unknown tool ${name}`);
  const parsed = schemas[name as ToolName].safeParse(rawInput);
  if (!parsed.success) return fail(`invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const { ctx, thread, contact } = env;
  try {
    switch (name as ToolName) {
      case "check_availability": {
        const input = parsed.data as z.infer<typeof schemas.check_availability>;
        const res = await findSlots(ctx, thread, {
          serviceId: input.service_id, fromDate: input.from_date, toDate: input.to_date, partOfDay: input.part_of_day,
          // Unknown is not "new": a returning patient may text from a new number. The new-patient
          // cutoff is enforced again at booking time, when is_new_patient is required.
          practitioner: input.practitioner, isNewPatient: input.is_new_patient ?? false,
        });
        if (res.mode === "link") return ok({ mode: "link", booking_link: res.booking_link, instruction: "Share this link so the customer can choose a time." });
        if (res.slots.length === 0) return ok({ slots: [], instruction: "No times in that range. Offer to look at other dates, or to have the team call." });
        return ok({ slots: res.slots.map((s) => ({ slot_id: s.slot_id, label: s.label })) });
      }
      case "book_appointment": {
        const input = parsed.data as z.infer<typeof schemas.book_appointment>;
        const slot = resolveOffered(ctx, thread, input.slot_id);
        const booking = await bookOffered(ctx, thread, contact, slot, {
          name: input.patient_name, email: input.email ?? null, isNew: input.is_new_patient, notes: input.notes ?? "",
        });
        return ok({ booking_id: booking.id, when: slot.label, service: slot.service_id });
      }
      case "reschedule": {
        const input = parsed.data as z.infer<typeof schemas.reschedule>;
        const old = await upcomingBookingFor(ctx, contact.id, input.booking_id);
        const slot = resolveOffered(ctx, thread, input.new_slot_id);
        const booking = await bookOffered(ctx, thread, contact, slot, { name: contact.name ?? "Patient", email: null, isNew: false, notes: "Rescheduled" });
        await cancelBooking(ctx, old, { confirmLate: true, reason: "Rescheduled by patient" });
        await ctx.store.updateBooking(old.id, { status: "rescheduled" });
        await ctx.deps.events.emit(ctx.client, "booking.rescheduled", { from: old.id, to: booking.id });
        return ok({ booking_id: booking.id, when: slot.label, previous: bookingLabel(ctx, old) });
      }
      case "cancel": {
        const input = parsed.data as z.infer<typeof schemas.cancel>;
        const booking = await upcomingBookingFor(ctx, contact.id, input.booking_id);
        const res = await cancelBooking(ctx, booking, { confirmLate: input.confirm_late_cancellation ?? false, reason: input.reason ?? "Cancelled by patient" });
        return res.cancelled ? ok({ cancelled: true, late: res.late, booking: bookingLabel(ctx, booking) }) : ok({ ...res });
      }
      case "create_lead": {
        const input = parsed.data as z.infer<typeof schemas.create_lead>;
        const { lead, question } = await startLeadFlow(ctx, thread, contact, { source: thread.channel });
        await ctx.store.audit(ctx.client.id, "core:tools", "lead_started", { lead_id: lead.id, interest: input.interest });
        return ok({ lead_id: lead.id, first_question: question, instruction: question ? "Ask this question now, word for word or close to it." : "All questions already answered." });
      }
      case "escalate_to_human": {
        const input = parsed.data as z.infer<typeof schemas.escalate_to_human>;
        await openEscalation(ctx, thread, contact, { reason: input.reason as EscalationReason, summary: input.summary, urgent: input.urgent });
        env.escalated = true;
        return ok({ instruction: "A team member has been notified. Tell the customer someone will reply shortly. Don't promise a specific time." });
      }
      case "send_document": {
        const input = parsed.data as z.infer<typeof schemas.send_document>;
        const doc = ctx.client.config.business.documents?.find((d) => d.id === input.document_id);
        if (!doc) return fail(`unknown document_id ${input.document_id}`);
        const res = await sendToThread(ctx, thread, contact, `${doc.name}: ${doc.url}`, { metadata: { document_id: doc.id } });
        return res.sent ? ok({ sent: doc.name }) : fail("could not send the document", { url: doc.url, instruction: "Include the link in your reply instead." });
      }
    }
  } catch (err) {
    if (err instanceof BookingError) return fail(err.message, { code: err.code });
    await ctx.deps.alerts.recordFailure(ctx.client, `tool ${name}`, err);
    return fail("internal error; apologise and offer to have the team follow up", { detail: errorMessage(err).slice(0, 200) });
  }
}
