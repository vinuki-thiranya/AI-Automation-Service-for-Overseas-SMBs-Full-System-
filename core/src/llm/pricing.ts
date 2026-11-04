// USD per million tokens. Used for usage_events (pass-through billing at cost + 20%) and spend caps.
// Anthropic: first-party API list prices as of 2026-10. OpenAI: developers.openai.com/api/docs/pricing,
// standard tier, short context (<= 272K input), checked 2026-11-04.
interface Price {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4.0, output: 20.0, cacheRead: 0.2, cacheWrite: 5.0 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "gpt-5-mini": { input: 0.25, output: 2.0, cacheRead: 0.025 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

const UNKNOWN: Price = { input: 5, output: 25 };   // deliberately high so unknown models never under-bill

export function costUsd(model: string, t: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): number {
  const p = PRICES[model] ?? UNKNOWN;
  const usd =
    t.input * p.input +
    t.output * p.output +
    (t.cacheRead ?? 0) * (p.cacheRead ?? p.input) +
    (t.cacheWrite ?? 0) * (p.cacheWrite ?? p.input);
  return Math.round((usd / 1_000_000) * 1e6) / 1e6;
}
