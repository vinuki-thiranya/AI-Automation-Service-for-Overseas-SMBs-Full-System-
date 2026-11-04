import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  derivedToken, issueWebchatToken, originAllowed, readWebchatToken, verifyDerivedToken, verifyMetaSignature, verifyTwilioSignature,
} from "../src/ingest/verify.ts";

const secret = "s".repeat(40);

describe("Meta X-Hub-Signature-256", () => {
  const body = Buffer.from('{"entry":[]}');
  const good = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

  it("accepts the exact body", () => expect(verifyMetaSignature("app-secret", body, good)).toBe(true));
  it("rejects a tampered body", () => expect(verifyMetaSignature("app-secret", Buffer.from('{"entry":[1]}'), good)).toBe(false));
  it("rejects missing header or secret", () => {
    expect(verifyMetaSignature("app-secret", body, undefined)).toBe(false);
    expect(verifyMetaSignature("", body, good)).toBe(false);
  });
});

describe("Twilio X-Twilio-Signature", () => {
  const url = "https://ops.example.com/in/demo/sms";
  const params = { To: "+61400000001", From: "+61411111111", Body: "Hi", MessageSid: "SM1" };
  // Reference algorithm from Twilio's docs: URL + params sorted by name, concatenated, HMAC-SHA1, base64.
  const data = url + "Body" + "Hi" + "From" + "+61411111111" + "MessageSid" + "SM1" + "To" + "+61400000001";
  const good = createHmac("sha1", "auth-token").update(data).digest("base64");

  it("accepts the documented construction", () => expect(verifyTwilioSignature("auth-token", url, params, good)).toBe(true));
  it("rejects a different URL", () => expect(verifyTwilioSignature("auth-token", `${url}?x=1`, params, good)).toBe(false));
  it("rejects changed params", () => expect(verifyTwilioSignature("auth-token", url, { ...params, Body: "Hello" }, good)).toBe(false));
});

describe("derived per-client tokens", () => {
  it("round-trips and is client-specific", () => {
    const t = derivedToken(secret, "lead", "demo-clinic");
    expect(verifyDerivedToken(secret, "lead", "demo-clinic", t)).toBe(true);
    expect(verifyDerivedToken(secret, "lead", "other-clinic", t)).toBe(false);
    expect(verifyDerivedToken(secret, "wa-verify", "demo-clinic", t)).toBe(false);
  });
});

describe("web chat session tokens", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  it("round-trips for the issuing client", () => {
    const t = issueWebchatToken(secret, "demo-clinic", "sess-1", now);
    expect(readWebchatToken(secret, "demo-clinic", t, now)).toBe("sess-1");
    expect(readWebchatToken(secret, "other", t, now)).toBeNull();
  });
  it("expires", () => {
    const t = issueWebchatToken(secret, "demo-clinic", "sess-1", now, 1);
    expect(readWebchatToken(secret, "demo-clinic", t, new Date(now.getTime() + 2 * 3600_000))).toBeNull();
  });
  it("rejects a forged payload", () => {
    const t = issueWebchatToken(secret, "demo-clinic", "sess-1", now);
    const [, sig] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify({ c: "demo-clinic", s: "other", e: 9e15 })).toString("base64url")}.${sig}`;
    expect(readWebchatToken(secret, "demo-clinic", forged, now)).toBeNull();
  });
  it("checks origins exactly", () => {
    expect(originAllowed(["https://example.com"], "https://example.com")).toBe(true);
    expect(originAllowed(["https://example.com"], "https://example.com.evil.io")).toBe(false);
    expect(originAllowed(["https://example.com"], undefined)).toBe(false);
  });
});
