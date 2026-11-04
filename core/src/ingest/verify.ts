// Webhook authenticity (spec §5 Security): verify before any processing.
import { hmacBase64, hmacHex, safeEqual } from "../util.ts";

/** Meta: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function verifyMetaSignature(appSecret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  return safeEqual(header, `sha256=${hmacHex(appSecret, rawBody)}`);
}

/**
 * Twilio: X-Twilio-Signature = base64(HMAC-SHA1(auth token, full URL + each POST param name+value, sorted by name)).
 * `url` must be exactly what Twilio called (public https URL, including any query string).
 */
export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, header: string | undefined): boolean {
  if (!authToken || !header) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return safeEqual(header, hmacBase64(authToken, data, "sha1"));
}

/** Per-client tokens derived from CORE_SECRET, so nothing extra has to be stored. */
export function derivedToken(coreSecret: string, purpose: "lead" | "wa-verify" | "telegram", clientSlug: string): string {
  return hmacHex(coreSecret, `${purpose}:${clientSlug}`).slice(0, 40);
}

export function verifyDerivedToken(coreSecret: string, purpose: "lead" | "wa-verify" | "telegram", clientSlug: string, token: string | undefined): boolean {
  return !!token && !!coreSecret && safeEqual(token, derivedToken(coreSecret, purpose, clientSlug));
}

/** Web chat session token: base64url(json).hmac — identifies the browser session for one client. */
export function issueWebchatToken(coreSecret: string, clientSlug: string, sessionId: string, now: Date, ttlHours = 24 * 30): string {
  const payload = Buffer.from(JSON.stringify({ c: clientSlug, s: sessionId, e: now.getTime() + ttlHours * 3600_000 })).toString("base64url");
  return `${payload}.${hmacHex(coreSecret, `webchat:${payload}`).slice(0, 32)}`;
}

export function readWebchatToken(coreSecret: string, clientSlug: string, token: string | undefined, now: Date): string | null {
  if (!token || !coreSecret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, hmacHex(coreSecret, `webchat:${payload}`).slice(0, 32))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { c: string; s: string; e: number };
    return data.c === clientSlug && data.e > now.getTime() ? data.s : null;
  } catch {
    return null;
  }
}

export function originAllowed(allowed: string[] | undefined, origin: string | undefined): boolean {
  if (!origin) return false;
  return (allowed ?? []).some((a) => {
    try {
      return new URL(a).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  });
}
