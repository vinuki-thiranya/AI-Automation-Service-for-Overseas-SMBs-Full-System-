// HTTP layer: signature checks, routing and job auth, via Fastify's inject (no sockets).
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { derivedToken } from "../src/ingest/verify.ts";
import { MapSecrets } from "../src/secrets.ts";
import { buildServer } from "../src/server.ts";
import { createHarness, TEST_ENV } from "../src/testing.ts";
import { demoConfig, TUESDAY_11AM_SYDNEY } from "./fixtures.ts";

function setup() {
  const h = createHarness(demoConfig((c) => { c.channels.whatsapp!.phone_number_id = "PNID"; }), { now: TUESDAY_11AM_SYDNEY });
  h.deps.secrets = new MapSecrets({ "demo-clinic/twilio": JSON.stringify({ account_sid: "AC1", auth_token: "twilio-token" }) });
  return { h, app: buildServer(h.deps) };
}

const waBody = (text: string, id = "wamid.A") => JSON.stringify({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: "PNID" },
    contacts: [{ wa_id: "61411111111", profile: { name: "Alex" } }],
    messages: [{ from: "61411111111", id, timestamp: String(TUESDAY_11AM_SYDNEY.getTime() / 1000), type: "text", text: { body: text } }],
  } }] }],
});
const metaSig = (body: string) => `sha256=${createHmac("sha256", TEST_ENV.metaAppSecret).update(body).digest("hex")}`;
/** Webhooks are acknowledged first and processed in the background: poll until the reply was sent. */
async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for background processing");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("WhatsApp webhook", () => {
  it("answers Meta's verification challenge only with the client's verify token", async () => {
    const { app } = setup();
    const token = derivedToken(TEST_ENV.coreSecret, "wa-verify", "demo-clinic");
    const ok = await app.inject({ url: `/in/demo-clinic/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=42` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("42");
    const bad = await app.inject({ url: "/in/demo-clinic/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42" });
    expect(bad.statusCode).toBe(403);
  });

  it("rejects bad signatures and processes signed messages", async () => {
    const { app, h } = setup();
    const body = waBody("What are your opening hours?");
    const bad = await app.inject({ method: "POST", url: "/in/demo-clinic/whatsapp", payload: body, headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: "POST", url: "/in/demo-clinic/whatsapp", payload: body, headers: { "content-type": "application/json", "x-hub-signature-256": metaSig(body) } });
    expect(good.statusCode).toBe(200);
    await waitFor(() => h.channels.to("+61411111111").length > 0);
    const sent = h.channels.to("+61411111111");
    expect(sent[0]?.text).toMatch(/Mon–Tue 8am–6pm/);
    expect([...h.store.contacts.values()][0]).toMatchObject({ phone: "+61411111111", name: "Alex" });
  });

  it("returns 404 for unknown clients", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "POST", url: "/in/nobody/whatsapp", payload: "{}" })).statusCode).toBe(404);
  });
});

describe("Twilio webhooks", () => {
  const sign = (url: string, params: Record<string, string>) =>
    createHmac("sha1", "twilio-token").update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");

  it("accepts signed inbound SMS and replies via the REST API", async () => {
    const { app, h } = setup();
    const params = { From: "+61411111111", To: "+61400000001", Body: "hi, where do I park?", MessageSid: "SM9" };
    const res = await app.inject({
      method: "POST", url: "/in/demo-clinic/sms", payload: new URLSearchParams(params).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sign(`${TEST_ENV.publicBaseUrl}/in/demo-clinic/sms`, params) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("<Response/>");
    await waitFor(() => h.channels.to("+61411111111").length > 0);
    expect(h.channels.to("+61411111111").at(-1)?.text).toMatch(/Wilson car park/);
  });

  it("rejects unsigned SMS", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/in/demo-clinic/sms", payload: "From=%2B61411111111&Body=hi", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(res.statusCode).toBe(401);
  });

  it("answers a forwarded missed call with TwiML", async () => {
    const { app } = setup();
    const params = { From: "+61411111111", CallSid: "CA1", CallStatus: "ringing" };
    const res = await app.inject({
      method: "POST", url: "/in/demo-clinic/voice", payload: new URLSearchParams(params).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sign(`${TEST_ENV.publicBaseUrl}/in/demo-clinic/voice`, params) },
    });
    expect(res.body).toMatch(/^<Response><Say>Sorry we missed your call to Harbourside Dental/);
  });
});

describe("web chat, leads and jobs", () => {
  it("issues a session for an allowed origin and answers inline", async () => {
    const { app, h } = setup();
    await h.loadFaq();
    const headers = { origin: "https://example.com", "content-type": "application/json" };
    const denied = await app.inject({ method: "POST", url: "/in/demo-clinic/webchat/session", headers: { ...headers, origin: "https://evil.example" } });
    expect(denied.statusCode).toBe(403);
    const session = await app.inject({ method: "POST", url: "/in/demo-clinic/webchat/session", headers });
    const { token } = session.json() as { token: string };
    expect(session.headers["access-control-allow-origin"]).toBe("https://example.com");
    const chat = await app.inject({ method: "POST", url: "/in/demo-clinic/webchat", headers, payload: JSON.stringify({ token, text: "Do you see children?" }) });
    expect((chat.json() as { replies: string[] }).replies[0]).toMatch(/from age 2/);
  });

  it("requires the per-client token on lead forms", async () => {
    const { app } = setup();
    const payload = JSON.stringify({ name: "Priya", phone: "+61422222222", consent_marketing: true });
    expect((await app.inject({ method: "POST", url: "/in/demo-clinic/lead?token=x", payload, headers: { "content-type": "application/json" } })).statusCode).toBe(401);
    const token = derivedToken(TEST_ENV.coreSecret, "lead", "demo-clinic");
    const ok = await app.inject({ method: "POST", url: `/in/demo-clinic/lead?token=${token}`, payload, headers: { "content-type": "application/json" } });
    expect(ok.json()).toMatchObject({ ok: true, responded_via: "sms" });
  });

  it("protects job endpoints with the bearer token", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "POST", url: "/v1/jobs/tick" })).statusCode).toBe(401);
    const ok = await app.inject({ method: "POST", url: "/v1/jobs/tick", headers: { authorization: `Bearer ${TEST_ENV.jobToken}` } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ clients: 1, errors: [] });
  });
});
