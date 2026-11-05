import { readFileSync } from "node:fs";
import path from "node:path";
import type { DemoFacts } from "@/lib/demo-engine";

// The try-it demo on the site answers from the same files the real demo clinic runs on
// (config/clients/demo-clinic.json and its FAQ), read at build time, so prices and hours can't drift.
const CONFIG_DIR = path.join(process.cwd(), "..", "config", "clients");

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface ClinicConfig {
  name: string;
  persona?: { persona_name?: string };
  business: {
    parking: string;
    address: string;
    hours: Record<Day, { open: string; close: string }[]>;
    services: { name: string; duration_minutes: number; price: { amount: number; currency: string }; price_note?: string }[];
    policies: { cancellation: string; payment: string; insurance: string };
    staff: { name: string; role: string }[];
  };
}

const DAY_NAMES: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** "08:00" → "8am", "19:30" → "7:30pm" */
function time(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix}`;
}

function personaName(raw: string): string {
  return /"persona_name":\s*"([^"]+)"/.exec(raw)?.[1] ?? "Ava";
}

/** "## Question\nAnswer" blocks from the FAQ file. */
function faq(markdown: string): { q: string; a: string }[] {
  return markdown.split(/^## /m).slice(1).map((block) => {
    const [q = "", ...rest] = block.trim().split("\n");
    return { q: q.trim(), a: rest.join(" ").trim() };
  });
}

export function getDemoFacts(): DemoFacts {
  const raw = readFileSync(path.join(CONFIG_DIR, "demo-clinic.json"), "utf8");
  const config = JSON.parse(raw) as ClinicConfig;
  const b = config.business;
  return {
    clinic: config.name.replace(/\s*\(demo\)\s*$/i, ""),
    assistant: personaName(raw),
    hours: (Object.keys(DAY_NAMES) as Day[]).map((d) => ({
      day: DAY_NAMES[d],
      text: b.hours[d].length ? b.hours[d].map((s) => `${time(s.open)} to ${time(s.close)}`).join(", ") : "closed",
    })),
    services: b.services.map((s) => ({ name: s.name, minutes: s.duration_minutes, price: s.price.amount, note: s.price_note })),
    parking: b.parking,
    address: b.address,
    cancellation: b.policies.cancellation,
    payment: b.policies.payment,
    insurance: b.policies.insurance,
    dentist: b.staff.find((s) => /dentist/i.test(s.role))?.name ?? "the dentist",
    manager: b.staff.find((s) => /manager/i.test(s.role))?.name.split(" ")[0] ?? "the team",
    faq: faq(readFileSync(path.join(CONFIG_DIR, "demo-clinic.faq.md"), "utf8")),
  };
}
