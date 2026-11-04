import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const uuid = (): string => randomUUID();

export function hmacHex(key: string, data: string | Buffer, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, key).update(data).digest("hex");
}

export function hmacBase64(key: string, data: string | Buffer, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, key).update(data).digest("base64");
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Constant-time string comparison that is safe for unequal lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Short, stable, URL-safe id derived from input (used for slot ids). */
export function shortId(input: string, length = 8): string {
  return createHash("sha256").update(input).digest("base64url").replace(/[-_]/g, "x").slice(0, length);
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  const first = parts.shift() ?? "";
  return { first, last: parts.join(" ") || "-" };
}

/** Normalises a phone number to E.164 when it is already international; returns null otherwise. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const withPlus = digits.startsWith("+") ? digits : digits.startsWith("00") ? `+${digits.slice(2)}` : null;
  return withPlus && /^\+[1-9]\d{6,14}$/.test(withPlus) ? withPlus : null;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, message: string, body = "") {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Minimal JSON-over-fetch helper shared by every provider adapter. Injectable for tests. */
export type FetchLike = typeof fetch;

export async function requestJson<T = unknown>(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit & { json?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { json, timeoutMs = 15_000, headers, ...rest } = init;
  const res = await fetchFn(url, {
    ...rest,
    headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `${rest.method ?? "GET"} ${new URL(url).pathname} → ${res.status}`, text.slice(0, 2000));
  return (text ? JSON.parse(text) : {}) as T;
}

export function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

/** Serialises async work per key (one in-flight turn per thread). */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await next;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
