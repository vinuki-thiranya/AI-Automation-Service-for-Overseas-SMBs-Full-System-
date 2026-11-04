// RFC 5545 calendar invite attached to booking confirmations.
import type { DateTime } from "luxon";

const fold = (line: string) => line.match(/.{1,73}/g)?.join("\r\n ") ?? line;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const utc = (dt: DateTime) => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

export function buildIcs(input: {
  uid: string;
  start: DateTime;
  end: DateTime;
  summary: string;
  location: string;
  description: string;
  organizerName: string;
  now: DateTime;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recallo//Booking//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@recallo`,
    `DTSTAMP:${utc(input.now)}`,
    `DTSTART:${utc(input.start)}`,
    `DTEND:${utc(input.end)}`,
    `SUMMARY:${esc(input.summary)}`,
    `LOCATION:${esc(input.location)}`,
    `DESCRIPTION:${esc(input.description)}`,
    `ORGANIZER;CN=${esc(input.organizerName)}:mailto:noreply@recallo.invalid`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(input.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
