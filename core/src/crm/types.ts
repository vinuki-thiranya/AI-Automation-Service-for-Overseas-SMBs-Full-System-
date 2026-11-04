export interface CrmContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  /** Known CRM id (contacts.crm_external_id) — skips the search and makes the write idempotent. */
  externalId: string | null;
}

/** Recallo field name → value. client.json crm.field_mapping maps these to CRM field names. */
export type CrmFields = Record<string, string | number | null>;

export interface CrmAdapter {
  readonly name: string;
  upsertContact(contact: CrmContact, fields: CrmFields): Promise<{ externalId: string }>;
  addNote(externalId: string, text: string): Promise<void>;
}

export function mapFields(mapping: Record<string, string> | undefined, fields: CrmFields, skip: string[] = ["name", "phone", "email"]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(fields)) {
    const target = mapping?.[key];
    if (!target || value === null || skip.includes(key)) continue;
    out[target] = value;
  }
  return out;
}
