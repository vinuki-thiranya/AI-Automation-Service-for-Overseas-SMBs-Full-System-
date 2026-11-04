import type { DateTime } from "luxon";
import type { ServiceConfig } from "../config/index.ts";

export interface SlotCandidate {
  start: DateTime;
  end: DateTime;
  practitionerId: string | null;
  practitioner: string | null;
}

export interface PatientDetails {
  name: string;
  phone: string | null;
  email: string | null;
  isNew: boolean;
}

export interface BookInput {
  slot: SlotCandidate;
  service: ServiceConfig;
  patient: PatientDetails;
  notes: string;
  /** Stable per (client, thread, slot): retries of the same booking must not double-book. */
  idempotencyKey: string;
}

export interface AttendanceRecord {
  externalId: string;
  status: "attended" | "no_show";
}

export interface BookingAdapter {
  readonly name: string;
  /** direct: books through the API. link: sends booking_link (Jane, or no API access). */
  readonly mode: "direct" | "link";
  /** Patient email is mandatory for this provider (Acuity, Calendly). */
  readonly requiresEmail: boolean;
  findCandidates(q: { service: ServiceConfig; from: DateTime; to: DateTime }): Promise<SlotCandidate[]>;
  book(input: BookInput): Promise<{ externalId: string }>;
  cancel(externalId: string, reason: string): Promise<void>;
  attendance?(from: DateTime, to: DateTime): Promise<AttendanceRecord[]>;
}

export class SlotTakenError extends Error {}
