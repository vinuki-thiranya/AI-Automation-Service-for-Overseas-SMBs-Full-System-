// CRM sync (spec §4.5). The CRM owns contact details; Nuvadesk owns transcripts (added as notes/links).
// Every write is idempotent: use the stored external id, else search by email/phone, else create.
import type { Client } from "../config/index.ts";
import type { AppEnv } from "../env.ts";
import { getJsonSecret, type SecretResolver } from "../secrets.ts";
import { GoogleTokenSource } from "../booking/google-calendar.ts";
import { requestJson, splitName, type FetchLike } from "../util.ts";
import { mapFields, type CrmAdapter, type CrmContact, type CrmFields } from "./types.ts";

// ---------------------------------------------------------------------------- HubSpot (private app token)
export class HubSpotCrm implements CrmAdapter {
  readonly name = "hubspot";
  private readonly token: string;
  private readonly mapping: Record<string, string> | undefined;
  private readonly fetchFn: FetchLike;

  constructor(token: string, mapping: Record<string, string> | undefined, fetchFn: FetchLike) {
    this.token = token;
    this.mapping = mapping;
    this.fetchFn = fetchFn;
  }

  private req<T>(path: string, init: { method?: string; json?: unknown } = {}) {
    return requestJson<T>(this.fetchFn, `https://api.hubapi.com${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}` } });
  }

  private async search(contact: CrmContact): Promise<string | null> {
    const filters = [
      contact.email ? { propertyName: "email", operator: "EQ", value: contact.email } : null,
      contact.phone ? { propertyName: "phone", operator: "EQ", value: contact.phone } : null,
    ].filter(Boolean);
    for (const f of filters) {
      const res = await this.req<{ results: { id: string }[] }>("/crm/v3/objects/contacts/search", {
        method: "POST", json: { filterGroups: [{ filters: [f] }], limit: 1 },
      });
      if (res.results[0]) return res.results[0].id;
    }
    return null;
  }

  async upsertContact(contact: CrmContact, fields: CrmFields) {
    const { first, last } = splitName(contact.name ?? "");
    const properties = {
      ...(contact.name ? { firstname: first, lastname: last === "-" ? "" : last } : {}),
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...mapFields(this.mapping, fields),
    };
    const id = contact.externalId ?? await this.search(contact);
    if (id) {
      await this.req(`/crm/v3/objects/contacts/${id}`, { method: "PATCH", json: { properties } });
      return { externalId: id };
    }
    const created = await this.req<{ id: string }>("/crm/v3/objects/contacts", { method: "POST", json: { properties } });
    return { externalId: created.id };
  }

  async addNote(externalId: string, text: string) {
    await this.req("/crm/v3/objects/notes", {
      method: "POST",
      json: {
        properties: { hs_note_body: text, hs_timestamp: new Date().toISOString() },
        // 202 = HubSpot-defined association "note to contact".
        associations: [{ to: { id: externalId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
      },
    });
  }
}

// ---------------------------------------------------------------------------- Pipedrive (API token, v2 persons)
export class PipedriveCrm implements CrmAdapter {
  readonly name = "pipedrive";
  private readonly token: string;
  private readonly mapping: Record<string, string> | undefined;
  private readonly fetchFn: FetchLike;

  constructor(token: string, mapping: Record<string, string> | undefined, fetchFn: FetchLike) {
    this.token = token;
    this.mapping = mapping;
    this.fetchFn = fetchFn;
  }

  private req<T>(path: string, init: { method?: string; json?: unknown } = {}) {
    return requestJson<T>(this.fetchFn, `https://api.pipedrive.com${path}`, { ...init, headers: { "x-api-token": this.token } });
  }

  async upsertContact(contact: CrmContact, fields: CrmFields) {
    let id = contact.externalId;
    for (const [term, field] of [[contact.email, "email"], [contact.phone, "phone"]] as const) {
      if (id || !term) continue;
      const res = await this.req<{ data?: { items?: { item: { id: number } }[] } }>(
        `/api/v2/persons/search?term=${encodeURIComponent(term)}&fields=${field}&exact_match=true&limit=1`);
      const hit = res.data?.items?.[0]?.item.id;
      if (hit) id = String(hit);
    }
    const body = {
      ...(contact.name ? { name: contact.name } : {}),
      ...(contact.email ? { emails: [{ value: contact.email, primary: true, label: "work" }] } : {}),
      ...(contact.phone ? { phones: [{ value: contact.phone, primary: true, label: "mobile" }] } : {}),
      ...(Object.keys(mapFields(this.mapping, fields)).length ? { custom_fields: mapFields(this.mapping, fields) } : {}),
    };
    if (id) {
      await this.req(`/api/v2/persons/${id}`, { method: "PATCH", json: body });
      return { externalId: id };
    }
    const created = await this.req<{ data: { id: number } }>("/api/v2/persons", { method: "POST", json: { name: contact.name ?? contact.phone ?? contact.email, ...body } });
    return { externalId: String(created.data.id) };
  }

  async addNote(externalId: string, text: string) {
    await this.req("/api/v1/notes", { method: "POST", json: { content: text, person_id: Number(externalId) } });
  }
}

// ---------------------------------------------------------------------------- GoHighLevel (private integration token, v2)
export class GoHighLevelCrm implements CrmAdapter {
  readonly name = "gohighlevel";
  private readonly token: string;
  private readonly locationId: string;
  private readonly mapping: Record<string, string> | undefined;
  private readonly fetchFn: FetchLike;

  constructor(token: string, locationId: string, mapping: Record<string, string> | undefined, fetchFn: FetchLike) {
    this.token = token;
    this.locationId = locationId;
    this.mapping = mapping;
    this.fetchFn = fetchFn;
  }

  private req<T>(path: string, init: { method?: string; json?: unknown } = {}) {
    return requestJson<T>(this.fetchFn, `https://services.leadconnectorhq.com${path}`, {
      ...init, headers: { Authorization: `Bearer ${this.token}`, Version: "2021-07-28" },
    });
  }

  async upsertContact(contact: CrmContact, fields: CrmFields) {
    const { first, last } = splitName(contact.name ?? "");
    const custom = mapFields(this.mapping, fields);
    // /contacts/upsert de-duplicates on email/phone per the location's duplicate settings.
    const res = await this.req<{ contact: { id: string } }>("/contacts/upsert", {
      method: "POST",
      json: {
        locationId: this.locationId,
        ...(contact.name ? { firstName: first, lastName: last === "-" ? "" : last, name: contact.name } : {}),
        ...(contact.email ? { email: contact.email } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        source: String(fields.source ?? "Nuvadesk"),
        customFields: Object.entries(custom).map(([key, field_value]) => ({ key, field_value })),
      },
    });
    return { externalId: res.contact.id };
  }

  async addNote(externalId: string, text: string) {
    await this.req(`/contacts/${externalId}/notes`, { method: "POST", json: { body: text } });
  }
}

// ---------------------------------------------------------------------------- Google Sheets (one row per contact)
export class GoogleSheetsCrm implements CrmAdapter {
  readonly name = "google_sheets";
  private readonly tokens: GoogleTokenSource;
  private readonly sheetId: string;
  private readonly tab: string;
  private readonly mapping: Record<string, string>;
  private readonly fetchFn: FetchLike;

  constructor(tokens: GoogleTokenSource, sheetId: string, tab: string, mapping: Record<string, string> | undefined, fetchFn: FetchLike) {
    this.tokens = tokens;
    this.sheetId = sheetId;
    this.tab = tab;
    this.mapping = mapping ?? { name: "Name", phone: "Phone", email: "Email" };
    this.fetchFn = fetchFn;
  }

  private async req<T>(path: string, init: { method?: string; json?: unknown } = {}) {
    return requestJson<T>(this.fetchFn, `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}${path}`, {
      ...init, headers: { Authorization: `Bearer ${await this.tokens.get()}` },
    });
  }

  async upsertContact(contact: CrmContact, fields: CrmFields) {
    const range = encodeURIComponent(`${this.tab}!A1:Z`);
    const sheet = await this.req<{ values?: string[][] }>(`/values/${range}`);
    const rows = sheet.values ?? [];
    let header = rows[0] ?? [];
    const all: CrmFields = { ...fields, name: contact.name, phone: contact.phone, email: contact.email };
    const wanted = Object.entries(this.mapping).filter(([k]) => k in all).map(([, col]) => col);
    if (header.length === 0 || wanted.some((c) => !header.includes(c))) {
      header = [...header, ...wanted.filter((c) => !header.includes(c))];
      await this.req(`/values/${encodeURIComponent(`${this.tab}!A1`)}?valueInputOption=RAW`, { method: "PUT", json: { values: [header] } });
    }
    const col = (key: string) => header.indexOf(this.mapping[key] ?? "");
    const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-9);
    let rowIndex = contact.externalId ? Number(contact.externalId) : -1;
    if (rowIndex < 2) {
      rowIndex = rows.findIndex((r, i) => i > 0 && (
        (contact.phone && col("phone") >= 0 && digits(r[col("phone")]) === digits(contact.phone)) ||
        (contact.email && col("email") >= 0 && (r[col("email")] ?? "").toLowerCase() === contact.email.toLowerCase()))) + 1;
    }
    const existing = rowIndex >= 2 ? rows[rowIndex - 1] ?? [] : [];
    const row = header.map((h, i) => {
      const key = Object.keys(this.mapping).find((k) => this.mapping[k] === h);
      const value = key ? all[key] : undefined;
      return value === undefined || value === null ? existing[i] ?? "" : String(value);
    });
    if (rowIndex >= 2) {
      await this.req(`/values/${encodeURIComponent(`${this.tab}!A${rowIndex}`)}?valueInputOption=RAW`, { method: "PUT", json: { values: [row] } });
      return { externalId: String(rowIndex) };
    }
    const appended = await this.req<{ updates?: { updatedRange?: string } }>(
      `/values/${encodeURIComponent(`${this.tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", json: { values: [row] } });
    const m = appended.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
    return { externalId: m?.[1] ?? String(rows.length + 1) };
  }

  async addNote(): Promise<void> {
    // Sheets has no notes; the transcript link lives in its own column via field_mapping.transcript_url.
  }
}

export async function createCrmAdapter(client: Client, env: AppEnv, secrets: SecretResolver, fetchFn: FetchLike): Promise<CrmAdapter | null> {
  const crm = client.config.crm;
  if (!crm || crm.adapter === "none") return null;
  if (!crm.credential) throw new Error(`crm.credential is required for ${crm.adapter}`);
  switch (crm.adapter) {
    case "hubspot": return new HubSpotCrm(await secrets.get(crm.credential), crm.field_mapping, fetchFn);
    case "pipedrive": return new PipedriveCrm(await secrets.get(crm.credential), crm.field_mapping, fetchFn);
    case "gohighlevel":
      if (!crm.account_id) throw new Error("crm.account_id (GoHighLevel location id) is required");
      return new GoHighLevelCrm(await secrets.get(crm.credential), crm.account_id, crm.field_mapping, fetchFn);
    case "google_sheets": {
      if (!crm.sheet_id) throw new Error("crm.sheet_id is required");
      const { refresh_token } = await getJsonSecret<{ refresh_token: string }>(secrets, crm.credential);
      const tokens = new GoogleTokenSource({ clientId: env.googleOAuth.clientId, clientSecret: env.googleOAuth.clientSecret, refreshToken: refresh_token }, fetchFn);
      return new GoogleSheetsCrm(tokens, crm.sheet_id, crm.sheet_tab ?? "Leads", crm.field_mapping, fetchFn);
    }
  }
}
