import { readClientConfigFile, type ClientConfig } from "../src/config/index.ts";

export function demoConfig(overrides: (c: ClientConfig) => void = () => {}): ClientConfig {
  const config = structuredClone(readClientConfigFile(new URL("../../config/clients/demo-clinic.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
  overrides(config);
  return config;
}

/** Tuesday 10 Nov 2026, 11:00 in Sydney (AEDT, UTC+11). */
export const TUESDAY_11AM_SYDNEY = new Date("2026-11-10T00:00:00Z");

type Route = { method?: string; match: RegExp; status?: number; body: unknown | ((url: string, init: RequestInit | undefined) => unknown) };

/** Minimal fetch double: first matching route wins; every call is recorded. */
export function fakeFetch(routes: Route[]) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* form body stays a string */ }
    }
    calls.push({ method, url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes.find((r) => (r.method ?? method) === method && r.match.test(url));
    if (!route) return new Response(JSON.stringify({ error: `no route for ${method} ${url}` }), { status: 599 });
    const payload = typeof route.body === "function" ? (route.body as (u: string, i?: RequestInit) => unknown)(url, init) : route.body;
    return new Response(JSON.stringify(payload), { status: route.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}
