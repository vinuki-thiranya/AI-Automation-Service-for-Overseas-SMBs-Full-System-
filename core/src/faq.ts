// FAQ ingestion for retrieval (spec §4.2): split sources into question-sized chunks, embed, replace.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClientConfig } from "./config/index.ts";
import { REPO_ROOT } from "./config/index.ts";
import type { Embedder, UsageEntry } from "./llm/types.ts";
import type { Store } from "./store/types.ts";
import type { FetchLike } from "./util.ts";

const MAX_CHUNK = 900;

/** One chunk per "## heading" section; long sections are split on paragraphs. */
export function chunkMarkdown(text: string, source: string): { source: string; content: string }[] {
  const sections = text.split(/\n(?=#{2,3}\s)/).map((s) => s.trim()).filter(Boolean);
  const out: { source: string; content: string }[] = [];
  for (const section of sections) {
    if (/^#\s/.test(section) && !section.includes("\n")) continue;   // document title only
    if (section.length <= MAX_CHUNK) {
      out.push({ source, content: section });
      continue;
    }
    const heading = section.match(/^#{2,3}\s.*$/m)?.[0] ?? "";
    let current = "";
    for (const para of section.split(/\n{2,}/)) {
      if ((current + "\n\n" + para).length > MAX_CHUNK && current) {
        out.push({ source, content: current.trim() });
        current = heading && !para.startsWith("#") ? `${heading}\n${para}` : para;
      } else {
        current = current ? `${current}\n\n${para}` : para;
      }
    }
    if (current.trim()) out.push({ source, content: current.trim() });
  }
  return out;
}

/** Plain text from an HTML page: enough for FAQ pages and price lists. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h[1-3][^>]*>/gi, "\n## ").replace(/<\/h[1-3]>/gi, "\n")
    .replace(/<(br|\/p|\/li|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export async function loadFaqSources(config: ClientConfig, fetchFn: FetchLike = fetch): Promise<{ source: string; content: string }[]> {
  const chunks: { source: string; content: string }[] = [];
  for (const src of config.business.faq_sources ?? []) {
    let text: string;
    if (src.type === "file") text = readFileSync(path.resolve(REPO_ROOT, src.ref), "utf8");
    else if (src.type === "url") text = htmlToText(await (await fetchFn(src.ref, { signal: AbortSignal.timeout(20_000) })).text());
    else text = src.ref;
    chunks.push(...chunkMarkdown(text, src.type === "inline" ? "inline" : src.ref));
  }
  return chunks;
}

export async function embedFaq(store: Store, clientId: string, embedder: Embedder, chunks: { source: string; content: string }[]): Promise<{ chunks: number; usage: UsageEntry[] }> {
  const usage: UsageEntry[] = [];
  const rows: { source: string; content: string; embedding: number[] }[] = [];
  for (let i = 0; i < chunks.length; i += 64) {
    const batch = chunks.slice(i, i + 64);
    const res = await embedder.embed(batch.map((c) => c.content));
    usage.push(...res.usage);
    batch.forEach((c, j) => rows.push({ ...c, embedding: res.vectors[j]! }));
  }
  await store.replaceFaqChunks(clientId, rows);
  return { chunks: rows.length, usage };
}
