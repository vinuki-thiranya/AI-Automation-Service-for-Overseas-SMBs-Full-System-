import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { RecalloClientConfiguration } from "./client-config.ts";

export type ClientConfig = RecalloClientConfiguration;
export type ServiceConfig = ClientConfig["business"]["services"][number];
export type BookingConfig = NonNullable<ClientConfig["booking"]>;
export type LeadConfig = NonNullable<ClientConfig["lead_qualification"]>;
export type LeadQuestion = LeadConfig["questions"][number];
export type CrmConfig = NonNullable<ClientConfig["crm"]>;
export type EscalationConfig = ClientConfig["escalation"];
export type ModelRef = ClientConfig["assistant"]["llm"]["primary"];
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** A provisioned client: its Supabase row id plus the validated client.json. */
export interface Client {
  id: string;
  slug: string;
  region: ClientConfig["region"];
  status: NonNullable<ClientConfig["status"]>;
  config: ClientConfig;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const SCHEMA_PATH = path.join(REPO_ROOT, "config/client.schema.json");

// ajv-formats ships CommonJS; under native ESM the plugin may arrive as .default.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (
  ajv: Ajv2020,
) => void;

let validator: ((data: unknown) => boolean) & { errors?: unknown } | undefined;

function getValidator() {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    validator = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
  }
  return validator;
}

export class ConfigError extends Error {
  readonly details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.details = details;
  }
}

/** Validates a parsed client.json against config/client.schema.json. */
export function validateClientConfig(data: unknown): ClientConfig {
  const validate = getValidator();
  if (!validate(data)) {
    const errors = (validate.errors ?? []) as { instancePath: string; message?: string }[];
    const summary = errors.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).join("; ");
    throw new ConfigError(`invalid client config: ${summary}`, errors);
  }
  return data as ClientConfig;
}

export function readClientConfigFile(file: string): ClientConfig {
  return validateClientConfig(JSON.parse(readFileSync(file, "utf8")));
}

export function serviceById(config: ClientConfig, id: string): ServiceConfig | undefined {
  return config.business.services.find((s) => s.id === id);
}
