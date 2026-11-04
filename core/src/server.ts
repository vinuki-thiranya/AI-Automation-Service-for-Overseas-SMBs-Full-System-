// HTTP surface of nuvadesk-core. Caddy routes https://ops.<DOMAIN>/in/* and /widget.js here.
//   /in/:client/whatsapp   GET verify + POST messages (Meta signature)
//   /in/:client/sms        Twilio inbound SMS (Twilio signature)
//   /in/:client/voice      Twilio voice for forwarded missed calls → TwiML + text-back
//   /in/:client/webchat    widget API (session token + origin allow-list)
//   /in/:client/telegram   staff escalation group (secret token header)
//   /in/:client/lead       lead forms (?token=)
//   /in/:client/health     Uptime Kuma per-client check
//   /v1/jobs/*             n8n schedules (bearer CORE_JOB_TOKEN)
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { REPO_ROOT } from "./config/index.ts";
import { makeCtx, type Ctx, type Deps } from "./context.ts";
import { handleInbound, handleLeadIntake, handleMissedCall, handleTelegramUpdate, type LeadIntake } from "./ingest/handlers.ts";
import { parseTwilioSms, parseWhatsApp, type InboundMessage, type TelegramUpdate } from "./ingest/normalize.ts";
import {
  derivedToken, issueWebchatToken, originAllowed, readWebchatToken, verifyDerivedToken, verifyMetaSignature, verifyTwilioSignature,
} from "./ingest/verify.ts";
import { runNightly, runReports, runTick } from "./jobs.ts";
import { getJsonSecret } from "./secrets.ts";
import { errorMessage, safeEqual } from "./util.ts";

type Req = FastifyRequest<{ Params: { client: string }; Querystring: Record<string, string | undefined> }>;

function rawBody(req: FastifyRequest): Buffer {
  return Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
}

function formParams(raw: Buffer): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
}

function jsonBody<T>(raw: Buffer): T | null {
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function buildServer(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 1_048_576, trustProxy: true });

  // Keep every body raw: signature checks need the exact bytes; routes parse after verifying.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  const widget = (() => {
    try {
      return readFileSync(path.join(REPO_ROOT, "webchat/widget.js"), "utf8");
    } catch {
      return "console.error('nuvadesk widget missing');";
    }
  })();

  /** Resolve the client from the path; 404 for unknown or inactive clients. */
  async function clientCtx(req: Req, reply: FastifyReply): Promise<Ctx | null> {
    const slug = req.params.client;
    const found = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? await deps.findClient(slug) : null;
    if (!found || found.client.status === "offboarded" || found.client.status === "paused") {
      await reply.code(404).send({ error: "unknown client" });
      return null;
    }
    return makeCtx(deps, found.client, found.store);
  }

  /** Acknowledge fast, then process: providers retry on slow responses. */
  function background(ctx: Ctx, what: string, work: () => Promise<unknown>) {
    setImmediate(() => {
      work().catch(async (err) => {
        app.log.error({ client: ctx.client.slug, what, err: errorMessage(err) }, "background processing failed");
        await deps.alerts.recordFailure(ctx.client, what, err);
      });
    });
  }

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/widget.js", async (_req, reply) => reply.type("application/javascript; charset=utf-8").header("Cache-Control", "public, max-age=300").send(widget));

  app.get("/in/:client/health", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    return { ok: true, client: ctx.client.slug, status: ctx.client.status, degraded: deps.alerts.isDegraded(ctx.client) };
  });

  // ------------------------------------------------------------------ WhatsApp
  app.get("/in/:client/whatsapp", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    const q = req.query;
    if (q["hub.mode"] === "subscribe" && verifyDerivedToken(deps.env.coreSecret, "wa-verify", ctx.client.slug, q["hub.verify_token"])) {
      return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    }
    return reply.code(403).send("forbidden");
  });

  app.post("/in/:client/whatsapp", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    const raw = rawBody(req);
    if (!verifyMetaSignature(deps.env.metaAppSecret, raw, req.headers["x-hub-signature-256"] as string | undefined)) {
      return reply.code(401).send({ error: "bad signature" });
    }
    const { messages, statuses } = parseWhatsApp(jsonBody(raw), ctx.client.config.channels.whatsapp?.phone_number_id);
    background(ctx, "whatsapp inbound", async () => {
      for (const s of statuses.filter((s) => s.status === "failed")) {
        await ctx.store.audit(ctx.client.id, "core:whatsapp", "delivery_failed", { message: s.providerMessageId, errors: s.errors });
      }
      for (const m of messages) await handleInbound(ctx, m);
    });
    return reply.send({ ok: true });
  });

  // ------------------------------------------------------------------ Twilio (SMS + voice)
  async function twilioVerified(ctx: Ctx, req: Req, params: Record<string, string>): Promise<boolean> {
    const ref = ctx.client.config.channels.sms?.credential;
    if (!ref) return false;
    const { auth_token } = await getJsonSecret<{ auth_token: string }>(deps.secrets, ref);
    return verifyTwilioSignature(auth_token, `${deps.env.publicBaseUrl}${req.url}`, params, req.headers["x-twilio-signature"] as string | undefined);
  }

  app.post("/in/:client/sms", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    const params = formParams(rawBody(req));
    if (!(await twilioVerified(ctx, req, params))) return reply.code(401).send("bad signature");
    const msg = parseTwilioSms(params, ctx.now());
    background(ctx, "sms inbound", () => handleInbound(ctx, msg));
    return reply.type("text/xml").send("<Response/>");
  });

  app.post("/in/:client/voice", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    const params = formParams(rawBody(req));
    if (!(await twilioVerified(ctx, req, params))) return reply.code(401).send("bad signature");
    const delay = (ctx.client.config.channels.missed_call?.text_back_delay_seconds ?? 10) * 1000;
    setTimeout(() => background(ctx, "missed call", () => handleMissedCall(ctx, params)), delay);
    const say = `Sorry we missed your call to ${ctx.client.config.name}. We've just sent you a text message so we can help you straight away. Goodbye.`;
    return reply.type("text/xml").send(`<Response><Say>${say.replace(/[<>&]/g, "")}</Say><Hangup/></Response>`);
  });

  // ------------------------------------------------------------------ Web chat
  function cors(ctx: Ctx, req: FastifyRequest, reply: FastifyReply): boolean {
    const origin = req.headers.origin;
    if (!originAllowed(ctx.client.config.channels.webchat?.allowed_origins, origin)) return false;
    reply.header("Access-Control-Allow-Origin", origin!).header("Vary", "Origin")
      .header("Access-Control-Allow-Headers", "Content-Type").header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return true;
  }

  app.options("/in/:client/webchat*", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    return cors(ctx, req, reply) ? reply.code(204).send() : reply.code(403).send();
  });

  app.post("/in/:client/webchat/session", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    if (!ctx.client.config.channels.webchat?.enabled || !cors(ctx, req, reply)) return reply.code(403).send({ error: "origin not allowed" });
    const token = issueWebchatToken(deps.env.coreSecret, ctx.client.slug, randomUUID(), ctx.now());
    return { token, assistant: ctx.client.config.assistant.persona_name, business: ctx.client.config.name, accent: ctx.client.config.channels.webchat.accent_color ?? "#0E7C86" };
  });

  app.post("/in/:client/webchat", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    if (!ctx.client.config.channels.webchat?.enabled || !cors(ctx, req, reply)) return reply.code(403).send({ error: "origin not allowed" });
    const body = jsonBody<{ token?: string; text?: string; name?: string; email?: string; phone?: string }>(rawBody(req));
    const session = readWebchatToken(deps.env.coreSecret, ctx.client.slug, body?.token, ctx.now());
    const text = body?.text?.trim().slice(0, 2000);
    if (!session || !text) return reply.code(400).send({ error: "invalid session or empty message" });
    const msg: InboundMessage = {
      channel: "webchat", externalId: session, providerMessageId: randomUUID(), text, timestamp: ctx.now().toISOString(),
      name: body?.name ?? null, email: body?.email ?? null, phone: null, attachments: [], buttonPayload: null, metadata: { ip: req.ip },
    };
    const out = await handleInbound(ctx, msg);
    deps.webchat.drain(session);   // replies are returned inline; clear the poll queue of the same messages
    return { replies: out.turn?.replies ?? [] };
  });

  app.get("/in/:client/webchat/poll", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    if (!cors(ctx, req, reply)) return reply.code(403).send({ error: "origin not allowed" });
    const session = readWebchatToken(deps.env.coreSecret, ctx.client.slug, req.query.token, ctx.now());
    if (!session) return reply.code(400).send({ error: "invalid session" });
    return { messages: deps.webchat.drain(session) };
  });

  // ------------------------------------------------------------------ Telegram staff group
  app.post("/in/:client/telegram", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    if (!verifyDerivedToken(deps.env.coreSecret, "telegram", ctx.client.slug, req.headers["x-telegram-bot-api-secret-token"] as string | undefined)) {
      return reply.code(401).send({ error: "bad token" });
    }
    const update = jsonBody<TelegramUpdate>(rawBody(req));
    if (update) background(ctx, "telegram update", () => handleTelegramUpdate(ctx, update));
    return { ok: true };
  });

  // ------------------------------------------------------------------ Lead forms
  app.post("/in/:client/lead", async (req: Req, reply) => {
    const ctx = await clientCtx(req, reply);
    if (!ctx) return;
    if (!verifyDerivedToken(deps.env.coreSecret, "lead", ctx.client.slug, req.query.token)) return reply.code(401).send({ error: "bad token" });
    const raw = rawBody(req);
    const ct = String(req.headers["content-type"] ?? "");
    const body = (ct.includes("json") ? jsonBody<LeadIntake>(raw) : formParams(raw)) as (LeadIntake & Record<string, unknown>) | null;
    if (!body) return reply.code(400).send({ error: "unreadable body" });
    const consent = body.consent_marketing === true || ["true", "on", "yes", "1"].includes(String(body.consent_marketing ?? "").toLowerCase());
    try {
      const res = await handleLeadIntake(ctx, { ...body, consent_marketing: consent });
      return { ok: true, ...res };
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });

  // ------------------------------------------------------------------ Jobs (n8n schedules)
  function jobAuth(req: FastifyRequest): boolean {
    const header = String(req.headers.authorization ?? "");
    return !!deps.env.jobToken && safeEqual(header, `Bearer ${deps.env.jobToken}`);
  }
  for (const [name, run] of [["tick", runTick], ["nightly", runNightly], ["reports", runReports]] as const) {
    app.post(`/v1/jobs/${name}`, async (req, reply) => {
      if (!jobAuth(req)) return reply.code(401).send({ error: "unauthorized" });
      const report = await run(deps);
      if (report.errors.length) app.log.warn({ job: name, errors: report.errors }, "job finished with errors");
      return report;
    });
  }

  return app;
}

export { derivedToken };
